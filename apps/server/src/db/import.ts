import { eq, max, ne } from 'drizzle-orm';
import type { ExportedFile, ImportResult, InstanceImport } from '@systembook/schema';
import { tiptapDocToBlocks, type TiptapDoc, type TiptapNode } from '../blocks/serialize.js';
import { ALLOWED_MEDIA_MIMES, MAX_MEDIA_BYTES, storeMedia } from '../media/serve.js';
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
    const [pathname = '', hash] = value.split('#', 2) as [string, string | undefined];
    const segments = pathname.slice(PUBLIC_PREFIX.length).split('/');
    if (segments.length !== 4) return value;
    const tabId = refs.tabIds.get(segments.join('/'));
    if (!tabId) return value;
    return `${PUBLIC_PREFIX}${[...segments.slice(0, 3), tabId].join('/')}${hash ? `#${hash}` : ''}`;
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

function nextOrdem(tx: DbTx, table: typeof menus | typeof sections | typeof pages, where?: ReturnType<typeof eq>) {
  const row = tx.select({ value: max(table.ordem) }).from(table).where(where).get();
  return (row?.value ?? -1) + 1;
}

export function importInstance(db: Db, input: InstanceImport, autorId: string): ImportResult {
  const { images, problems } = validateFiles(input);

  // ---- slugs de seção: únicos na instância inteira ----
  const importedSections = new Map<string, string>();
  for (const menu of input.menus) {
    for (const section of menu.sections) {
      const other = importedSections.get(section.slug);
      if (other !== undefined && other !== menu.slug) {
        problems.push(
          `a seção "${section.slug}" aparece nos menus "${other}" e "${menu.slug}" — no CMS o slug de seção é único na instância; renomeie uma delas.`,
        );
      }
      importedSections.set(section.slug, menu.slug);
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

  const hard: string[] = [];
  const pageConflicts: string[] = [];
  for (const menu of input.menus) {
    for (const section of menu.sections) {
      const existing = existingSections.get(section.slug);
      if (!existing) continue;
      if (existing.menuId !== existingMenus.get(menu.slug)) {
        hard.push(
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

  if (hard.length || (pageConflicts.length && !input.overwrite)) {
    throw new ImportRejectedError('conflict', [...hard, ...(input.overwrite ? [] : pageConflicts)]);
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
    const tagIds = new Map(tx.select().from(statusTags).all().map((tag) => [tag.titulo.trim(), tag.id]));
    let tagOrdem = (tx.select({ value: max(statusTags.ordem) }).from(statusTags).get()?.value ?? -1) + 1;
    for (const tag of input.settings.statusTags) {
      const titulo = tag.titulo.trim();
      if (tagIds.has(titulo)) continue;
      const row = tx.insert(statusTags).values({ titulo, cor: tag.cor, ordem: tagOrdem++ }).returning().get();
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
          if (pageId) {
            // Substituição (`overwrite`): a página mantém id, posição e
            // histórico; as tabs de usuário dão lugar às do projeto.
            tx.update(pages).set(fields).where(eq(pages.id, pageId)).run();
            const pageTabs = tx.select().from(tabs).where(eq(tabs.pageId, pageId)).all();
            primaryTabId = pageTabs.find((tab) => tab.isPrimary)?.id;
            for (const tab of pageTabs) if (tab.id !== primaryTabId) tx.delete(tabs).where(eq(tabs.id, tab.id)).run();
            result.replaced++;
          } else {
            pageId = tx
              .insert(pages)
              .values({ ...fields, sectionId, slug: page.slug, ordem: nextOrdem(tx, pages, eq(pages.sectionId, sectionId)) })
              .returning({ id: pages.id })
              .get().id;
            result.created.pages++;
          }
          primaryTabId ??= tx
            .insert(tabs)
            .values({ pageId, titulo: 'Conteúdo', ordem: 0, isPrimary: true })
            .returning({ id: tabs.id })
            .get().id;

          const docs = [{ tabId: primaryTabId, doc: page.body as TiptapDoc }];
          page.tabs.forEach((tab, i) => {
            const tabId = tx
              .insert(tabs)
              .values({ pageId: pageId!, titulo: tab.titulo, ordem: i + 1 })
              .returning({ id: tabs.id })
              .get().id;
            tabIds.set(`${menu.slug}/${section.slug}/${page.slug}/${tab.slug}`, tabId);
            docs.push({ tabId, doc: tab.doc as TiptapDoc });
          });
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
