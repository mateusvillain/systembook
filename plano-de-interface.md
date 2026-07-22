# Redesign do CMS inspirado no Zeroheight

## Objetivo

Evoluir a interface do CMS para um padrão semelhante ao Zeroheight, tornando a experiência mais limpa, organizada e focada na edição da documentação.

A intenção NÃO é copiar o visual do Zeroheight, mas utilizar seus princípios de UX e arquitetura da informação.

---

# Princípios

A interface deve seguir estes princípios:

- Conteúdo é o protagonista.
- A estrutura fica sempre disponível, porém discreta.
- O usuário deve sentir que está editando uma documentação, não um banco de dados.
- A hierarquia visual precisa ser extremamente clara.
- Todas as ações importantes devem aparecer próximas ao contexto onde são utilizadas.

Evitar:

- excesso de botões
- áreas cinzas
- aparência de árvore técnica
- interface parecida com explorer de arquivos

---

# Layout

Utilizar um layout de três regiões.

---

## Header

Sidebar | Área de conteúdo
|
|
|
|

---

## Header

Header fixo.

Altura aproximada:

64px

Elementos:

esquerda

- logo
- nome do projeto

centro

- navegação principal

Exemplo:

Get started
Foundation
Components
Resources

direita

- busca
- configurações
- usuário

O header deve servir apenas para navegação entre grandes áreas.

Nunca colocar ações de edição nele.

---

# Sidebar

Largura:

240–280px

Ela representa apenas a estrutura da documentação.

Não utilizar uma árvore pesada.

Preferir um menu semelhante ao Zeroheight.

Exemplo

OVERVIEW

    Introduction
    Principles
    Release notes

STYLE

    Colors
    Typography
    Icons

COMPONENTS

    Button
    Input
    Modal

RESOURCES

    Tokens

---

Cada grupo deve possuir:

- título
- collapse
- páginas

No final de cada grupo:

- Add page

- Add subgroup

---

Página selecionada

Utilizar apenas:

- fundo sutil
- texto em destaque

Não utilizar bordas pesadas.

---

A sidebar deve parecer uma navegação.

Não um editor.

---

# Área principal

A área principal deve ocupar praticamente toda a tela.

Máximo:

1200px

Conteúdo centralizado.

Muito espaço em branco.

---

Estrutura

Categoria

Título

Descrição opcional

Metadados

Conteúdo

---

Exemplo

OVERVIEW

Introduction

Introdução da documentação.

Criado em...
Atualizado em...
Autor...

---

Markdown...

Componentes...

Blocos...

---

# Hierarquia tipográfica

Categoria

12-14px
uppercase
cinza

Título

40-48px
bold

Descrição

22-26px
peso leve

Metadados

14px
cinza

Conteúdo

16px

Line-height confortável.

---

# Estrutura da documentação

Trocar a árvore atual

Seção

└── Página

      └── Aba

por uma estrutura mais próxima do Zeroheight.

Categoria

↓

Página

↓

Tabs opcionais

Ou seja

Get started

    Installation

    Design

    Vibe Code

Foundation

    Colors

    Typography

Components

    Button

        Anatomy

        Usage

        Accessibility

---

As Tabs devem existir apenas dentro da página.

Nunca na árvore.

---

# Editor

Quando uma página estiver aberta

Mostrar:

Categoria

Título

Descrição

Status

Data

Autor

Editor

Exemplo

---

OVERVIEW

Introduction

Descrição...

Draft

Atualizado ontem

por Mateus

---

Markdown editor

---

---

# Componentes

Criar componentes específicos.

## Section Header

Possui

Categoria

Título

Descrição

Status

---

## Documentation Block

Bloco utilizado para:

texto

alerta

imagem

vídeo

código

componentes

API

etc.

Cada bloco deve possuir toolbar própria.

---

## Inline Toolbar

Ao passar o mouse

Mostrar

-

Adicionar bloco

⋮

Mais ações

---

## Empty State

Quando não existir conteúdo

Mostrar uma ilustração simples.

Título

Descrição

Botão

Adicionar conteúdo

---

# Ações

Evitar botões espalhados.

Priorizar ações contextuais.

Exemplo

Página

⋮

Renomear

Duplicar

Mover

Excluir

---

Adicionar página

deve ficar

embaixo da categoria.

Adicionar tab

deve ficar

dentro da página.

---

# Navegação

Adicionar breadcrumbs.

Exemplo

Get started

>

Installation

>

Accessibility

---

# Busca

Adicionar busca global.

A busca deve encontrar:

- páginas

- componentes

- tokens

- usuários

- conteúdo

---

# Tokens visuais

Seguir um visual minimalista.

Espaçamento

8px

16px

24px

32px

48px

64px

Raio

8px

12px

Sombras muito discretas.

Nenhuma borda pesada.

---

# Cores

Priorizar branco.

Fundos

#FFFFFF

#FAFAFA

Bordas

#EAEAEA

Texto

#111111

Texto secundário

#666666

Apenas uma cor primária para ações.

---

# Estados

Todos os elementos precisam possuir

hover

focus

active

disabled

selected

---

# Responsividade

Desktop

Sidebar fixa.

Tablet

Sidebar recolhível.

Mobile

Sidebar em drawer.

---

# Experiência

O usuário deve sentir que está escrevendo uma documentação moderna.

A interface deve lembrar ferramentas como:

- Zeroheight
- Notion
- Linear
- Figma
- Slab

e não um painel administrativo tradicional.

---

# Não fazer

Não utilizar:

- muitas caixas
- muitos cards
- bordas grossas
- árvore com linhas
- botões cinzas
- muitos níveis de indentação
- interface semelhante ao Windows Explorer

---

# Resultado esperado

A nova interface deve transmitir:

- simplicidade
- foco no conteúdo
- alta legibilidade
- aparência premium
- organização
- rapidez para navegar

Toda decisão visual deve favorecer a documentação e reduzir o ruído da interface.
