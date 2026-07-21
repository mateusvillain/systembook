import { useState, type FormEvent } from 'react';
import { TRPCClientError } from '@trpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { queryClient, useTRPC } from '../lib/trpc.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface OutletCtx {
  me: { userId: string; role: 'admin' | 'editor' };
}

type Role = 'admin' | 'editor';

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50';

export function UsersPage() {
  const { me } = useOutletContext<OutletCtx>();

  // Gestão de usuários é admin-only independente da decisão de CRUD de editores (TASK-13)
  if (me.role !== 'admin') {
    return (
      <p role="alert" className="text-destructive">
        Acesso negado — esta área é exclusiva de administradores.
      </p>
    );
  }
  return <UsersAdmin meUserId={me.userId} />;
}

function UsersAdmin({ meUserId }: { meUserId: string }) {
  const trpc = useTRPC();
  const users = useQuery(trpc.users.list.queryOptions());

  const invalidate = () => queryClient.invalidateQueries(trpc.users.list.queryFilter());

  // Resultado de ação → toast (convenção TASK-76).
  const update = useMutation(
    trpc.users.update.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success('Papel atualizado.');
      },
    }),
  );
  const deactivate = useMutation(
    trpc.users.deactivate.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success('Usuário removido.');
      },
    }),
  );

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">Usuários</h1>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users.data ?? []).map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.id === meUserId}
                  onChangeRole={(role) => update.mutate({ userId: user.id, role })}
                  onDeactivate={() => deactivate.mutate({ userId: user.id })}
                />
              ))}
            </TableBody>
          </Table>
          {users.isPending && <p className="text-muted-foreground mt-2">Carregando usuários…</p>}
        </CardContent>
      </Card>

      <CreateUserForm onCreated={invalidate} />
    </section>
  );
}

interface UserRowProps {
  user: { id: string; nome: string; email: string; role: Role };
  isSelf: boolean;
  onChangeRole: (role: Role) => void;
  onDeactivate: () => void;
}

function UserRow({ user, isSelf, onChangeRole, onDeactivate }: UserRowProps) {
  const trpc = useTRPC();
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const reset = useMutation(
    trpc.users.resetPassword.mutationOptions({
      onSuccess: () => {
        // Nunca ecoar a senha de volta — só confirmação (TASK-15)
        setResetting(false);
        setNewPassword('');
        toast.success('Senha redefinida com sucesso.');
      },
    }),
  );

  return (
    <TableRow data-email={user.email}>
      <TableCell>{user.nome}</TableCell>
      <TableCell>{user.email}</TableCell>
      <TableCell>
        <select
          className={selectClass}
          value={user.role}
          disabled={isSelf}
          onChange={(e) => onChangeRole(e.target.value as Role)}
          aria-label={`Role de ${user.email}`}
        >
          <option value="admin">admin</option>
          <option value="editor">editor</option>
        </select>
      </TableCell>
      <TableCell>
        {resetting ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              reset.mutate({ userId: user.id, newPassword });
            }}
          >
            <Input
              type="password"
              className="h-8 w-44"
              placeholder="Nova senha (mín. 8)"
              minLength={8}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-label={`Nova senha de ${user.email}`}
            />
            <Button type="submit" size="sm" disabled={reset.isPending}>
              Salvar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setResetting(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setResetting(true)}>
              Redefinir senha
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(!isSelf && 'text-destructive hover:text-destructive')}
              onClick={onDeactivate}
              disabled={isSelf}
              title={isSelf ? 'Não é possível desativar a própria conta' : undefined}
            >
              Remover
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
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
        toast.success('Usuário criado.');
      },
      onError: (error) => {
        // Erro de campo (email duplicado) → inline; convenção TASK-76.
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
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Criar usuário</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cu-nome">Nome</Label>
            <Input id="cu-nome" required value={nome} onChange={(e) => setNome(e.target.value)} name="nome" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cu-email">Email</Label>
            <Input
              id="cu-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              name="new-email"
              aria-invalid={emailError ? true : undefined}
            />
            {emailError && (
              <span role="alert" className="text-destructive text-sm">
                {emailError}
              </span>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cu-password">Senha inicial</Label>
            <Input
              id="cu-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              name="new-password"
              autoComplete="new-password"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cu-role">Papel</Label>
            <select
              id="cu-role"
              className={selectClass}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              name="role"
            >
              <option value="editor">editor</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Criando…' : 'Criar usuário'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
