import { useOutletContext } from 'react-router-dom';
import { BrandSettings } from '../features/settings/BrandSettings.js';

interface OutletCtx {
  me: { userId: string; role: 'admin' | 'editor' };
}

export function BrandSettingsPage() {
  const { me } = useOutletContext<OutletCtx>();

  // Admin-only (SYS-39): identidade é configuração da instância, não estrutura
  // de conteúdo — o mesmo gate de `UploadTokensPage`, espelhando o
  // `adminProcedure` do router.
  if (me.role !== 'admin') {
    return (
      <p role="alert" style={{ color: '#b00020' }}>
        Access denied — this area is admin-only.
      </p>
    );
  }
  return <BrandSettings />;
}
