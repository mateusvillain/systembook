/**
 * 404 da doc pública. Extraído do `PublicPageView` (SYS-37) porque o
 * `LegacyDocsRedirect` chega ao mesmo estado por outro caminho — um path
 * antigo que não resolve para nenhuma página.
 */
export function DocsNotFound() {
  return (
    <div data-testid="public-not-found">
      <h1 className="sb-public-title">Page not found</h1>
      <p style={{ color: '#666' }}>This page does not exist or the address has changed.</p>
    </div>
  );
}
