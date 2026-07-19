# SystemBook — Resumo do Projeto

SystemBook é uma plataforma open source e self-hosted para documentação de design systems, no estilo Material Design Docs / Atlassian Design System. Diferente de soluções Git-based (Docusaurus, Decap), é um CMS real com backend próprio (Node.js + tRPC + Drizzle/SQLite), permitindo que designers e editores publiquem e atualizem conteúdo diretamente pelo painel, sem depender de PR/deploy feito por engenharia. Roda como container Docker único, sem dependência de serviços terceiros pagos, e cada instância documenta um único design system.

## Principais funcionalidades

- **Autenticação e papéis**: login local (email/senha) com papéis `admin` e `editor`, ambos com CRUD completo sobre a estrutura de navegação.
- **Estrutura de navegação em árvore**: `sections → pages → tabs`, editável via painel com reordenação.
- **Editor de conteúdo (Tiptap)**: blocos tipados (texto, lista, código, imagem, tabela, callout, component-embed), com autosave por debounce e revisões versionadas (snapshot completo, restauráveis).
- **Conector e harness de preview**: pacote instalado no repositório do time de design system, que builda arquivos `*.preview.tsx` no CI deles (fora da instância) e envia o artefato estático via upload autenticado.
- **Live preview real**: `component-embed` renderiza um iframe do componente real e interativo, com seletor de variante e controles via `postMessage` — tanto no editor quanto na doc publicada.
- **Visualização pública**: leitura navegável, com busca full-text (SQLite FTS5), tema dark/light e responsividade.

## Principais fluxos de usuário

1. **Bootstrap**: sobe o container, seed cria o admin inicial a partir de variáveis de ambiente.
2. **Gestão de usuários**: admin cria editores diretamente, define papel e senha inicial (sem convite por email).
3. **Montagem da estrutura**: admin/editor cria seções → páginas → tabs.
4. **Edição de conteúdo**: editor escreve no Tiptap, autosave salva rascunho, "Publicar" cria uma revisão e torna o conteúdo público.
5. **Pipeline de preview**: CI do time consumidor builda `*.preview.tsx` e envia para a instância via token de upload; o artefato fica disponível para embutir na doc.
6. **Leitura pública**: visitante navega, busca e interage com os componentes reais embutidos.

## Requisitos-chave

- Zero custo além da hospedagem — sem serviços de terceiros pagos, sem MCPs externos.
- Backend real (tRPC + Drizzle/SQLite), não Git-based.
- Live preview buildado no CI do time consumidor, não na instância da plataforma.
- 1 instância = 1 design system, sem multi-tenancy no MVP.
- Sem fluxo de aprovação — editor publica direto.
- Versionamento por snapshot completo (sem diff/CRDT) no MVP.
