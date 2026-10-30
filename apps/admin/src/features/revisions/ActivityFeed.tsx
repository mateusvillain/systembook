import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { useTRPC, type RouterOutput } from '../../lib/trpc.js';
import { useDateFormat, type DateFormat } from '../../lib/dates.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { adminTypography } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { useT } from '../../i18n/AdminLocale.js';
import type { AdminMessageKey } from '../../i18n/messages/en.js';
import type { Translator } from '@systembook/docs-site';

type Entry = RouterOutput['revisions']['listRecent']['items'][number];

/** Quantas revisões por requisição. Cabe numa tela sem virar uma parede de texto. */
const PAGE_SIZE = 25;

/**
 * Feed de atividade do painel (SYS-70): as revisões (publish/restore) de todas
 * as páginas, mais recentes primeiro, consumindo `revisions.listRecent`.
 *
 * **Agrupado por dia.** A pergunta que traz alguém aqui é "o que mudou
 * ultimamente?", e ela é respondida por proximidade no tempo — não por uma
 * lista plana em que cada linha repete a data por extenso. Os cabeçalhos
 * ("Today", "Yesterday", a data) dão o eixo, e cada linha só precisa da hora.
 *
 * **Paginação incremental, não "página 2".** O cursor keyset da SYS-69 é
 * consumido por `useInfiniteQuery`: cada "Load more" acrescenta abaixo, sem
 * perder o que já estava na tela — quem está varrendo o histórico está
 * descendo por ele, não pulando entre páginas numeradas.
 */
export function ActivityFeed() {
  const trpc = useTRPC();
  const t = useT();
  const dates = useDateFormat();
  const feed = useInfiniteQuery(
    trpc.revisions.listRecent.infiniteQueryOptions(
      { limit: PAGE_SIZE },
      {
        initialCursor: null,
        // `nextCursor` é null na última página → react-query fecha `hasNextPage`.
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  if (feed.isPending) return <p className={adminTypography.metadata}>{t('activity.loading')}</p>;

  if (feed.isError) {
    return (
      <div role="alert" className="grid justify-items-start gap-2">
        <p className="text-destructive">{t('activity.loadFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => void feed.refetch()}>
          {t('editor.embed.tryAgain')}
        </Button>
      </div>
    );
  }

  const entries = feed.data.pages.flatMap((page) => page.items);

  // Design system recém-criado: nada foi publicado ainda. É um estado normal do
  // produto, não uma falha — mesmo empty state do resto do painel (TASK-90).
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={t('activity.empty')}
        description={t('activity.emptyDescription')}
      />
    );
  }

  return (
    <div className="grid gap-6">
      {groupByDay(entries, dates, t).map((group) => (
        <section key={group.key} className="grid gap-2">
          <h2 className={cn(adminTypography.category, 'sticky top-16 bg-background py-1')}>
            {group.label}
          </h2>
          <ul className="grid list-none gap-0 p-0">
            {group.entries.map((rev) => (
              <ActivityRow key={rev.id} rev={rev} />
            ))}
          </ul>
        </section>
      ))}

      {feed.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void feed.fetchNextPage()}
            disabled={feed.isFetchingNextPage}
          >
            {feed.isFetchingNextPage ? t('common.loading') : t('activity.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

interface DayGroup {
  key: string;
  label: string;
  entries: Entry[];
}

/**
 * Quebra o feed (já ordenado do mais recente para o mais antigo) em dias
 * consecutivos, preservando a ordem. A chave é a data **local** — o corte de dia
 * que importa é o de quem está lendo, não o UTC do banco.
 */
function groupByDay(entries: Entry[], dates: DateFormat, t: Translator<AdminMessageKey>): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of entries) {
    const date = new Date(entry.criadoEm);
    const key = dayKey(date);
    const current = groups.at(-1);
    if (current?.key === key) current.entries.push(entry);
    else groups.push({ key, label: dayLabel(date, dates, t), entries: [entry] });
  }
  return groups;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Today"/"Yesterday" para os dois dias que se lê sem pensar; data por extenso no resto. */
function dayLabel(date: Date, dates: DateFormat, t: Translator<AdminMessageKey>): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return t('activity.today');
  if (dayKey(date) === dayKey(yesterday)) return t('activity.yesterday');
  return dates.day(date);
}

function ActivityRow({ rev }: { rev: Entry }) {
  // SYS-69: o tipo vem do banco. Antes era deduzido do prefixo da mensagem —
  // que no publish é texto livre e podia imitar a frase gerada pelo restore.
  const restored = rev.tipo === 'restore';
  // Mensagem do publish é livre; a de restore é gerada — só exibimos a de publish.
  const publishNote = restored ? null : rev.mensagem;
  const at = new Date(rev.criadoEm);
  const dates = useDateFormat();
  const t = useT();

  return (
    <li className="border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Badge variant={restored ? 'secondary' : 'default'}>
          {restored ? t('activity.restored') : t('activity.published')}
        </Badge>
        {/* Link direto para a página, que é o destino provável de quem vê a
            linha ("o que mudou aqui?" → abrir). O histórico daquela página fica
            a um passo, na ação secundária. */}
        <Link to={`/pages/${rev.pageId}`} className="font-medium text-foreground hover:underline">
          {rev.pageTitulo}
        </Link>
        {/* A seção situa a página: dois "Button" em seções diferentes são
            páginas diferentes. */}
        <span className={adminTypography.metadata}>{t('activity.inSection', { name: rev.sectionTitulo })}</span>
        <span className="flex-1" />
        <time
          dateTime={at.toISOString()}
          title={dates.absolute(at)}
          className={adminTypography.metadata}
        >
          {dates.time(at)}
        </time>
      </div>
      <div className={cn(adminTypography.metadata, 'mt-1 flex flex-wrap items-baseline gap-x-2')}>
        {/* `autorEmail` é null quando o usuário foi removido (ON DELETE SET NULL). */}
        <span>{rev.autorEmail ?? t('revisions.removedAuthor')}</span>
        <span aria-hidden>·</span>
        <span>{dates.relative(at)}</span>
        <span aria-hidden>·</span>
        <Link to={`/pages/${rev.pageId}/history`} className="hover:underline">
          {t('activity.pageHistory')}
        </Link>
        {publishNote && (
          <span className="basis-full text-foreground/80 sm:basis-auto">— {publishNote}</span>
        )}
      </div>
    </li>
  );
}
