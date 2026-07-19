import type { Block } from '@systembook/schema';

// Verificação de resolução cross-package (TASK-3).
type _SchemaLinkCheck = Block['type'];

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '4rem', textAlign: 'center' }}>
      <h1>SystemBook</h1>
      <p>Painel admin — em construção (login chega na TASK-10+).</p>
    </main>
  );
}
