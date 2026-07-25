import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { queryClient, useTRPC, type RouterOutput } from '../../lib/trpc.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { StatusTagPill } from '@/components/StatusTagPill';
import { createLinkClass } from '@/lib/styles';
import { cn } from '@/lib/utils';

type StatusTagRow = RouterOutput['statusTags']['list'][number];

const DEFAULT_NEW_COLOR = '#64748b';

/**
 * Gestão das tags de status (TASK-105). Admin e editor gerenciam (a rota é
 * `protectedProcedure`, sem gate de role aqui). Reordenação por mover
 * cima/baixo, consistente com a nav atual (o drag-and-drop da árvore é a
 * TASK-108). Segue o mesmo layout editorial de `UploadTokens`.
 */
export function StatusTags() {
  const trpc = useTRPC();
  const tags = useQuery(trpc.statusTags.list.queryOptions());
  const invalidate = () => queryClient.invalidateQueries(trpc.statusTags.list.queryFilter());

  const update = useMutation(trpc.statusTags.update.mutationOptions({ onSuccess: invalidate }));
  const reorder = useMutation(trpc.statusTags.reorder.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(
    trpc.statusTags.delete.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success('Tag de status excluída.');
      },
    }),
  );

  const list = tags.data ?? [];

  function move(index: number, delta: -1 | 1) {
    const ids = list.map((t) => t.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    reorder.mutate({ orderedIds: ids });
  }

  return (
    <section className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Status tags</h1>
        <p className="text-muted-foreground text-sm">
          Rótulos de status atribuíveis a cada página (ex.: To do, In progress, Deprecated, Beta).
          Substituem o antigo selo automático de rascunho/publicado.
        </p>
      </div>

      <CreateTagForm
        onCreated={() => {
          void invalidate();
          toast.success('Tag de status criada.');
        }}
      />

      <Card>
        <CardContent className="pt-6">
          {tags.isPending && <p className="text-muted-foreground">Carregando tags…</p>}
          {tags.data?.length === 0 && (
            <p className="text-muted-foreground">Nenhuma tag de status ainda.</p>
          )}
          <ul className="grid gap-1">
            {list.map((tag, i) => (
              <StatusTagRowItem
                key={tag.id}
                tag={tag}
                onRename={(titulo) => update.mutate({ id: tag.id, titulo })}
                onRecolor={(cor) => update.mutate({ id: tag.id, cor })}
                onMoveUp={i > 0 ? () => move(i, -1) : undefined}
                onMoveDown={i < list.length - 1 ? () => move(i, 1) : undefined}
                onDelete={() => {
                  if (
                    window.confirm(
                      `Excluir a tag "${tag.titulo}"? As páginas que a usam ficarão sem status.`,
                    )
                  ) {
                    remove.mutate({ id: tag.id });
                  }
                }}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

function StatusTagRowItem({
  tag,
  onRename,
  onRecolor,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  tag: StatusTagRow;
  onRename: (titulo: string) => void;
  onRecolor: (cor: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tag.titulo);

  return (
    <li className="group flex items-center gap-3 rounded-editorial-sm px-2 py-1.5 hover:bg-accent">
      {/* Seletor de cor: input nativo, com o swatch atual visível. */}
      <label className="relative inline-flex size-6 shrink-0 cursor-pointer items-center justify-center">
        <span
          aria-hidden
          className="size-4 rounded-full border border-border/60"
          style={{ backgroundColor: tag.cor }}
        />
        <input
          type="color"
          value={tag.cor}
          onChange={(e) => onRecolor(e.target.value)}
          aria-label={`Cor da tag ${tag.titulo}`}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>

      {editing ? (
        <form
          className="flex flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) onRename(draft.trim());
            setEditing(false);
          }}
        >
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`Novo título da tag ${tag.titulo}`}
            className="h-8 max-w-xs"
          />
          <button type="submit" aria-label="Salvar" className="text-muted-foreground hover:text-foreground p-1">
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Cancelar"
            className="text-muted-foreground hover:text-foreground p-1"
            onClick={() => setEditing(false)}
          >
            <X className="size-3.5" />
          </button>
        </form>
      ) : (
        <>
          <StatusTagPill titulo={tag.titulo} cor={tag.cor} />
          <RowActionsMenu
            triggerLabel={`Mais ações da tag ${tag.titulo}`}
            onRename={() => {
              setDraft(tag.titulo);
              setEditing(true);
            }}
            onDelete={onDelete}
            onMovePrev={onMoveUp}
            onMoveNext={onMoveDown}
            triggerClassName="ml-auto opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          />
        </>
      )}
    </li>
  );
}

function CreateTagForm({ onCreated }: { onCreated: () => void }) {
  const trpc = useTRPC();
  const [titulo, setTitulo] = useState('');
  const [cor, setCor] = useState(DEFAULT_NEW_COLOR);
  const create = useMutation(
    trpc.statusTags.create.mutationOptions({
      onSuccess: () => {
        setTitulo('');
        setCor(DEFAULT_NEW_COLOR);
        onCreated();
      },
    }),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (titulo.trim()) create.mutate({ titulo: titulo.trim(), cor });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="grid gap-2">
        <Label htmlFor="new-tag-color">Cor</Label>
        <input
          id="new-tag-color"
          type="color"
          value={cor}
          onChange={(e) => setCor(e.target.value)}
          aria-label="Cor da nova tag"
          className="h-9 w-12 cursor-pointer rounded-editorial-sm border border-input bg-transparent"
        />
      </div>
      <div className="grid flex-1 gap-2" style={{ maxWidth: 320 }}>
        <Label htmlFor="new-tag-title">Nova tag de status</Label>
        <Input
          id="new-tag-title"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="ex.: Needs review"
        />
      </div>
      <Button type="submit" disabled={create.isPending || !titulo.trim()} className={cn('shrink-0')}>
        <Plus className="size-4" />
        Adicionar
      </Button>
    </form>
  );
}

/** Text-link alternativo, exportado para reuso caso outra superfície precise. */
export const statusTagsLinkClass = createLinkClass;
