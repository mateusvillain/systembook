import { useOutletContext } from 'react-router-dom';
import { UploadTokens } from '../features/settings/UploadTokens.js';

interface OutletCtx {
  me: { userId: string; role: 'admin' | 'editor' };
}

export function UploadTokensPage() {
  const { me } = useOutletContext<OutletCtx>();

  // Admin-only (nota da TASK-44): o token dá escrita externa via CI.
  if (me.role !== 'admin') {
    return (
      <p role="alert" style={{ color: '#b00020' }}>
        Acesso negado — esta área é exclusiva de administradores.
      </p>
    );
  }
  return <UploadTokens />;
}
