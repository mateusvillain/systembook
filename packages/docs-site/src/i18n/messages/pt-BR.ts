import type { DocsMessages } from './en.js';

export const ptBR: DocsMessages = {
  'state.loading': 'Carregando…',
  'state.pageLoadFailed': 'Não foi possível carregar a página.',
  'state.tokensLoadFailed': 'Não foi possível carregar os design tokens.',

  'layout.openNavigation': 'Abrir navegação',
  'layout.switchToLight': 'Mudar para o tema claro',
  'layout.switchToDark': 'Mudar para o tema escuro',
  'layout.lightTheme': 'Tema claro',
  'layout.darkTheme': 'Tema escuro',
  'nav.documentation': 'Navegação da documentação',
  'nav.menus': 'Menus da documentação',
  'nav.tokens': 'Tokens',
  'nav.empty': 'Nenhuma página publicada ainda.',

  'search.placeholder': 'Buscar na documentação',
  'search.placeholderNamed': 'Buscar em {name}',
  'search.dialog': 'Busca',
  'search.results': 'Resultados',
  'search.searching': 'Buscando…',
  'search.noResults': 'Nenhum resultado encontrado.',
  'search.resultCount': { one: '{count} resultado', other: '{count} resultados' },
  'search.navigate': 'Navegar',
  'search.select': 'Selecionar',
  'search.close': 'Fechar',
  'search.closeDialog': 'Fechar busca',

  'toc.label': 'Sumário',
  'toc.title': 'Nesta página',

  'page.views': 'Abas da página',
  'page.overview': 'Visão geral',
  'page.noContent': 'A página não tem conteúdo.',
  'page.notPublished': 'Esta página ainda não foi publicada.',
  'page.notPublishedTitle': 'Esta página ainda não foi publicada',
  'page.notPublishedHint': 'Quando ela for publicada no painel, o conteúdo aparecerá aqui.',
  'page.notFoundTitle': 'Página não encontrada',
  'page.notFound': 'Esta página não existe ou o endereço mudou.',

  'home.title': 'Documentação',
  'home.startAt': 'Bem-vindo à documentação. Comece por {page}.',
  'home.empty': 'Nenhuma página foi publicada ainda. Publique uma página no painel para que ela apareça aqui.',
  'home.customize': 'Administradores podem personalizar esta página inicial no painel.',

  'anchor.copyLink': 'Copiar link',
  'anchor.linkCopied': 'Link copiado',
  'anchor.section': 'Copiar link para esta seção',
  'anchor.sectionCopied': 'Link da seção copiado',
  'anchor.code': 'Copiar link para este bloco de código',
  'anchor.codeCopied': 'Link do bloco de código copiado',
  'anchor.example': 'Copiar link para este exemplo',
  'anchor.exampleCopied': 'Link do exemplo copiado',

  'tokens.title': 'Tokens',
  'tokens.count': { one: '{count} design token.', other: '{count} design tokens.' },
  'tokens.countInModes': {
    one: '{count} design token em {modeCount} modos ({modes}).',
    other: '{count} design tokens em {modeCount} modos ({modes}).',
  },
  'tokens.ungrouped': 'Sem grupo',
};
