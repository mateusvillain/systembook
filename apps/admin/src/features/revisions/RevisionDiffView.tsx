import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Block } from '@systembook/schema';
import { ArrowLeftRight, Minus, PenLine, Plus, X } from 'lucide-react';
import { useTRPC, type RouterOutput } from '../../lib/trpc.js';
import { blocksToTiptapDoc } from './blocksToTiptapDoc.js';
import { editorExtensions } from '../editor/extensions.js';
import { Button } from '@/components/ui/button';
import { adminTypography } from '../../lib/typography.js';
import { cn } from '@/lib/utils';
import '../editor/editor.css';

type Diff = RouterOutput['revisions']['diff'];
type BlockDiff = Diff['tabs'][number]['blocks'][number];
type Status = BlockDiff['status'];
/**
 * Bloco como chega pelo wire: o output do tRPC marca os campos `unknown` do
 * conteúdo Tiptap como opcionais (nota em `lib/trpc.ts`), então ele não é
 * atribuível a `Block` sem cast — a forma real bate, garantida pelo par
 * `tiptapDocToBlocks`/`blocksToTiptapDoc`. Mesmo cast que o `PageRenderer` faz.
 */
type DiffBlock = NonNullable<BlockDiff['before']>;

/**
 * Comparação entre duas revisões (SYS-60): consome `revisions.diff` (SYS-59) e
 * mostra, por bloco, o que entrou, saiu e mudou.
 *
 * **Três decisões de leitura sustentam esta tela.**
 *
 * 1. *Blocos inalterados ficam escondidos por padrão.* Numa página real a
 *    maioria dos blocos não muda, e listá-los todos enterra as três linhas que
 *    importam. O contador diz quantos estão ocultos e um clique traz de volta —
 *    o contexto continua a um gesto de distância, mas não é o padrão.
 * 2. *Status nunca é dito só por cor.* Cada bloco carrega ícone + rótulo
 *    ("Added"/"Removed"/"Changed") além da faixa colorida: a distinção
 *    vermelho/verde é justamente a que mais falha, e a cor sozinha também
 *    desaparece num print em preto e branco.
 * 3. *Alterado mostra os dois estados, empilhados e rotulados* ("Before" acima,
 *    "After" abaixo) em vez de tentar um diff palavra a palavra dentro do
 *    bloco: o conteúdo é rich text (tabela, callout, embed), e destacar
 *    caracteres dentro dele exigiria um renderer paralelo — que divergiria do
 *    real e mentiria justamente onde a pessoa está decidindo se restaura.
 */
export function RevisionDiffView({
  fromRevisionId,
  toRevisionId,
  onSwap,
  onClear,
}: {
  fromRevisionId: string;
  toRevisionId: string;
  onSwap: () => void;
  /** Desfaz a seleção e volta ao preview de uma revisão só. */
  onClear: () => void;
}) {
  const trpc = useTRPC();
  const [showUnchanged, setShowUnchanged] = useState(false);
  const query = useQuery(trpc.revisions.diff.queryOptions({ fromRevisionId, toRevisionId }));

  if (query.isPending) return <p className="text-muted-foreground">Comparing revisions…</p>;
  if (query.isError)
    return (
      <p role="alert" className="text-destructive">
        Failed to compare the revisions.
      </p>
    );

  const diff = query.data;
  const { counts } = diff;
  const changedTotal = counts.added + counts.removed + counts.changed;

  return (
    <div className="grid gap-5">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className={cn(adminTypography.body, 'font-semibold')}>Comparing revisions</h2>
          {/* As duas ações da comparação ficam na mesma linha do título dela:
              trocar o sentido e sair são decisões sobre *este* painel. */}
          <Button type="button" variant="ghost" size="sm" onClick={onSwap}>
            <ArrowLeftRight className="size-4" aria-hidden />
            Swap direction
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <X className="size-4" aria-hidden />
            Clear comparison
          </Button>
        </div>

        {/* Quem é o "antes" e quem é o "depois" é a informação que decide a
            leitura do resto da tela — vem antes dos números, não numa legenda. */}
        <p className={cn(adminTypography.metadata, 'flex flex-wrap items-center gap-2')}>
          <RevisionLabel label="From" revision={diff.from} />
          <span aria-hidden>→</span>
          <RevisionLabel label="To" revision={diff.to} />
        </p>

        {changedTotal === 0 ? (
          <p className="text-muted-foreground text-sm">
            These two revisions have identical content ({counts.unchanged}{' '}
            {counts.unchanged === 1 ? 'block' : 'blocks'}).
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <CountChip status="added" count={counts.added} />
            <CountChip status="changed" count={counts.changed} />
            <CountChip status="removed" count={counts.removed} />
            {counts.unchanged > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={showUnchanged}
                onClick={() => setShowUnchanged((v) => !v)}
              >
                {showUnchanged ? 'Hide' : 'Show'} {counts.unchanged} unchanged
              </Button>
            )}
          </div>
        )}
      </header>

      {diff.tabs.map((tab) => {
        const visible = showUnchanged ? tab.blocks : tab.blocks.filter((b) => b.status !== 'unchanged');
        // Tab inteira sem mudanças some quando o filtro está ligado: uma seção
        // vazia com um título só ocuparia a tela dizendo "nada aqui".
        if (visible.length === 0) return null;

        return (
          <section key={tab.tabId} className="grid gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {tab.isPrimary ? 'Page body' : tab.titulo}
              {tab.status === 'added' && <StatusPill status="added" label="Tab added" />}
              {tab.status === 'removed' && <StatusPill status="removed" label="Tab removed" />}
            </h3>

            <ol className="grid list-none gap-3 p-0">
              {visible.map((block, index) => (
                <li key={`${tab.tabId}-${index}`}>
                  <BlockDiffCard diff={block} />
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function RevisionLabel({
  label,
  revision,
}: {
  label: string;
  revision: Diff['from'] | Diff['to'];
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground/70 uppercase tracking-[0.12em] text-[0.7rem]">{label}</span>
      <time dateTime={new Date(revision.criadoEm).toISOString()} className="text-foreground">
        {new Date(revision.criadoEm).toLocaleString('en-US')}
      </time>
      <span>· {revision.autorEmail ?? 'Removed author'}</span>
    </span>
  );
}

/**
 * Vocabulário visual do diff, num lugar só. Cada status tem ícone, rótulo e
 * par de cores; nenhum consumidor escolhe a cor por conta própria, então
 * "adicionado" tem a mesma aparência no resumo do topo e na faixa do bloco.
 */
const STATUS_STYLE: Record<
  Exclude<Status, 'unchanged'>,
  { label: string; icon: typeof Plus; chip: string; rail: string }
> = {
  added: {
    label: 'Added',
    icon: Plus,
    chip: 'border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    rail: 'border-l-emerald-600/70',
  },
  removed: {
    label: 'Removed',
    icon: Minus,
    chip: 'border-rose-600/30 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    rail: 'border-l-rose-600/70',
  },
  changed: {
    label: 'Changed',
    icon: PenLine,
    chip: 'border-amber-600/30 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
    rail: 'border-l-amber-500/80',
  },
};

function StatusPill({ status, label }: { status: Exclude<Status, 'unchanged'>; label?: string }) {
  const style = STATUS_STYLE[status];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        style.chip,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label ?? style.label}
    </span>
  );
}

function CountChip({ status, count }: { status: Exclude<Status, 'unchanged'>; count: number }) {
  // Zero também aparece, em cinza: "nenhuma remoção" é informação, e um resumo
  // que muda de tamanho conforme o resultado é mais difícil de comparar entre
  // duas comparações seguidas.
  const style = STATUS_STYLE[status];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        count > 0 ? style.chip : 'text-muted-foreground border-border',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {count} {style.label.toLowerCase()}
    </span>
  );
}

function BlockDiffCard({ diff }: { diff: BlockDiff }) {
  if (diff.status === 'unchanged') {
    return (
      <div className="border-border rounded-md border border-l-4 px-4 py-3">
        <BlockContent block={diff.after ?? diff.before} />
      </div>
    );
  }

  const style = STATUS_STYLE[diff.status];

  return (
    <div className={cn('rounded-md border border-l-4 px-4 py-3', style.rail)}>
      <div className="mb-2">
        <StatusPill status={diff.status} />
      </div>

      {diff.status === 'changed' ? (
        <div className="grid gap-3">
          <BeforeAfter label="Before" block={diff.before} muted />
          <BeforeAfter label="After" block={diff.after} />
        </div>
      ) : (
        <BlockContent block={diff.status === 'removed' ? diff.before : diff.after} muted={diff.status === 'removed'} />
      )}
    </div>
  );
}

function BeforeAfter({
  label,
  block,
  muted,
}: {
  label: string;
  block: DiffBlock | null;
  muted?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <p className="text-muted-foreground text-[0.7rem] font-medium uppercase tracking-[0.12em]">
        {label}
      </p>
      <BlockContent block={block} muted={muted} />
    </div>
  );
}

/**
 * Um bloco renderizado pelo **mesmo** Tiptap read-only da doc pública — é o
 * ponto todo da tela: o que aparece aqui é o que o leitor veria. O bloco
 * removido é atenuado por opacidade (nunca por `line-through`, que numa tabela
 * ou num embed vira ruído ilegível) e o rótulo "Removed" é quem diz o que a
 * opacidade só sugere.
 */
function BlockContent({ block, muted }: { block: DiffBlock | null; muted?: boolean }) {
  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: block ? blocksToTiptapDoc([block as Block]) : { type: 'doc', content: [] },
      editable: false,
    },
    [block],
  );

  if (!block) return <p className="text-muted-foreground text-sm">(empty)</p>;

  return (
    <div className={cn('sb-editor sb-diff-block', muted && 'opacity-60')}>
      <EditorContent editor={editor} />
    </div>
  );
}
