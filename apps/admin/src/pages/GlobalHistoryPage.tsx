import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTRPC, type RouterOutput } from '../lib/trpc.js';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

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
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Panel history</h1>
        <p className="text-muted-foreground text-sm">
          Recent publish and restore activity across all pages.
        </p>
      </div>

      {feed.isPending && <p className="text-muted-foreground">Loading…</p>}
      {feed.isError && <p role="alert" className="text-destructive">Failed to load the history.</p>}
      {feed.data?.length === 0 && <p className="text-muted-foreground">No revisions published yet.</p>}

      {feed.data && feed.data.length > 0 && (
        <ul className="grid list-none gap-2 p-0">
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
  return mensagem?.startsWith('Restored from the revision of') ? 'Restored' : 'Published';
}

function ActivityRow({ rev }: { rev: Entry }) {
  const label = eventLabel(rev.mensagem);
  // Mensagem do publish é livre; a de restore é gerada — só exibimos a de publish.
  const publishNote = label === 'Published' ? rev.mensagem : null;

  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-1 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <Badge variant={label === 'Restored' ? 'secondary' : 'default'}>{label}</Badge>
              <Link to={`/pages/${rev.pageId}/history`} className="text-primary hover:underline">
                {rev.pageTitulo}
              </Link>
            </span>
            <span className="text-muted-foreground text-sm">
              {new Date(rev.criadoEm).toLocaleString('en-US')}
            </span>
          </div>
          <div className="text-muted-foreground text-xs">
            {rev.autorEmail ?? 'Removed author'}
            {publishNote && <span> — {publishNote}</span>}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
