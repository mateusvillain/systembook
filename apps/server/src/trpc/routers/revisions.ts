import { TRPCError } from '@trpc/server';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { PageSnapshot } from '@systembook/schema';
import { pages, revisions, sections, users } from '../../db/schema.js';
import { diffSnapshots } from '../../revisions/diff.js';
import { protectedProcedure, publicProcedure, router } from '../init.js';

function revisionNotFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: 'Revision not found' });
}

export const revisionsRouter = router({
  // leftJoin (não innerJoin): autor_id é SET NULL no hard delete do usuário
  // (TASK-33/14) — a revisão sobrevive com autor "removido".
  listByPage: protectedProcedure
    .input(z.object({ pageId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db
        .select({
          id: revisions.id,
          criadoEm: revisions.criadoEm,
          mensagem: revisions.mensagem,
          autorId: revisions.autorId,
          autorEmail: users.email,
        })
        .from(revisions)
        .leftJoin(users, eq(users.id, revisions.autorId))
        .where(eq(revisions.pageId, input.pageId))
        // `criadoEm` tem resolução de segundo (unixepoch()) — publishes muito
        // próximos podem empatar; desempata pelo rowid (ordem de inserção).
        .orderBy(desc(revisions.criadoEm), desc(sql`${revisions}.rowid`))
        .all(),
    ),

  /**
   * Feed de atividade do painel inteiro (TASK-69, reformulado na SYS-69): as
   * revisões de TODAS as páginas, mais recentes primeiro. Agrega o que já
   * existe em `revisions` — um audit log de eventos estruturais (create/rename/
   * delete) seria um follow-up com tabela própria.
   *
   * **`tipo` vem do banco** (SYS-69). Antes o cliente decidia "publicou ou
   * restaurou?" olhando o prefixo da mensagem; como a mensagem do publish é
   * texto livre, bastava alguém escrever a frase do restore para o feed mentir.
   *
   * **Paginação por keyset, não por offset.** O feed é escrito o tempo todo
   * (todo publish entra no topo): com `OFFSET`, uma revisão nova entre duas
   * páginas empurraria a lista e o leitor veria o mesmo item duas vezes. O
   * cursor é o par `(criadoEm, rowid)` da última linha lida — o mesmo par que
   * ordena —, então a segunda página continua exatamente de onde a primeira
   * parou. `rowid` está no cursor porque `criado_em` tem resolução de segundo:
   * dois publishes no mesmo segundo empatam, e sem o desempate um deles sumiria
   * na virada de página.
   *
   * `protectedProcedure`: admin e editor publicam, então ambos veem o feed.
   * `autorEmail` é `null` quando o usuário foi removido (`ON DELETE SET NULL`).
   */
  listRecent: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.object({ criadoEm: z.number().int(), rowid: z.number().int() }).nullish(),
      }),
    )
    .query(({ ctx, input }) => {
      const rows = ctx.db
        .select({
          id: revisions.id,
          criadoEm: revisions.criadoEm,
          tipo: revisions.tipo,
          mensagem: revisions.mensagem,
          autorId: revisions.autorId,
          autorEmail: users.email,
          pageId: revisions.pageId,
          pageTitulo: pages.titulo,
          // Contexto de navegação da linha: a seção situa a página (dois
          // "Button" em seções diferentes são páginas diferentes) e o menu é o
          // que o painel precisa ativar ao abrir a página (TASK-85/86).
          sectionTitulo: sections.titulo,
          menuId: sections.menuId,
          rowid: sql<number>`${revisions}.rowid`,
        })
        .from(revisions)
        // innerJoin: pageId é FK cascade → toda revisão tem página. leftJoin em
        // users porque autor_id é SET NULL no hard delete (igual listByPage).
        .innerJoin(pages, eq(pages.id, revisions.pageId))
        .innerJoin(sections, eq(sections.id, pages.sectionId))
        .leftJoin(users, eq(users.id, revisions.autorId))
        .where(
          input.cursor
            ? sql`(${revisions.criadoEm}, ${revisions}.rowid) < (${input.cursor.criadoEm}, ${input.cursor.rowid})`
            : undefined,
        )
        // mesma ordenação/desempate do listByPage: rowid desempata segundos iguais
        .orderBy(desc(revisions.criadoEm), desc(sql`${revisions}.rowid`))
        // Uma linha a mais que o pedido: é ela que diz se existe próxima
        // página, sem uma segunda consulta de contagem.
        .limit(input.limit + 1)
        .all();

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      const last = items.at(-1);

      return {
        items: items.map(({ rowid: _rowid, ...item }) => item),
        nextCursor:
          hasMore && last
            ? { criadoEm: Math.floor(last.criadoEm.getTime() / 1000), rowid: last.rowid }
            : null,
      };
    }),

  getById: protectedProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const row = ctx.db
      .select({
        id: revisions.id,
        pageId: revisions.pageId,
        criadoEm: revisions.criadoEm,
        mensagem: revisions.mensagem,
        autorId: revisions.autorId,
        autorEmail: users.email,
        snapshotJson: revisions.snapshotJson,
      })
      .from(revisions)
      .leftJoin(users, eq(users.id, revisions.autorId))
      .where(eq(revisions.id, input.id))
      .get();
    if (!row) throw revisionNotFound();

    const { snapshotJson, ...meta } = row;
    return { ...meta, snapshot: JSON.parse(snapshotJson) as PageSnapshot };
  }),

  /**
   * Diff estruturado entre duas revisões da mesma página (SYS-59): a lista de
   * blocos com status (inalterado/adicionado/removido/alterado), agrupada por
   * tab. O cálculo mora em `revisions/diff.ts` (função pura, testável sem
   * banco); aqui ficam só a leitura e as validações.
   *
   * **A ordem dos argumentos é a direção do diff, não a cronológica**: o
   * resultado descreve o caminho de `fromRevisionId` para `toRevisionId`.
   * Comparar do mais novo para o mais antigo é legítimo (é assim que se lê "o
   * que eu perderia se restaurasse aquela revisão") e simplesmente inverte
   * adições e remoções — nenhum dos dois lados precisa ser o mais recente.
   *
   * As duas revisões precisam ser da **mesma página**: um diff entre páginas
   * diferentes casaria tabs por id que nunca se corresponderam, produzindo um
   * relatório sem significado. Comparar uma revisão com ela mesma é permitido
   * e devolve tudo inalterado — é o caso degenerado correto, não um erro.
   */
  diff: protectedProcedure
    .input(z.object({ fromRevisionId: z.string(), toRevisionId: z.string() }))
    .query(({ ctx, input }) => {
      const load = (id: string) => {
        const row = ctx.db
          .select({
            id: revisions.id,
            pageId: revisions.pageId,
            criadoEm: revisions.criadoEm,
            mensagem: revisions.mensagem,
            autorEmail: users.email,
            snapshotJson: revisions.snapshotJson,
          })
          .from(revisions)
          .leftJoin(users, eq(users.id, revisions.autorId))
          .where(eq(revisions.id, id))
          .get();
        if (!row) throw revisionNotFound();
        return row;
      };

      const from = load(input.fromRevisionId);
      const to = load(input.toRevisionId);

      if (from.pageId !== to.pageId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Both revisions must belong to the same page',
        });
      }

      const meta = (row: ReturnType<typeof load>) => ({
        id: row.id,
        criadoEm: row.criadoEm,
        mensagem: row.mensagem,
        autorEmail: row.autorEmail,
      });

      return {
        pageId: from.pageId,
        from: meta(from),
        to: meta(to),
        ...diffSnapshots(
          JSON.parse(from.snapshotJson) as PageSnapshot,
          JSON.parse(to.snapshotJson) as PageSnapshot,
        ),
      };
    }),

  /**
   * Superfície pública de documentação (TASK-50): o snapshot da **última
   * revisão publicada** da página — nunca o rascunho ao vivo de `blocks`
   * (concretiza a dependência de ordenação registrada na TASK-34).
   * `publicProcedure`: a doc publicada não exige autenticação. `null` quando a
   * página nunca foi publicada (sem revisões).
   */
  getLatestPublished: publicProcedure
    .input(z.object({ pageId: z.string() }))
    .query(({ ctx, input }) => {
      const row = ctx.db
        .select({ snapshotJson: revisions.snapshotJson })
        .from(revisions)
        .where(eq(revisions.pageId, input.pageId))
        // mesma ordenação/desempate do listByPage: última publicação primeiro
        .orderBy(desc(revisions.criadoEm), desc(sql`${revisions}.rowid`))
        .limit(1)
        .get();
      if (!row) return null;
      return JSON.parse(row.snapshotJson) as PageSnapshot;
    }),
});
