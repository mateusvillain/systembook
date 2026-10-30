import { useMessages } from '../i18n/UiLocale.js';
/**
 * 404 da doc pública. Extraído do `PublicPageView` (SYS-37) porque o
 * `LegacyDocsRedirect` chega ao mesmo estado por outro caminho — um path
 * antigo que não resolve para nenhuma página.
 */
export function DocsNotFound() {
  const t = useMessages();
  return (
    <div data-testid="public-not-found">
      <h1 className="sb-public-title">{t('page.notFoundTitle')}</h1>
      <p style={{ color: '#666' }}>{t('page.notFound')}</p>
    </div>
  );
}
