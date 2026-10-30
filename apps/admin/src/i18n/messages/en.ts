import type { MessageValue, PluralMessage } from '@systembook/docs-site';

/**
 * Dicionário de referência do admin (SYS-175): as chaves daqui são as que todo
 * outro idioma precisa ter, na mesma forma — texto onde aqui é texto, plural
 * onde aqui é plural (o typecheck quebra se faltar uma ou se a forma mudar).
 * Prefixo da chave = área do painel.
 */
export const en = {
  // Datas
  'dates.justNow': 'just now',

  // Idioma da interface (menu do usuário)
  'language.label': 'Language',
  'language.automatic': 'Automatic (browser)',
  'language.saveFailed': 'Could not save the language.',

  // Comum
  'common.loading': 'Loading…',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.rename': 'Rename',
  'common.delete': 'Delete',
  'common.moveUp': 'Move up',
  'common.moveDown': 'Move down',
  'common.dragToReorder': 'Drag (or use the arrow keys) to reorder',
  'common.linkCopied': 'Link copied',
  'common.linkCopyFailed': 'Could not copy the link',
  'common.copyLink': 'Copy link',
  'common.notifications': 'Notifications',

  // Login
  'login.description': 'Sign in to manage the documentation.',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.invalid': 'Invalid email or password',

  // Header e menu do usuário
  'header.toggleNavigation': 'Toggle navigation',
  'header.menus': 'Menus',
  'header.addMenu': 'Add menu',
  'header.menuName': 'Menu name',
  'header.newMenuName': 'New menu name',
  'header.createMenu': 'Create menu',
  'header.renameMenu': 'New title for menu {name}',
  'header.reorderMenu': 'Reorder menu {name}',
  'header.menuActions': 'More actions for menu {name}',
  'header.menuNoPages': 'This menu has no pages yet',
  'header.deleteMenuConfirm':
    'Delete the menu "{name}"? All sections, pages, and tabs inside it will also be removed.',
  'userMenu.trigger': 'User menu',
  'userMenu.activity': 'Activity',
  'userMenu.landingPage': 'Landing page',
  'userMenu.statusTags': 'Status tags',
  'userMenu.users': 'Users',
  'userMenu.uploadTokens': 'Upload tokens',
  'userMenu.identity': 'Identity',
  'userMenu.signOut': 'Sign out',
  'roles.admin': 'admin',
  'roles.editor': 'editor',

  // Árvore de navegação
  'tree.label': 'Documentation structure',
  'tree.loadingMenu': 'Loading menu…',
  'tree.noSections': 'No sections in this menu yet.',
  'tree.newSection': 'New section',
  'tree.createSection': 'Create section',
  'tree.deleteSectionConfirm': 'Delete the section "{name}"? All pages inside it will also be removed.',
  'tree.reorderSection': 'Reorder section {name}',
  'tree.expandSection': 'Expand section {name}',
  'tree.collapseSection': 'Collapse section {name}',
  'tree.sectionActions': 'More actions for section {name}',
  'tree.renameSection': 'New title for section {name}',
  'tree.saveSectionTitle': 'Save title for section {name}',
  'tree.deletePageConfirm': 'Delete the page "{name}" and all of its content?',
  'tree.reorderPage': 'Reorder page {name}',
  'tree.pageActions': 'More actions for page {name}',
  'tree.renamePage': 'New title for page {name}',
  'tree.savePageTitle': 'Save title for page {name}',
  'tree.pageNoSlug': 'This page has no slug yet',
  'tree.addPage': 'Add page',
  'tree.pageTitle': 'Page title',
  'tree.newPageTitle': 'New page title',
  'tree.slugOptional': 'slug (optional)',
  'tree.newPageSlug': 'New page slug (optional)',
  'tree.createPage': 'Create page',
  'tree.slugHint': 'Leave the slug blank to generate it from the title.',
  'tree.createPageFailed': 'Could not create the page.',
  'tree.slugTaken': 'A page with this slug already exists in the section.',
  'tree.slugInvalid': 'Invalid slug: use lowercase letters, numbers, and hyphens.',
  'tree.titleNoSlug': 'The title does not produce a valid slug — provide one manually.',
  'tree.notPublished': 'Not published yet',
  'tree.unpublishedChanges': 'Unpublished changes',
  'tree.pageNotPublished': '{name}: not published yet',
  'tree.pageUnpublishedChanges': '{name}: unpublished changes',
  'tree.moveToMenu': 'Move to another menu',
  'tree.noOtherSection': 'No other section',
  'tree.pageMoved': 'Page moved',
  'tree.pageMoveFailed': 'Could not move the page',

  // Busca do painel
  'search.trigger': 'Search',
  'search.navigationTrigger': 'Search the navigation',
  'search.navigationPlaceholder': 'Search…',
  'search.dialog': 'Search the panel',
  'search.placeholder': 'Search menus, pages, content…',
  'search.hint': 'Type to search the structure and published content.',
  'search.searching': 'Searching…',
  'search.noResults': 'No results',
  'search.noResultsFor': 'Nothing matches “{query}”. Try another term.',
  'search.structure': 'Structure and drafts',
  'search.content': 'Published content',
  'search.draft': 'Draft',
  'search.kind.menu': 'Menu',
  'search.kind.section': 'Section',
  'search.kind.page': 'Page',
  'search.kind.tab': 'Tab',
  'search.navigate': 'navigate',
  'search.open': 'open',
  'search.close': 'close',

  // Home (dashboard)
  'dashboard.title': 'Home',
  'dashboard.intro': 'Pick a page in the sidebar to edit, or keep building the structure below.',
  'dashboard.noSections': 'No sections yet',
  'dashboard.noSectionsDescription':
    'Sections group the pages in this menu. Create the first one to start building your documentation.',
  'dashboard.createFirstSection': 'Create first section',
  'dashboard.sectionName': 'Section name',
  'dashboard.noPages': 'No pages in this section',
  'dashboard.noPagesDescription': 'Create the first page to start writing.',
  'dashboard.createFirstPage': 'Create first page',
} satisfies Record<string, MessageValue>;

export type AdminMessageKey = keyof typeof en;
export type AdminMessages = {
  [K in AdminMessageKey]: (typeof en)[K] extends string ? string : PluralMessage;
};
