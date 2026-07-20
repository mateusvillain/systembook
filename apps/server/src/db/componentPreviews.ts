import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { componentPreviews } from './schema.js';

export type ComponentPreviewRow = typeof componentPreviews.$inferSelect;

/** Ponto de escrita usado pelo endpoint de upload (TASK-43) — sempre insert, nunca upsert (histórico append-only). */
export function insertComponentPreview(
  db: Db,
  params: {
    componentName: string;
    variantId: string;
    commitSha: string;
    pathEstatico: string;
    /** Default: agora (unixepoch do SQLite). */
    publicadoEm?: Date;
  },
): ComponentPreviewRow {
  return db
    .insert(componentPreviews)
    .values({
      componentName: params.componentName,
      variantId: params.variantId,
      commitSha: params.commitSha,
      pathEstatico: params.pathEstatico,
      ...(params.publicadoEm !== undefined && { publicadoEm: params.publicadoEm }),
    })
    .returning()
    .get();
}

/**
 * Última publicação de um par (componente, variante) — "latest wins" para o
 * component-embed (TASK-47). Desempate por rowid além de publicado_em:
 * unixepoch tem resolução de segundo e dois uploads do mesmo CI podem cair
 * no mesmo segundo (mesma lição do listByPage de revisions).
 */
export function getLatestPreview(
  db: Db,
  componentName: string,
  variantId: string,
): ComponentPreviewRow | null {
  const row = db
    .select()
    .from(componentPreviews)
    .where(
      and(
        eq(componentPreviews.componentName, componentName),
        eq(componentPreviews.variantId, variantId),
      ),
    )
    .orderBy(desc(componentPreviews.publicadoEm), desc(sql`${componentPreviews}.rowid`))
    .limit(1)
    .get();
  return row ?? null;
}

/**
 * Nomes de componente distintos com ao menos uma publicação — fonte do picker
 * de inserção (TASK-48). Não há tabela de "registro de componentes": um
 * componente só é selecionável depois do primeiro upload de CI (TASK-43).
 * Ordenado por nome para uma lista estável.
 */
export function listComponentNames(db: Db): string[] {
  return db
    .selectDistinct({ componentName: componentPreviews.componentName })
    .from(componentPreviews)
    .orderBy(componentPreviews.componentName)
    .all()
    .map((r) => r.componentName);
}

/** Variantes distintas publicadas de um componente (segundo passo do picker). */
export function listVariantIds(db: Db, componentName: string): string[] {
  return db
    .selectDistinct({ variantId: componentPreviews.variantId })
    .from(componentPreviews)
    .where(eq(componentPreviews.componentName, componentName))
    .orderBy(componentPreviews.variantId)
    .all()
    .map((r) => r.variantId);
}
