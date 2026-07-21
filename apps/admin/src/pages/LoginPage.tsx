import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { queryClient, useTRPC } from '../lib/trpc.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const me = useQuery(trpc.auth.me.queryOptions());

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const login = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.auth.me.queryFilter());
        navigate('/');
      },
      onError: () => {
        // Mensagem genérica — o server não distingue email de senha (anti-enumeração)
        setError('Email ou senha inválidos');
      },
    }),
  );

  // Já autenticado → home (TASK-12)
  if (me.data) {
    return <Navigate to="/" replace />;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    login.mutate({ email, password });
  }

  return (
    <main className="sb-admin flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">SystemBook</CardTitle>
          <CardDescription>Entre para gerenciar a documentação.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                name="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                aria-invalid={error ? true : undefined}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="login-password">Senha</Label>
              <Input
                id="login-password"
                type="password"
                name="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-invalid={error ? true : undefined}
              />
            </div>
            <Button type="submit" disabled={login.isPending} className="w-full">
              {login.isPending ? 'Entrando…' : 'Entrar'}
            </Button>
            {/* Erro de login é de campo/formulário → inline (convenção TASK-76),
                não toast. Mensagem genérica anti-enumeração (TASK-10). */}
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
