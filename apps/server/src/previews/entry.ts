import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { PreviewConfig } from '@systembook/schema';

/**
 * Localiza o `index.html` da variante dentro de um artefato de preview já
 * extraído (TASK-47). O connector (TASK-41) grava o artefato com o layout
 * `<entryDir>/index.html` + `assets/` irmão, e o upload (TASK-43) o extrai em
 * `<previewsRoot>/<component>/<variant>/<sha>/`. O par (componente, variante)
 * não conhece o slug do `entryDir`, então descobrimos o HTML em disco.
 *
 * Estratégia: primeiro um `index.html` na raiz do artefato (layout plano);
 * senão o único subdiretório que contém `index.html` (o `entryDir` do
 * connector). Retorna o caminho **relativo** ao artefato em posix (ex.:
 * `button--primary/index.html`) para compor a URL da rota da TASK-46, ou
 * `null` se o registro existe mas os arquivos sumiram/estão corrompidos.
 */
export async function resolvePreviewEntry(
  previewsRoot: string,
  pathEstatico: string,
): Promise<string | null> {
  const artifactDir = path.join(previewsRoot, ...pathEstatico.split('/'));

  let entries;
  try {
    entries = await readdir(artifactDir, { withFileTypes: true });
  } catch {
    return null;
  }

  if (entries.some((e) => e.isFile() && e.name === 'index.html')) {
    return 'index.html';
  }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const stats = await stat(path.join(artifactDir, e.name, 'index.html'));
      if (stats.isFile()) return `${e.name}/index.html`;
    } catch {
      // sem index.html neste subdir — segue procurando
    }
  }

  return null;
}

/**
 * Lê o `preview-config.json` que o connector (TASK-49) grava ao lado do
 * `index.html` da variante. `entryRelPath` é o retorno de `resolvePreviewEntry`
 * (ex.: `button--primary/index.html`); o config fica no mesmo diretório.
 * Retorna `null` se o arquivo não existir ou não for JSON válido — o painel de
 * controles simplesmente não aparece (artefatos antigos, pré-TASK-49).
 */
export async function readPreviewConfig(
  previewsRoot: string,
  pathEstatico: string,
  entryRelPath: string,
): Promise<PreviewConfig | null> {
  const configPath = path.join(
    previewsRoot,
    ...pathEstatico.split('/'),
    path.dirname(entryRelPath),
    'preview-config.json',
  );
  try {
    return JSON.parse(await readFile(configPath, 'utf8')) as PreviewConfig;
  } catch {
    return null;
  }
}
