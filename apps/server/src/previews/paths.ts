import path from 'node:path';

/**
 * Construção de caminhos dentro do volume de previews — ponto único
 * compartilhado entre o upload (TASK-43) e a rota de leitura (TASK-46), para
 * que a proteção contra path traversal não exista em duas versões.
 *
 * Layout: `<previewsRoot>/<component>/<variant>/<commitSha>/<...artefato>`.
 */

/**
 * Segmento de path seguro (nota de segurança da TASK-43): tudo que vem do
 * request e vira caminho passa por aqui. Sem separadores, sem começar com
 * ponto (elimina '..' e ocultos), charset restrito, tamanho limitado.
 */
const SAFE_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function isSafeSegment(value: string): boolean {
  return SAFE_SEGMENT_RE.test(value) && !value.includes('..');
}

/**
 * Resolve `segments` dentro de `previewsRoot`. Retorna `null` se algum
 * segmento for inseguro ou se o caminho final escapar do root (defesa em
 * profundidade: a checagem de charset já barra `..`, mas o resolve/startsWith
 * é o que garante a fronteira).
 */
export function resolvePreviewPath(previewsRoot: string, segments: string[]): string | null {
  if (segments.length === 0 || !segments.every(isSafeSegment)) return null;

  const root = path.resolve(previewsRoot);
  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;

  return resolved;
}
