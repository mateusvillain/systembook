import { StatusTags } from '../features/settings/StatusTags.js';

/**
 * Rota de gestão de tags de status (TASK-105). Sem gate de role: admin e editor
 * gerenciam (a rota tRPC é `protectedProcedure`), como o resto da estrutura de
 * navegação.
 */
export function StatusTagsPage() {
  return <StatusTags />;
}
