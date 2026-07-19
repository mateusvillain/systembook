import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { queryClient, useTRPC } from '../lib/trpc.js';

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
    <main
      style={{
        fontFamily: 'system-ui',
        maxWidth: 360,
        margin: '10vh auto',
        padding: '1rem',
      }}
    >
      <h1>SystemBook</h1>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          Email
          <input
            type="email"
            name="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          Senha
          <input
            type="password"
            name="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
        {error && (
          <p role="alert" style={{ color: '#b00020', margin: 0 }}>
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
