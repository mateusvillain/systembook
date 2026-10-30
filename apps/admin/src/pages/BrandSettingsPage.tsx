import { useOutletContext } from 'react-router-dom';
import { BrandSettings } from '../features/settings/BrandSettings.js';
import { useT } from '../i18n/AdminLocale.js';

interface OutletCtx {
  me: { userId: string; role: 'admin' | 'editor' };
}

export function BrandSettingsPage() {
  const { me } = useOutletContext<OutletCtx>();
  const t = useT();

  // Admin-only (SYS-39): identidade é configuração da instância, não estrutura
  // de conteúdo — o mesmo gate de `UploadTokensPage`, espelhando o
  // `adminProcedure` do router.
  if (me.role !== 'admin') {
    return (
      <p role="alert" style={{ color: '#b00020' }}>
        {t('common.accessDenied')}
      </p>
    );
  }
  return <BrandSettings />;
}
