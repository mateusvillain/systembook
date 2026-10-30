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
import { nativeSelectClass } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useT } from '../i18n/AdminLocale.js';

interface OutletCtx {
  me: { userId: string; role: 'admin' | 'editor' };
}

type Role = 'admin' | 'editor';


export function UsersPage() {
  const { me } = useOutletContext<OutletCtx>();
  const t = useT();

  // Gestão de usuários é admin-only independente da decisão de CRUD de editores (TASK-13)
  if (me.role !== 'admin') {
    return (
      <p role="alert" className="text-destructive">
        {t('common.accessDenied')}
      </p>
    );
  }
  return <UsersAdmin meUserId={me.userId} />;
}

function UsersAdmin({ meUserId }: { meUserId: string }) {
  const trpc = useTRPC();
  const t = useT();
  const users = useQuery(trpc.users.list.queryOptions());

  const invalidate = () => queryClient.invalidateQueries(trpc.users.list.queryFilter());

  // Resultado de ação → toast (convenção TASK-76).
  const update = useMutation(
    trpc.users.update.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success(t('users.roleUpdated'));
      },
      onError: () => toast.error(t('users.actionFailed')),
    }),
  );
  const deactivate = useMutation(
    trpc.users.deactivate.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success(t('users.removed'));
      },
      onError: () => toast.error(t('users.actionFailed')),
    }),
  );

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('users.title')}</h1>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('users.name')}</TableHead>
                <TableHead>{t('users.email')}</TableHead>
                <TableHead>{t('users.role')}</TableHead>
                <TableHead>{t('users.actions')}</TableHead>
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
          {users.isPending && <p className="text-muted-foreground mt-2">{t('users.loading')}</p>}
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
  const t = useT();
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const reset = useMutation(
    trpc.users.resetPassword.mutationOptions({
      onSuccess: () => {
        // Nunca ecoar a senha de volta — só confirmação (TASK-15)
        setResetting(false);
        setNewPassword('');
        toast.success(t('users.passwordReset'));
      },
      onError: () => toast.error(t('users.actionFailed')),
    }),
  );

  return (
    <TableRow data-email={user.email}>
      <TableCell>{user.nome}</TableCell>
      <TableCell>{user.email}</TableCell>
      <TableCell>
        <select
          className={nativeSelectClass}
          value={user.role}
          disabled={isSelf}
          onChange={(e) => onChangeRole(e.target.value as Role)}
          aria-label={t('users.roleFor', { email: user.email })}
        >
          <option value="admin">{t('roles.admin')}</option>
          <option value="editor">{t('roles.editor')}</option>
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
              placeholder={t('users.newPassword')}
              minLength={8}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-label={t('users.newPasswordFor', { email: user.email })}
            />
            <Button type="submit" size="sm" disabled={reset.isPending}>
              {t('common.save')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setResetting(false)}>
              {t('common.cancel')}
            </Button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setResetting(true)}>
              {t('users.resetPassword')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(!isSelf && 'text-destructive hover:text-destructive')}
              onClick={onDeactivate}
              disabled={isSelf}
              title={isSelf ? t('users.cannotRemoveSelf') : undefined}
            >
              {t('users.remove')}
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const trpc = useTRPC();
  const t = useT();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('editor');
  // Chave, não texto: o erro na tela acompanha uma troca de idioma.
  const [emailError, setEmailError] = useState<'users.emailTaken' | 'users.createFailed' | null>(null);

  const create = useMutation(
    trpc.users.create.mutationOptions({
      onSuccess: () => {
        setNome('');
        setEmail('');
        setPassword('');
        setEmailError(null);
        onCreated();
        toast.success(t('users.created'));
      },
      onError: (error) => {
        // Erro de campo (email duplicado) → inline; convenção TASK-76.
        if (error instanceof TRPCClientError && error.data?.code === 'CONFLICT') {
          setEmailError('users.emailTaken');
        } else {
          setEmailError('users.createFailed');
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
        <CardTitle>{t('users.create')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cu-nome">{t('users.name')}</Label>
            <Input id="cu-nome" required value={nome} onChange={(e) => setNome(e.target.value)} name="nome" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cu-email">{t('users.email')}</Label>
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
                {t(emailError)}
              </span>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cu-password">{t('users.initialPassword')}</Label>
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
            <Label htmlFor="cu-role">{t('users.role')}</Label>
            <select
              id="cu-role"
              className={nativeSelectClass}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              name="role"
            >
              <option value="editor">{t('roles.editor')}</option>
              <option value="admin">{t('roles.admin')}</option>
            </select>
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? t('users.creating') : t('users.create')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
