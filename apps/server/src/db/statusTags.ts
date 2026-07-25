import type { Db } from './client.js';
import { statusTags } from './schema.js';

/**
 * Tags de status padrão (TASK-105). IDs fixos (sentinela) para que o seed seja
 * idempotente por conflito de PRIMARY KEY — rodar duas vezes não duplica, e o
 * usuário pode renomear/recolorir/reordenar/excluir livremente depois (não são
 * "reconstruídas" no próximo boot, pois o conflito é só na primeira inserção).
 *
 * Os **valores** são em inglês (To do / In progress / Deprecated / Beta) porque
 * o feedback do produto os especificou assim explicitamente; os nomes de campo
 * seguem a convenção pt-BR do domínio (`titulo`, `cor`, `ordem`).
 */
export const DEFAULT_STATUS_TAGS = [
  { id: '__sb_status_todo__', titulo: 'To do', cor: '#64748b', ordem: 0 },
  { id: '__sb_status_in_progress__', titulo: 'In progress', cor: '#2563eb', ordem: 1 },
  { id: '__sb_status_deprecated__', titulo: 'Deprecated', cor: '#e11d48', ordem: 2 },
  { id: '__sb_status_beta__', titulo: 'Beta', cor: '#9333ea', ordem: 3 },
] as const;

/**
 * Garante que as quatro tags de status padrão existem (idempotente, chamado no
 * boot depois das migrations — mesmo padrão de `ensureDefaultMenu`/
 * `ensureLandingPage`). `onConflictDoNothing` respeita edições/exclusões
 * posteriores do usuário: só insere o que ainda não existe por id.
 */
export function ensureDefaultStatusTags(db: Db): void {
  for (const tag of DEFAULT_STATUS_TAGS) {
    db.insert(statusTags).values(tag).onConflictDoNothing().run();
  }
}
