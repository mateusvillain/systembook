import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, useTRPC, type RouterOutput } from '../../lib/trpc.js';

type TokenRow = RouterOutput['uploadTokens']['list'][number];

/**
 * Gestão de tokens de upload de CI (TASK-44). O token em claro só existe na
 * resposta do create — o reveal único abaixo é a única chance de copiá-lo.
 */
export function UploadTokens() {
  const trpc = useTRPC();
  const tokens = useQuery(trpc.uploadTokens.list.queryOptions());
  const [revealed, setRevealed] = useState<{ label: string; token: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries(trpc.uploadTokens.list.queryFilter());

  const revoke = useMutation(trpc.uploadTokens.revoke.mutationOptions({ onSuccess: invalidate }));

  return (
    <section style={{ display: 'grid', gap: '1.5rem' }}>
      <h1 style={{ margin: 0 }}>Tokens de upload</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Tokens autenticam o CI do time no envio de artefatos de preview (
        <code>POST /api/previews</code>). Gere um por pipeline e revogue-o se vazar.
      </p>

      {revealed && (
        <TokenReveal
          label={revealed.label}
          token={revealed.token}
          onDismiss={() => setRevealed(null)}
        />
      )}

      <CreateTokenForm
        onCreated={(created) => {
          setRevealed(created);
          void invalidate();
        }}
      />

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
            <th style={{ padding: '0.5rem' }}>Label</th>
            <th style={{ padding: '0.5rem' }}>Criado em</th>
            <th style={{ padding: '0.5rem' }}>Status</th>
            <th style={{ padding: '0.5rem' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {(tokens.data ?? []).map((token) => (
            <TokenTableRow
              key={token.id}
              token={token}
              onRevoke={() => {
                if (window.confirm(`Revogar o token "${token.label}"? O CI que o usa vai parar de conseguir publicar previews.`)) {
                  revoke.mutate({ tokenId: token.id });
                }
              }}
            />
          ))}
        </tbody>
      </table>
      {tokens.isPending && <p>Carregando tokens…</p>}
      {tokens.data?.length === 0 && <p style={{ color: '#666' }}>Nenhum token gerado ainda.</p>}
    </section>
  );
}

function TokenTableRow({ token, onRevoke }: { token: TokenRow; onRevoke: () => void }) {
  const revogado = token.revogadoEm != null;
  return (
    <tr style={{ borderBottom: '1px solid #eee', opacity: revogado ? 0.6 : 1 }}>
      <td style={{ padding: '0.5rem' }}>{token.label}</td>
      <td style={{ padding: '0.5rem' }}>{new Date(token.criadoEm).toLocaleString()}</td>
      <td style={{ padding: '0.5rem' }}>
        {revogado ? `Revogado em ${new Date(token.revogadoEm!).toLocaleString()}` : 'Ativo'}
      </td>
      <td style={{ padding: '0.5rem' }}>
        {!revogado && (
          <button type="button" onClick={onRevoke}>
            Revogar
          </button>
        )}
      </td>
    </tr>
  );
}

function TokenReveal({
  label,
  token,
  onDismiss,
}: {
  label: string;
  token: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      role="alert"
      data-token-reveal
      style={{
        background: '#fff8e1',
        border: '1px solid #f0c36d',
        padding: '1rem',
        display: 'grid',
        gap: '0.5rem',
      }}
    >
      <strong>Token "{label}" gerado — copie agora.</strong>
      <span>
        Este valor <strong>não será mostrado de novo</strong>: só o hash fica armazenado.
      </span>
      <code
        data-token-value
        style={{
          background: '#fff',
          border: '1px solid #ddd',
          padding: '0.5rem',
          wordBreak: 'break-all',
          userSelect: 'all',
        }}
      >
        {token}
      </code>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(token).then(() => setCopied(true));
          }}
        >
          {copied ? 'Copiado ✓' : 'Copiar'}
        </button>
        <button type="button" onClick={onDismiss}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function CreateTokenForm({ onCreated }: { onCreated: (r: { label: string; token: string }) => void }) {
  const trpc = useTRPC();
  const [label, setLabel] = useState('');
  const create = useMutation(
    trpc.uploadTokens.create.mutationOptions({
      onSuccess: (created) => {
        setLabel('');
        onCreated(created);
      },
    }),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (label.trim()) create.mutate({ label: label.trim() });
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <label htmlFor="token-label">Novo token:</label>
      <input
        id="token-label"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="ex.: GitHub Actions do design system"
        style={{ flex: 1, maxWidth: 360, padding: '0.35rem' }}
      />
      <button type="submit" disabled={create.isPending || !label.trim()}>
        Gerar token
      </button>
    </form>
  );
}
