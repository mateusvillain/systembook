#!/usr/bin/env node
/**
 * Aplica o `publishConfig` dos pacotes do workspace copiados num
 * `pnpm deploy` (SYS-142). Dentro do monorepo o `exports` de cada pacote
 * aponta para `src/` (TypeScript, sem build); o publicado aponta para `dist/`
 * pelo `publishConfig`, que só o `pnpm pack`/`publish` aplica. O deploy copia
 * o pacote como está no workspace, e o Node de produção não executa `.ts`
 * dentro de `node_modules` — então o Dockerfile builda o pacote e roda isto
 * na pasta do deploy, fazendo a mesma troca que o `pack` faria.
 *
 * Só troca os campos de resolução de módulo, e só em pacote buildado (com
 * `dist/`): um pacote types-only sem build (`@systembook/schema`) fica como
 * está — apontar para um `dist/` inexistente quebraria quem o importasse.
 *
 * Uso: node scripts/apply-publish-config.mjs <pasta do deploy>
 */
import { access, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RESOLUTION_FIELDS = ['main', 'types', 'exports'];

const deployDir = process.argv[2];
if (!deployDir) {
  console.error('uso: apply-publish-config.mjs <pasta do deploy>');
  process.exit(1);
}

const exists = (p) => access(p).then(() => true, () => false);

const scopeDir = path.join(deployDir, 'node_modules', '@systembook');
if (!(await exists(scopeDir))) {
  console.error(`[apply-publish-config] ${scopeDir} não existe — o deploy rodou?`);
  process.exit(1);
}

for (const name of await readdir(scopeDir)) {
  const dir = await realpath(path.join(scopeDir, name));
  const file = path.join(dir, 'package.json');
  const pkg = JSON.parse(await readFile(file, 'utf8'));
  if (!pkg.publishConfig) continue;
  if (pkg.publishConfig.bin) {
    // Os shims de `.bin` já foram criados apontando para o `bin` de antes.
    console.error(`[apply-publish-config] @systembook/${name}: publishConfig.bin não é suportado aqui.`);
    process.exit(1);
  }
  if (!(await exists(path.join(dir, 'dist')))) {
    console.log(`[apply-publish-config] @systembook/${name}: sem dist/, mantido (types-only?)`);
    continue;
  }
  const fields = Object.fromEntries(RESOLUTION_FIELDS.filter((k) => k in pkg.publishConfig).map((k) => [k, pkg.publishConfig[k]]));
  // O deploy pode criar os arquivos como hardlinks do workspace: escrever por
  // cima mudaria o package.json do repositório. Apagar antes quebra o link.
  await rm(file);
  await writeFile(file, `${JSON.stringify({ ...pkg, ...fields }, null, 2)}\n`);
  console.log(`[apply-publish-config] @systembook/${name}: ${Object.keys(fields).join(', ')} → dist/`);
}
