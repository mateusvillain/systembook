import { useState, type FormEvent } from 'react';
import { TRPCClientError } from '@trpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { queryClient, useTRPC } from '../lib/trpc.js';

interface OutletCtx {
  me: { userId: string; role: 'admin' | 'editor' };
}

type Role = 'admin' | 'editor';

export function UsersPage() {
  const { me } = useOutletContext<OutletCtx>();

  // Gestão de usuários é admin-only independente da decisão de CRUD de editores (TASK-13)
  if (me.role !== 'admin') {
    return (
      <p role="alert" style={{ color: '#b00020' }}>
        Acesso negado — esta área é exclusiva de administradores.
      </p>
    );
  }
  return <UsersAdmin meUserId={me.userId} />;
}

function UsersAdmin({ meUserId }: { meUserId: string }) {
  const trpc = useTRPC();
  const users = useQuery(trpc.users.list.queryOptions());
  const [banner, setBanner] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries(trpc.users.list.queryFilter());

  const update = useMutation(trpc.users.update.mutationOptions({ onSuccess: invalidate }));
  const deactivate = useMutation(trpc.users.deactivate.mutationOptions({ onSuccess: invalidate }));

  return (
    <section style={{ display: 'grid', gap: '1.5rem' }}>
      <h1 style={{ margin: 0 }}>Usuários</h1>
      {banner && (
        <p role="status" style={{ background: '#e6f4ea', padding: '0.5rem 0.75rem', margin: 0 }}>
          {banner}
        </p>
      )}

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
            <th style={{ padding: '0.5rem' }}>Nome</th>
            <th style={{ padding: '0.5rem' }}>Email</th>
            <th style={{ padding: '0.5rem' }}>Role</th>
            <th style={{ padding: '0.5rem' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {(users.data ?? []).map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === meUserId}
              onChangeRole={(role) => update.mutate({ userId: user.id, role })}
              onDeactivate={() => deactivate.mutate({ userId: user.id })}
              onPasswordReset={() => setBanner('Senha redefinida com sucesso')}
            />
          ))}
        </tbody>
      </table>
      {users.isPending && <p>Carregando usuários…</p>}

      <CreateUserForm onCreated={invalidate} />
    </section>
  );
}

interface UserRowProps {
  user: { id: string; nome: string; email: string; role: Role };
  isSelf: boolean;
  onChangeRole: (role: Role) => void;
  onDeactivate: () => void;
  onPasswordReset: () => void;
}

function UserRow({ user, isSelf, onChangeRole, onDeactivate, onPasswordReset }: UserRowProps) {
  const trpc = useTRPC();
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const reset = useMutation(
    trpc.users.resetPassword.mutationOptions({
      onSuccess: () => {
        // Nunca ecoar a senha de volta — só confirmação (TASK-15)
        setResetting(false);
        setNewPassword('');
        onPasswordReset();
      },
    }),
  );

  return (
    <tr style={{ borderBottom: '1px solid #eee' }} data-email={user.email}>
      <td style={{ padding: '0.5rem' }}>{user.nome}</td>
      <td style={{ padding: '0.5rem' }}>{user.email}</td>
      <td style={{ padding: '0.5rem' }}>
        <select
          value={user.role}
          disabled={isSelf}
          onChange={(e) => onChangeRole(e.target.value as Role)}
          aria-label={`Role de ${user.email}`}
        >
          <option value="admin">admin</option>
          <option value="editor">editor</option>
        </select>
      </td>
      <td style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {resetting ? (
          <form
            style={{ display: 'flex', gap: '0.5rem' }}
            onSubmit={(e) => {
              e.preventDefault();
              reset.mutate({ userId: user.id, newPassword });
            }}
          >
            <input
              type="password"
              placeholder="Nova senha (mín. 8)"
              minLength={8}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-label={`Nova senha de ${user.email}`}
            />
            <button type="submit" disabled={reset.isPending}>
              Salvar
            </button>
            <button type="button" onClick={() => setResetting(false)}>
              Cancelar
            </button>
          </form>
        ) : (
          <>
            <button onClick={() => setResetting(true)}>Redefinir senha</button>
            <button onClick={onDeactivate} disabled={isSelf} title={isSelf ? 'Não é possível desativar a própria conta' : undefined}>
              Remover
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const trpc = useTRPC();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [emailError, setEmailError] = useState<string | null>(null);

  const create = useMutation(
    trpc.users.create.mutationOptions({
      onSuccess: () => {
        setNome('');
        setEmail('');
        setPassword('');
        setEmailError(null);
        onCreated();
      },
      onError: (error) => {
        if (error instanceof TRPCClientError && error.data?.code === 'CONFLICT') {
          setEmailError(error.message);
        } else {
          setEmailError('Erro ao criar usuário');
        }
      },
    }),
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setEmailError(null);
    create.mutate({ nome, email, password, role });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 420 }}>
      <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Criar usuário</h2>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        Nome
        <input required value={nome} onChange={(e) => setNome(e.target.value)} name="nome" />
      </label>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          name="new-email"
        />
        {emailError && (
          <span role="alert" style={{ color: '#b00020', fontSize: '0.85rem' }}>
            {emailError}
          </span>
        )}
      </label>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        Senha inicial
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          name="new-password"
          autoComplete="new-password"
        />
      </label>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} name="role">
          <option value="editor">editor</option>
          <option value="admin">admin</option>
        </select>
      </label>
      <button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Criando…' : 'Criar usuário'}
      </button>
    </form>
  );
}
