import type { MessageValue, PluralMessage } from '../format.js';

/**
 * Dicionário de referência da doc pública: as chaves daqui são as que todo
 * outro idioma precisa ter, na mesma forma — texto onde aqui é texto, plural
 * onde aqui é plural (o typecheck quebra se faltar uma ou se a forma mudar).
 */
export const en = {
  // Estados de carregamento e erro
  'state.loading': 'Loading…',
  'state.pageLoadFailed': 'Failed to load the page.',
  'state.tokensLoadFailed': 'Failed to load the design tokens.',

  // Shell: header, drawer e sidebar
  'layout.openNavigation': 'Open navigation',
  'layout.switchToLight': 'Switch to light theme',
  'layout.switchToDark': 'Switch to dark theme',
  'layout.lightTheme': 'Light theme',
  'layout.darkTheme': 'Dark theme',
  'nav.documentation': 'Documentation navigation',
  'nav.menus': 'Documentation menus',
  'nav.tokens': 'Tokens',
  'nav.empty': 'No pages published yet.',

  // Busca e command palette
  'search.placeholder': 'Search the documentation',
  'search.placeholderNamed': 'Search {name}',
  'search.dialog': 'Search',
  'search.results': 'Results',
  'search.searching': 'Searching…',
  'search.noResults': 'No results found.',
  'search.resultCount': { one: '{count} result', other: '{count} results' },
  'search.navigate': 'Navigate',
  'search.select': 'Select',
  'search.close': 'Close',
  'search.closeDialog': 'Close search',

  // Sumário
  'toc.label': 'Table of contents',
  'toc.title': 'On this page',

  // Página
  'page.views': 'Page views',
  'page.overview': 'Overview',
  'page.noContent': 'Page has no content.',
  'page.notPublished': 'This page has not been published yet.',
  'page.notPublishedTitle': 'This page has not been published yet',
  'page.notPublishedHint': 'Once it is published in the panel, the content will appear here.',
  'page.notFoundTitle': 'Page not found',
  'page.notFound': 'This page does not exist or the address has changed.',

  // Landing padrão (sem landing publicada). `{page}` é o link para a 1ª página.
  'home.title': 'Documentation',
  'home.startAt': 'Welcome to the documentation. Start with {page}.',
  'home.empty': 'No pages have been published yet. Publish a page in the panel for it to show up here.',
  'home.customize': 'Admins can customize this home page in the admin panel.',

  // Copiar link (headings e blocos)
  'anchor.copyLink': 'Copy link',
  'anchor.linkCopied': 'Link copied',
  'anchor.section': 'Copy link to this section',
  'anchor.sectionCopied': 'Section link copied',
  'anchor.code': 'Copy link to this code block',
  'anchor.codeCopied': 'Link to this code block copied',
  'anchor.example': 'Copy link to this example',
  'anchor.exampleCopied': 'Link to this example copied',

  // Página Tokens
  'tokens.title': 'Tokens',
  'tokens.count': { one: '{count} design token.', other: '{count} design tokens.' },
  'tokens.countInModes': {
    one: '{count} design token in {modeCount} modes ({modes}).',
    other: '{count} design tokens in {modeCount} modes ({modes}).',
  },
  'tokens.ungrouped': 'Ungrouped',
} satisfies Record<string, MessageValue>;

export type DocsMessageKey = keyof typeof en;
export type DocsMessages = {
  [K in DocsMessageKey]: (typeof en)[K] extends string ? string : PluralMessage;
};
