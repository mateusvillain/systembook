/**
 * Endereço de uma rota da instância CMS (`export`, `import`, `tokens`): o
 * caminho entra **abaixo** da URL informada, para instância servida num
 * subcaminho (`https://acme.dev/docs-cms` → `…/docs-cms/api/tokens`).
 */
export function instanceEndpoint(base: URL, route: string): URL {
  return new URL(route, base.href.endsWith('/') ? base : `${base.href}/`);
}
