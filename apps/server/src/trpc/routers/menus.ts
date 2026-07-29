import { TRPCError } from '@trpc/server';
import { and, asc, eq, max, ne } from 'drizzle-orm';
import { z } from 'zod';
import { isUniqueViolation } from '../../db/errors.js';
import { LANDING_SECTION_ID } from '../../db/landing.js';
import { generateUniqueMenuSlug } from '../../db/menus.js';
import { menus, pages, sections } from '../../db/schema.js';
import { protectedProcedure, router } from '../init.js';
import { assertCompleteReorder } from './reorder.js';

function menuNotFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: 'Menu not found' });
}

function menuSlugConflict(): TRPCError {
  return new TRPCError({ code: 'CONFLICT', message: 'A menu with this slug already exists' });
}

// Estrutura de navegação: admin e editor têm o mesmo CRUD (TASK-24).
export const menusRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(menus).orderBy(asc(menus.ordem), asc(menus.id)).all(),
  ),

  // Resolve o path público de um menu (TASK-109): a 1ª página (menor ordem) da
  // 1ª seção (menor ordem) que tenha alguma página. Menus não têm página
  // própria — o "Copiar link" do menu no header aponta para o primeiro
  // conteúdo abaixo dele. `null` quando o menu ainda não tem seção/página (o
  // item de copiar link fica desabilitado). Não exige publicação — mesmo
  // critério do "Copiar link" de uma página avulsa.
  firstPagePath: protectedProcedure
    .input(z.object({ menuId: z.string() }))
    .query(({ ctx, input }): { menuSlug: string; sectionSlug: string; pageSlug: string } | null => {
      // SYS-37: o menu entrou na URL pública, então o link copiado já sai na
      // forma canônica em vez de depender do redirect da forma legada.
      const menu = ctx.db
        .select({ id: menus.id, slug: menus.slug })
        .from(menus)
        .where(eq(menus.id, input.menuId))
        .get();
      if (!menu) return null;
      const menuSlug = menu.slug ?? menu.id;

      const secs = ctx.db
        .select({ id: sections.id, slug: sections.slug })
        .from(sections)
        .where(and(eq(sections.menuId, input.menuId), ne(sections.id, LANDING_SECTION_ID)))
        .orderBy(asc(sections.ordem), asc(sections.id))
        .all();
      for (const sec of secs) {
        const page = ctx.db
          .select({ slug: pages.slug })
          .from(pages)
          .where(eq(pages.sectionId, sec.id))
          .orderBy(asc(pages.ordem), asc(pages.id))
          .limit(1)
          .get();
        if (page && sec.slug) return { menuSlug, sectionSlug: sec.slug, pageSlug: page.slug };
      }
      return null;
    }),

  create: protectedProcedure
    .input(z.object({ titulo: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const row = ctx.db.select({ maxOrdem: max(menus.ordem) }).from(menus).get();
      try {
        return ctx.db
          .insert(menus)
          .values({
            titulo: input.titulo,
            slug: generateUniqueMenuSlug(ctx.db, input.titulo),
            ordem: (row?.maxOrdem ?? -1) + 1,
          })
          .returning()
          .get();
      } catch (error) {
        if (isUniqueViolation(error)) throw menuSlugConflict();
        throw error;
      }
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), titulo: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const updated = ctx.db
        .update(menus)
        .set({ titulo: input.titulo })
        .where(eq(menus.id, input.id))
        .returning()
        .get();
      if (!updated) throw menuNotFound();
      return updated;
    }),

  reorder: protectedProcedure
    .input(z.object({ orderedIds: z.array(z.string()).min(1) }))
    .mutation(({ ctx, input }) => {
      const existing = ctx.db.select({ id: menus.id }).from(menus).all();
      assertCompleteReorder(
        existing.map((menu) => menu.id),
        input.orderedIds,
      );
      ctx.db.transaction((tx) => {
        input.orderedIds.forEach((id, ordem) => {
          tx.update(menus).set({ ordem }).where(eq(menus.id, id)).run();
        });
      });
      return { ok: true };
    }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const deleted = ctx.db.delete(menus).where(eq(menus.id, input.id)).returning({ id: menus.id }).get();
    if (!deleted) throw menuNotFound();
    return { ok: true };
  }),
});
