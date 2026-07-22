import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { FilePlus2, Plus } from 'lucide-react';
import { BLOCK_GROUPS, insertComponentEmbed, type BlockItem } from './blockInsert.js';
import { ComponentEmbedPicker, type ComponentEmbedSelection } from './ComponentEmbedPicker.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';

/**
 * Empty State do editor (TASK-90): quando a tab/página não tem nenhum bloco de
 * conteúdo ainda, mostra um convite claro no lugar do editor em branco. A ação
 * "Adicionar conteúdo" abre o **mesmo** picker de blocos da TASK-88 (registry
 * único `BLOCK_GROUPS`), então não há um segundo caminho de inserção divergente.
 *
 * O primeiro bloco entra no início do doc (`insertAt = 0`), deixando o parágrafo
 * vazio pré-existente como a "próxima linha" natural. Assim que o bloco entra, o
 * doc deixa de estar vazio e este componente desmonta (o chamador observa
 * `editor.isEmpty`).
 */
export function EditorEmptyState({ editor }: { editor: Editor }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);

  const insertAt = 0;
  const runInsert = (item: BlockItem) => {
    if (item.kind === 'embed') {
      setEmbedOpen(true);
      return;
    }
    item.insert?.(editor, insertAt);
  };

  return (
    // contentEditable={false}: o convite não faz parte do documento editável.
    <div contentEditable={false} className="pointer-events-none absolute inset-x-0 top-8 flex justify-center">
      <div className="pointer-events-auto w-full max-w-md">
        <EmptyState
          size="sm"
          icon={FilePlus2}
          title="Página em branco"
          description="Comece adicionando um bloco — texto, título, lista, tabela ou um embed de componente."
          action={
            <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen}>
              <DropdownMenuTrigger asChild>
                <Button type="button">
                  <Plus className="size-4" />
                  Adicionar conteúdo
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-60">
                {BLOCK_GROUPS.map((group, gi) => (
                  <div key={group.label}>
                    {gi > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-muted-foreground text-xs font-medium uppercase tracking-[0.08em]">
                      {group.label}
                    </DropdownMenuLabel>
                    {group.items.map((item) => (
                      <DropdownMenuItem key={item.id} onSelect={() => runInsert(item)}>
                        <item.icon className="size-4" />
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </div>

      {embedOpen && (
        <ComponentEmbedPicker
          onConfirm={(selection: ComponentEmbedSelection) => {
            insertComponentEmbed(editor, insertAt, selection);
            setEmbedOpen(false);
          }}
          onCancel={() => setEmbedOpen(false)}
        />
      )}
    </div>
  );
}
