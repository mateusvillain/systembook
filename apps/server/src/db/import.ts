import { eq, max, ne } from 'drizzle-orm';
import type { ExportedFile, ImportResult, InstanceImport } from '@systembook/schema';
import { tiptapDocToBlocks, type TiptapDoc, type TiptapNode } from '../blocks/serialize.js';
import { ALLOWED_MEDIA_MIMES, MAX_MEDIA_BYTES, storeMedia } from './media.js';
import { contentMatchesMime } from '../media/signature.js';
import { replaceBlocksForTabInTx } from './blocks.js';
import type { Db, DbTx } from './client.js';
import { LANDING_PAGE_ID, LANDING_SECTION_ID, LANDING_TAB_ID } from './landing.js';
import { createRevision } from './revisions.js';
import { ALLOWED_LOGO_MIMES, ensureSettings, logoHash, MAX_LOGO_BYTES } from './settings.js';
import { menus, pages, revisions, sections, SETTINGS_ID, settings, statusTags, tabs } from './schema.js';

/**
 * Import de um projeto do modo estático numa instância CMS (SYS-112): cria
 * menus, seções, páginas e tabs, guarda as imagens e **publica** tudo — com o
 * dono do token como autor das revisões — numa transação só. Ou entra tudo, ou
 * nada.
 *
 * Menus e seções que já existem com o mesmo slug são reaproveitados (o
 * conteúdo entra neles). Página que já existe é conflito (PRD §9.5): o import
 * falha listando todos, e só com `overwrite` a página é substituída — nunca
 * renomeada. Uma seção com o slug de outra que mora em **outro** menu não tem
 * saída: no CMS o slug de seção é único na instância.
 */

/** Mensagem pronta para o terminal, uma por item. */
export class ImportRejectedError extends Error {
  constructor(
    readonly kind: 'conflict' | 'invalid',
    readonly problems: string[],
  ) {
    super(problems.join('\n'));
    this.name = 'ImportRejectedError';
  }
}

export const IMPORT_REVISION_MESSAGE = 'Imported from static mode';

const PUBLIC_PREFIX = '/docs/';

type Media = { bytes: Buffer; mime: string };

function decode(file: ExportedFile): Buffer {
  return Buffer.from(file.base64, 'base64');
}

/** Valida as imagens e os logos antes de abrir a transação. */
function validateFiles(input: InstanceImport): { images: Map<string, Media>; problems: string[] } {
  const problems: string[] = [];
  const images = new Map<string, Media>();
  for (const image of input.images) {
    const bytes = decode(image);
    const where = `imagem "${image.ref}"`;
    if (!(ALLOWED_MEDIA_MIMES as readonly string[]).includes(image.mime)) {
      problems.push(`${where}: tipo ${image.mime} não aceito (${ALLOWED_MEDIA_MIMES.join(', ')}).`);
    } else if (!bytes.length) {
      problems.push(`${where}: arquivo vazio.`);
    } else if (bytes.length > MAX_MEDIA_BYTES) {
      problems.push(`${where}: maior que ${MAX_MEDIA_BYTES / 1024 / 1024} MB.`);
    } else if (!contentMatchesMime(bytes, image.mime)) {
      problems.push(`${where}: o conteúdo não é um ${image.mime}.`);
    } else {
      images.set(image.ref, { bytes, mime: image.mime });
    }
  }
  for (const [field, file] of [
    ['logo', input.settings.logo],
    ['logoDark', input.settings.logoDark],
  ] as const) {
    if (!file) continue;
    const bytes = decode(file);
    if (!(ALLOWED_LOGO_MIMES as readonly string[]).includes(file.mime)) {
      problems.push(`${field}: tipo ${file.mime} não aceito no logo (${ALLOWED_LOGO_MIMES.join(', ')}).`);
    } else if (!bytes.length || bytes.length > MAX_LOGO_BYTES) {
      problems.push(`${field}: o logo precisa ter até ${MAX_LOGO_BYTES / 1024} KB.`);
    } else if (!contentMatchesMime(bytes, file.mime)) {
      problems.push(`${field}: o conteúdo não é um ${file.mime}.`);
    }
  }
  return { images, problems };
}

/**
 * Troca os endereços do projeto pelos da instância: `src` de imagem pela URL
 * em `/api/media/…` e, nos links para tabs, o slug da tab pelo id criado.
 */
function rewriteDoc(doc: TiptapDoc, refs: { images: Map<string, string>; tabIds: Map<string, string> }): TiptapDoc {
  const src = (value: string) => refs.images.get(value) ?? value;
  const href = (value: string) => {
    if (!value.startsWith(PUBLIC_PREFIX)) return value;
    const cut = value.search(/[?#]/);
    const [pathname, suffix] = cut === -1 ? [value, ''] : [value.slice(0, cut), value.slice(cut)];
    const segments = pathname.slice(PUBLIC_PREFIX.length).split('/').filter(Boolean);
    if (segments.length !== 4) return value;
    const tabId = refs.tabIds.get(segments.join('/'));
    if (!tabId) return value;
    return `${PUBLIC_PREFIX}${[...segments.slice(0, 3), tabId].join('/')}${suffix}`;
  };
  const visit = (node: TiptapNode): TiptapNode => {
    const next: TiptapNode = { ...node };
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      next.attrs = { ...node.attrs, src: src(node.attrs.src) };
    }
    const cover = node.attrs?.cover as { kind?: string; src?: unknown } | null | undefined;
    if (node.type === 'dosDonts' && cover?.kind === 'image' && typeof cover.src === 'string') {
      next.attrs = { ...node.attrs, cover: { ...cover, src: src(cover.src) } };
    }
    if (node.marks) {
      next.marks = node.marks.map((mark) => {
        const m = mark as { type: string; attrs?: Record<string, unknown> };
        return m.type === 'link' && typeof m.attrs?.href === 'string'
          ? { ...m, attrs: { ...m.attrs, href: href(m.attrs.href) } }
          : mark;
      });
    }
    if (node.content) next.content = node.content.map(visit);
    return next;
  };
  return { type: 'doc', content: (doc.content ?? []).map(visit) };
}

function nextOrdem(
  tx: DbTx,
  table: typeof menus | typeof sections | typeof pages | typeof statusTags,
  where?: ReturnType<typeof eq>,
) {
  const row = tx.select({ value: max(table.ordem) }).from(table).where(where).get();
  return (row?.value ?? -1) + 1;
}

export function importInstance(db: Db, input: InstanceImport, autorId: string): ImportResult {
  const { images, problems } = validateFiles(input);

  // ---- slugs repetidos no próprio projeto ----
  // O de seção é único na instância inteira no CMS (no modo estático, só
  // dentro do menu); os demais, no seu nível, como nos dois modos.
  const repeated = (slugs: string[], what: (slug: string) => string) => {
    const seen = new Set<string>();
    for (const slug of slugs) {
      if (seen.has(slug)) problems.push(what(slug));
      seen.add(slug);
    }
  };
  repeated(input.menus.map((menu) => menu.slug), (slug) => `o menu "${slug}" aparece mais de uma vez.`);
  const sectionMenu = new Map<string, string>();
  for (const menu of input.menus) {
    for (const section of menu.sections) {
      const other = sectionMenu.get(section.slug);
      if (other === menu.slug) problems.push(`a seção "${menu.slug}/${section.slug}" aparece mais de uma vez.`);
      else if (other !== undefined) {
        problems.push(
          `a seção "${section.slug}" aparece nos menus "${other}" e "${menu.slug}" — no CMS o slug de seção é único na instância; renomeie uma delas.`,
        );
      }
      sectionMenu.set(section.slug, menu.slug);
      const at = `${menu.slug}/${section.slug}`;
      repeated(section.pages.map((page) => page.slug), (slug) => `a página "${at}/${slug}" aparece mais de uma vez.`);
      for (const page of section.pages) {
        repeated(page.tabs.map((tab) => tab.slug), (slug) => `a tab "${at}/${page.slug}/${slug}" aparece mais de uma vez.`);
      }
    }
  }
  if (problems.length) throw new ImportRejectedError('invalid', problems);

  // ---- conflitos com o que já existe ----
  const existingMenus = new Map(
    db
      .select({ id: menus.id, slug: menus.slug })
      .from(menus)
      .all()
      .filter((menu) => menu.slug !== null)
      .map((menu) => [menu.slug!, menu.id]),
  );
  const existingSections = new Map(
    db
      .select({ id: sections.id, slug: sections.slug, menuId: sections.menuId })
      .from(sections)
      .where(ne(sections.id, LANDING_SECTION_ID))
      .all()
      .filter((section) => section.slug !== null)
      .map((section) => [section.slug!, section]),
  );
  const menuSlugById = new Map([...existingMenus].map(([slug, id]) => [id, slug]));
  const existingPages = new Map(
    db
      .select({ id: pages.id, sectionId: pages.sectionId, slug: pages.slug })
      .from(pages)
      .where(ne(pages.id, LANDING_PAGE_ID))
      .all()
      .map((page) => [`${page.sectionId}/${page.slug}`, page.id]),
  );

  const unresolvable: string[] = [];
  const pageConflicts: string[] = [];
  for (const menu of input.menus) {
    for (const section of menu.sections) {
      const existing = existingSections.get(section.slug);
      if (!existing) continue;
      if (existing.menuId !== existingMenus.get(menu.slug)) {
        unresolvable.push(
          `a seção "${section.slug}" já existe na instância, no menu "${menuSlugById.get(existing.menuId) ?? existing.menuId}" — no CMS o slug de seção é único; renomeie a seção do projeto ou a da instância.`,
        );
        continue;
      }
      for (const page of section.pages) {
        if (existingPages.has(`${existing.id}/${page.slug}`)) {
          pageConflicts.push(`a página ${menu.slug}/${section.slug}/${page.slug} já existe.`);
        }
      }
    }
  }
  const landingPublished =
    input.landing !== null &&
    db.select({ id: revisions.id }).from(revisions).where(eq(revisions.pageId, LANDING_PAGE_ID)).limit(1).get() !==
      undefined;
  if (landingPublished) pageConflicts.push('a landing (/docs) já foi publicada.');

  // Seção em outro menu: `overwrite` não resolve, porque substitui páginas, não move seções.
  if (unresolvable.length || (pageConflicts.length && !input.overwrite)) {
    throw new ImportRejectedError('conflict', [...unresolvable, ...(input.overwrite ? [] : pageConflicts)]);
  }

  // Instância sem nenhuma página: o nome e os logos do projeto valem.
  const settingsApplied = input.overwrite || existingPages.size === 0;
  ensureSettings(db);

  return db.transaction((tx) => {
    const result: ImportResult = {
      created: { menus: 0, sections: 0, pages: 0 },
      replaced: 0,
      images: 0,
      settingsApplied,
    };

    // ---- settings e status tags ----
    if (settingsApplied) {
      const logo = (file: ExportedFile | null) => {
        if (!file) return null;
        const bytes = decode(file);
        return { bytes, mime: file.mime, hash: logoHash(bytes) };
      };
      const light = logo(input.settings.logo);
      const dark = logo(input.settings.logoDark);
      tx.update(settings)
        .set({
          nomeDesignSystem: input.settings.nome,
          ...(light && { logo: light.bytes, logoMime: light.mime, logoHash: light.hash }),
          ...(dark && { logoDark: dark.bytes, logoDarkMime: dark.mime, logoDarkHash: dark.hash }),
          atualizadoEm: new Date(),
        })
        .where(eq(settings.id, SETTINGS_ID))
        .run();
    }
    // Tags que faltam são criadas; com `overwrite`, as de mesmo nome ficam com a cor da config.
    const tagIds = new Map(tx.select().from(statusTags).all().map((tag) => [tag.titulo.trim(), tag.id]));
    for (const tag of input.settings.statusTags) {
      const titulo = tag.titulo.trim();
      const existing = tagIds.get(titulo);
      if (existing) {
        if (input.overwrite) tx.update(statusTags).set({ cor: tag.cor }).where(eq(statusTags.id, existing)).run();
        continue;
      }
      const row = tx.insert(statusTags).values({ titulo, cor: tag.cor, ordem: nextOrdem(tx, statusTags) }).returning().get();
      tagIds.set(titulo, row.id);
    }

    // ---- imagens ----
    const imageUrls = new Map<string, string>();
    for (const [ref, image] of images) imageUrls.set(ref, storeMedia(tx, image.bytes, image.mime));
    result.images = new Set(imageUrls.values()).size;

    // ---- estrutura: menus, seções, páginas e tabs (sem conteúdo ainda) ----
    // O conteúdo só entra depois de todas as tabs existirem: um link pode
    // apontar para a tab de uma página que vem mais adiante.
    const tabIds = new Map<string, string>();
    const toPublish: { pageId: string; docs: { tabId: string; doc: TiptapDoc }[] }[] = [];

    for (const menu of input.menus) {
      let menuId = existingMenus.get(menu.slug);
      if (menuId && input.overwrite) tx.update(menus).set({ titulo: menu.titulo }).where(eq(menus.id, menuId)).run();
      if (!menuId) {
        menuId = tx
          .insert(menus)
          .values({ titulo: menu.titulo, slug: menu.slug, ordem: nextOrdem(tx, menus) })
          .returning({ id: menus.id })
          .get().id;
        result.created.menus++;
      }

      for (const section of menu.sections) {
        let sectionId = existingSections.get(section.slug)?.id;
        if (sectionId && input.overwrite) {
          tx.update(sections).set({ titulo: section.titulo }).where(eq(sections.id, sectionId)).run();
        }
        if (!sectionId) {
          sectionId = tx
            .insert(sections)
            .values({
              titulo: section.titulo,
              slug: section.slug,
              menuId,
              ordem: nextOrdem(tx, sections, eq(sections.menuId, menuId)),
            })
            .returning({ id: sections.id })
            .get().id;
          result.created.sections++;
        }

        for (const page of section.pages) {
          const fields = {
            titulo: page.titulo,
            subtitulo: page.subtitulo,
            statusTagId: page.status ? (tagIds.get(page.status.trim()) ?? null) : null,
          };
          let pageId = existingPages.get(`${sectionId}/${page.slug}`);
          let primaryTabId: string | undefined;
          /** Tabs de usuário da página substituída, por título (as que sobrarem são apagadas). */
          const reusable = new Map<string, string[]>();
          if (pageId) {
            // Substituição (`overwrite`): a página mantém id, posição e
            // histórico. As tabs passam a ser as do projeto, mas a de mesmo
            // título mantém o id — e os links de outras páginas para ela.
            tx.update(pages).set(fields).where(eq(pages.id, pageId)).run();
            for (const tab of tx.select().from(tabs).where(eq(tabs.pageId, pageId)).orderBy(tabs.ordem).all()) {
              if (tab.isPrimary) primaryTabId ??= tab.id;
              else reusable.set(tab.titulo, [...(reusable.get(tab.titulo) ?? []), tab.id]);
            }
            result.replaced++;
          } else {
            pageId = tx
              .insert(pages)
              .values({ ...fields, sectionId, slug: page.slug, ordem: nextOrdem(tx, pages, eq(pages.sectionId, sectionId)) })
              .returning({ id: pages.id })
              .get().id;
            result.created.pages++;
          }
          // `undefined` = o CLI não conhece o campo (versão antiga): um rótulo que o
          // editor definiu no CMS não deve voltar para "Overview" por causa disso.
          // `null` = o projeto não define `overviewTitle`: os arquivos mandam.
          const overviewTitulo = page.overviewTitulo?.trim() || 'Overview';
          if (primaryTabId) {
            if (page.overviewTitulo !== undefined)
              tx.update(tabs).set({ titulo: overviewTitulo }).where(eq(tabs.id, primaryTabId)).run();
          } else
            primaryTabId = tx
              .insert(tabs)
              .values({ pageId, titulo: overviewTitulo, ordem: 0, isPrimary: true })
              .returning({ id: tabs.id })
              .get().id;

          const docs = [{ tabId: primaryTabId, doc: page.body as TiptapDoc }];
          page.tabs.forEach((tab, i) => {
            const kept = reusable.get(tab.titulo)?.shift();
            if (kept) tx.update(tabs).set({ ordem: i + 1 }).where(eq(tabs.id, kept)).run();
            const tabId =
              kept ??
              tx
                .insert(tabs)
                .values({ pageId: pageId!, titulo: tab.titulo, ordem: i + 1 })
                .returning({ id: tabs.id })
                .get().id;
            tabIds.set(`${menu.slug}/${section.slug}/${page.slug}/${tab.slug}`, tabId);
            docs.push({ tabId, doc: tab.doc as TiptapDoc });
          });
          for (const tabId of [...reusable.values()].flat()) tx.delete(tabs).where(eq(tabs.id, tabId)).run();
          toPublish.push({ pageId, docs });
        }
      }
    }
    if (input.landing !== null) {
      toPublish.push({ pageId: LANDING_PAGE_ID, docs: [{ tabId: LANDING_TAB_ID, doc: input.landing as TiptapDoc }] });
    }

    // ---- conteúdo e publicação ----
    const refs = { images: imageUrls, tabIds };
    for (const { pageId, docs } of toPublish) {
      for (const { tabId, doc } of docs) {
        replaceBlocksForTabInTx(tx, tabId, tiptapDocToBlocks(rewriteDoc(doc, refs), tabId));
      }
      createRevision(tx, { pageId, autorId, mensagem: IMPORT_REVISION_MESSAGE });
    }
    return result;
  });
}
