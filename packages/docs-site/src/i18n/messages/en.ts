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
  'locale.nav': 'Language',
  'locale.current': 'Language: {name}',

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
  'page.fallback': 'This page is not available in {requested} yet. Showing the {served} version.',
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

  // Bloco de código: botão de copiar
  'code.copy': 'Copy',
  'code.copyTitle': 'Copy code',
  'code.copied': 'Copied',
  'code.copiedLabel': 'Code copied',
  'code.copiedAnnounce': 'Code copied to clipboard',
  'code.pressCopy': 'Press ⌘C',
  'code.manualTitle': 'Press Ctrl+C or Cmd+C to copy',
  'code.manualLabel': 'Could not copy automatically — the code is selected, press Ctrl+C or Cmd+C',
  'code.manualAnnounce': 'Could not copy automatically. The code is selected — press Ctrl+C or Cmd+C.',
  'code.selectTitle': 'Select the code and press Ctrl+C or Cmd+C',
  'code.selectLabel': 'Could not copy automatically — select the code and press Ctrl+C or Cmd+C',
  'code.selectAnnounce': 'Could not copy automatically. Select the code and press Ctrl+C or Cmd+C.',

  // Exemplo de componente e cover do do's & don'ts. `{component}` é o nome em negrito.
  'embed.noComponent': 'No component selected',
  'embed.selectVariant': 'Preview of {component} — select a variant',
  'embed.loading': 'Loading preview of {component}…',
  'embed.loadingCover': 'Loading preview…',
  'embed.notPublished': 'No preview published for {component} yet.',
  'embed.publishHint': 'Publish it via the connector in the component repository.',
  'embed.frameTitle': 'Preview of {component} ({variant})',
  'embed.coverTitle': 'Cover of {component} ({variant})',
  'embed.controls': 'Controls ({count})',
  'embed.controlsLabel': 'Preview controls',
  'embed.tokenMode': 'Token mode',

  // Do's & don'ts: o tipo do bloco para leitor de tela (o ícone é decorativo)
  'dosDonts.do': 'Do',
  'dosDonts.dont': "Don't",

  // Bloco de tabela de tokens. `{group}` é o caminho do grupo em código.
  'tokenBlock.loading': 'Loading tokens…',
  'tokenBlock.all': 'All tokens',
  'tokenBlock.loadFailed': 'Could not load the design tokens.',
  'tokenBlock.none': 'No design tokens published yet.',
  'tokenBlock.emptyGroup': 'No tokens in group {group}.',

  // Renderers de tokens
  'tokens.colToken': 'Token',
  'tokens.colValue': 'Value',
  'tokens.colDetails': 'Details',
  'tokens.deprecated': 'Deprecated',
  'tokens.sameInAllModes': 'Same in all modes',
  'tokens.tableLabel': '{label} ({kinds})',
  'tokens.colorScales': 'color scales',
  'tokens.play': 'Play {name}',
  // Amostra de fonte: ascendentes, descendentes e as letras que mais mudam entre
  // fontes, longa o bastante para quebrar em duas linhas (e a altura de linha aparecer).
  'tokens.typeSample': 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.',
  'tokens.fontFamily': 'Family',
  'tokens.fontSize': 'Size',
  'tokens.fontWeight': 'Weight',
  'tokens.letterSpacing': 'Letter spacing',
  'tokens.lineHeight': 'Line height',

  // Copiar o nome de um token. `{name}` é o formato ("CSS variable"), `{value}` o
  // texto copiado. O `{name}` só aparece dentro destas frases, e cada idioma o
  // escreve como a frase pede (o pt-BR leva artigo: "a variável CSS").
  'tokens.copyCss': 'CSS',
  'tokens.copyCssName': 'CSS variable',
  'tokens.copyJs': 'JS',
  'tokens.copyJsName': 'JS path',
  'tokens.copyPath': 'Path',
  'tokens.copyPathName': 'token path',
  'tokens.copyCopied': 'Copied',
  'tokens.copyFailed': 'Failed',
  'tokens.copyLabel': '{state}: copy {name} {value}',
  'tokens.copyAnnounce': 'Copied {name} {value}',
  'tokens.copyFailedAnnounce': 'Could not copy {name} — select {value} and copy it',
} satisfies Record<string, MessageValue>;

export type DocsMessageKey = keyof typeof en;
export type DocsMessages = {
  [K in DocsMessageKey]: (typeof en)[K] extends string ? string : PluralMessage;
};
