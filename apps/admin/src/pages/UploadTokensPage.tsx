import { useOutletContext } from 'react-router-dom';
import { UploadTokens } from '../features/settings/UploadTokens.js';
import { useT } from '../i18n/AdminLocale.js';

interface OutletCtx {
  me: { userId: string; role: 'admin' | 'editor' };
}

export function UploadTokensPage() {
  const { me } = useOutletContext<OutletCtx>();
  const t = useT();

  // Admin-only (nota da TASK-44): o token dá escrita externa via CI.
  if (me.role !== 'admin') {
    return (
      <p role="alert" style={{ color: '#b00020' }}>
        {t('common.accessDenied')}
      </p>
    );
  }
  return <UploadTokens />;
}
