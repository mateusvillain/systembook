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
 * Uso: node scripts/apply-publish-config.mjs <pasta do deploy>
 */
import { readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const deployDir = process.argv[2];
if (!deployDir) {
  console.error('uso: apply-publish-config.mjs <pasta do deploy>');
  process.exit(1);
}

const scopeDir = path.join(deployDir, 'node_modules', '@systembook');
for (const name of await readdir(scopeDir)) {
  const file = path.join(await realpath(path.join(scopeDir, name)), 'package.json');
  const pkg = JSON.parse(await readFile(file, 'utf8'));
  if (!pkg.publishConfig) continue;
  const { access: _access, registry: _registry, ...fields } = pkg.publishConfig;
  delete pkg.publishConfig;
  // O deploy pode criar os arquivos como hardlinks do workspace: escrever por
  // cima mudaria o package.json do repositório. Apagar antes quebra o link.
  await rm(file);
  await writeFile(file, `${JSON.stringify({ ...pkg, ...fields }, null, 2)}\n`);
  console.log(`[apply-publish-config] @systembook/${name}: ${Object.keys(fields).join(', ')}`);
}
