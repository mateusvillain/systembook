import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTRPC, type RouterOutput } from '../lib/trpc.js';

type Entry = RouterOutput['revisions']['listRecent'][number];

/**
 * Histórico geral do painel (TASK-69): feed cronológico das revisões
 * (publish/restore) de TODAS as páginas, mais recentes primeiro. Cada linha
 * leva ao histórico daquela página. Agrega o que já existe em `revisions` —
 * um audit log de eventos estruturais seria um follow-up com tabela própria.
 */
export function GlobalHistoryPage() {
  const trpc = useTRPC();
  const feed = useQuery(trpc.revisions.listRecent.queryOptions({ limit: 50 }));

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Histórico do painel</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Atividade recente de publicação e restauração em todas as páginas.
      </p>

      {feed.isPending && <p>Carregando…</p>}
      {feed.isError && <p role="alert">Erro ao carregar o histórico.</p>}
      {feed.data?.length === 0 && <p>Nenhuma revisão publicada ainda.</p>}

      {feed.data && feed.data.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
          {feed.data.map((rev) => (
            <ActivityRow key={rev.id} rev={rev} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Deriva o tipo de evento a partir da `mensagem` da revisão (TASK-36/34). */
function eventLabel(mensagem: string | null): string {
  return mensagem?.startsWith('Restaurado da revisão de') ? 'Restaurou' : 'Publicou';
}

function ActivityRow({ rev }: { rev: Entry }) {
  const label = eventLabel(rev.mensagem);
  // Mensagem do publish é livre; a de restore é gerada — só exibimos a de publish.
  const publishNote = label === 'Publicou' ? rev.mensagem : null;

  return (
    <li style={{ border: '1px solid #ddd', borderRadius: 4, padding: '0.6rem 0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <span>
          <strong>{label}</strong>{' '}
          <Link to={`/pages/${rev.pageId}/history`}>{rev.pageTitulo}</Link>
        </span>
        <span style={{ color: '#555', fontSize: '0.85rem' }}>
          {new Date(rev.criadoEm).toLocaleString('pt-BR')}
        </span>
      </div>
      <div style={{ fontSize: '0.8rem', color: '#555', marginTop: '0.15rem' }}>
        {rev.autorEmail ?? 'Autor removido'}
        {publishNote && <span> — {publishNote}</span>}
      </div>
    </li>
  );
}
