import { TRPCError } from '@trpc/server';

/**
 * Reordenação por lista completa (padrão compartilhado por sections/pages/tabs):
 * o cliente envia todos os ids do pai na nova ordem e cada `ordem` vira o índice
 * na lista. Listas parciais, ids estranhos ou repetidos são rejeitados — evita
 * estados com `ordem` órfão ou duplicado silencioso.
 */
export function assertCompleteReorder(existingIds: string[], orderedIds: string[]): void {
  const provided = new Set(orderedIds);
  const valid =
    provided.size === orderedIds.length &&
    provided.size === existingIds.length &&
    existingIds.every((id) => provided.has(id));
  if (!valid) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'A lista de reordenação deve conter exatamente os itens existentes, sem repetições',
    });
  }
}
