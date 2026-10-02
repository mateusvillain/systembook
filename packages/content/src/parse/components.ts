import type { RootContent } from 'mdast';
import type { TiptapNode } from '../blocks.js';
import type { DiagnosticBag, Positioned } from '../diagnostics.js';
import { didYouMean } from '../diagnostics.js';

/**
 * Componentes MDX de bloco (SYS-94): `<Callout>`, `<ComponentEmbed>` e
 * `<DosDonts>`, com **props literais** (string entre aspas). O contrato está em
 * `docs/static-format.md`, "Componentes MDX". Nada é executado: o elemento é
 * lido do AST e vira o nó Tiptap correspondente.
 */

/** Shape mínimo de um elemento JSX do remark-mdx. */
export interface JsxElement extends Positioned {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement';
  name: string | null;
  attributes: JsxAttribute[];
  children: unknown[];
}

type JsxAttribute =
  | ({ type: 'mdxJsxAttribute'; name: string; value: string | null | { type: string } } & Positioned)
  | ({ type: 'mdxJsxExpressionAttribute' } & Positioned);

export const BLOCK_COMPONENTS = ['Callout', 'ComponentEmbed', 'DosDonts'] as const;
type BlockComponent = (typeof BLOCK_COMPONENTS)[number];

export function isBlockComponent(name: string | null): name is BlockComponent {
  return BLOCK_COMPONENTS.includes(name as BlockComponent);
}

/** O que o componente precisa do conversor de blocos (evita import circular). */
export interface ComponentContext {
  bag: DiagnosticBag;
  /** Converte os filhos; `parent` liga as regras de aninhamento do CMS. */
  convertChildren: (children: RootContent[], parent: 'callout' | 'dosDonts') => TiptapNode[];
  /** Registra a imagem do cover para o build resolver. */
  addImage: (src: string, node: Positioned) => void;
}

interface PropSpec {
  /** Valores aceitos; ausente = qualquer texto. */
  oneOf?: readonly string[];
  required?: boolean;
}

/**
 * Lê as props como strings literais. Expressão `{…}`, spread, prop sem valor,
 * prop desconhecida, obrigatória ausente e valor fora da lista são erro.
 * Devolve `null` se houve qualquer erro (já registrado).
 */
function readProps(
  el: JsxElement,
  specs: Record<string, PropSpec>,
  bag: DiagnosticBag,
): Record<string, string> | null {
  const props: Record<string, string> = {};
  let ok = true;
  const known = Object.keys(specs);

  for (const attr of el.attributes) {
    if (attr.type === 'mdxJsxExpressionAttribute') {
      bag.report(attr.position ? attr : el, `<${el.name}>: spread de props (\`{...x}\`) não é permitido.`);
      ok = false;
      continue;
    }
    const at = attr.position ? attr : el;
    const spec = specs[attr.name];
    if (!spec) {
      const accepted = known.map((k) => `\`${k}\``).join(', ');
      bag.report(at, `<${el.name}>: prop "${attr.name}" não existe${didYouMean(attr.name, known)} — aceitas: ${accepted}.`);
      ok = false;
      continue;
    }
    if (typeof attr.value !== 'string') {
      bag.report(
        at,
        attr.value === null
          ? `<${el.name}>: a prop "${attr.name}" precisa de um valor entre aspas.`
          : `<${el.name}>: a prop "${attr.name}" precisa ser texto entre aspas, sem \`{…}\`.`,
      );
      ok = false;
      continue;
    }
    if (spec.oneOf && !spec.oneOf.includes(attr.value)) {
      bag.report(
        at,
        `<${el.name}>: "${attr.value}" não é um valor de "${attr.name}"${didYouMean(attr.value, spec.oneOf)} — use ${spec.oneOf.map((v) => `"${v}"`).join(', ')}.`,
      );
      ok = false;
      continue;
    }
    props[attr.name] = attr.value;
  }

  for (const [name, spec] of Object.entries(specs)) {
    if (spec.required && props[name] === undefined && !el.attributes.some((a) => 'name' in a && a.name === name)) {
      bag.report(el, `<${el.name}>: a prop "${name}" é obrigatória.`);
      ok = false;
    }
  }
  return ok ? props : null;
}

/** Filhos com conteúdo (ignora espaços entre as tags). */
function meaningfulChildren(el: JsxElement): RootContent[] {
  return (el.children as RootContent[]).filter(
    (child) => !(child.type === 'text' && child.value.trim() === ''),
  );
}

function callout(el: JsxElement, ctx: ComponentContext): TiptapNode | null {
  const props = readProps(el, { variant: { oneOf: ['info', 'warning', 'tip'] } }, ctx.bag);
  const children = meaningfulChildren(el);
  const content = ctx.convertChildren(children, 'callout');
  if (!children.length) ctx.bag.report(el, '<Callout> vazio — escreva o conteúdo entre as tags.');
  // Filhos que existiam mas foram recusados já têm o próprio erro.
  if (!props || !content.length) return null;
  return { type: 'callout', attrs: { variant: props.variant ?? 'info' }, content };
}

function componentEmbed(el: JsxElement, ctx: ComponentContext): TiptapNode | null {
  const props = readProps(el, { component: { required: true }, variant: { required: true } }, ctx.bag);
  if (meaningfulChildren(el).length) {
    ctx.bag.report(el, '<ComponentEmbed> não tem conteúdo — use a forma auto-fechada: <ComponentEmbed … />.');
    return null;
  }
  if (!props) return null;
  return {
    type: 'componentEmbed',
    attrs: { componentName: props.component, variantId: props.variant },
  };
}

function dosDonts(el: JsxElement, ctx: ComponentContext): TiptapNode | null {
  const props = readProps(
    el,
    {
      variant: { oneOf: ['do', 'dont'], required: true },
      title: {},
      coverImage: {},
      coverAlt: {},
      coverComponent: {},
      coverVariant: {},
    },
    ctx.bag,
  );
  const children = meaningfulChildren(el);
  const content = ctx.convertChildren(children, 'dosDonts');
  if (!children.length) ctx.bag.report(el, '<DosDonts> vazio — escreva a explicação entre as tags.');
  if (!props) return null;

  const image = props.coverImage !== undefined || props.coverAlt !== undefined;
  const component = props.coverComponent !== undefined || props.coverVariant !== undefined;
  let cover: Record<string, unknown> | null = null;
  if (image && component) {
    ctx.bag.report(el, '<DosDonts>: o cover é uma imagem ou um componente — use `coverImage` ou `coverComponent`, não os dois.');
    return null;
  }
  if (image) {
    if (props.coverImage === undefined || props.coverAlt === undefined) {
      ctx.bag.report(el, '<DosDonts>: `coverImage` e `coverAlt` andam juntos.');
      return null;
    }
    ctx.addImage(props.coverImage, el);
    cover = { kind: 'image', src: props.coverImage, alt: props.coverAlt };
  }
  if (component) {
    if (props.coverComponent === undefined || props.coverVariant === undefined) {
      ctx.bag.report(el, '<DosDonts>: `coverComponent` e `coverVariant` andam juntos.');
      return null;
    }
    cover = { kind: 'component-embed', componentName: props.coverComponent, variantId: props.coverVariant };
  }
  if (!content.length) return null;
  return {
    type: 'dosDonts',
    attrs: { variant: props.variant, titulo: props.title ?? '', cover },
    content,
  };
}

/** Converte um componente de bloco; `null` se houve erro (já registrado). */
export function blockComponent(el: JsxElement, ctx: ComponentContext): TiptapNode | null {
  switch (el.name as BlockComponent) {
    case 'Callout':
      return callout(el, ctx);
    case 'ComponentEmbed':
      return componentEmbed(el, ctx);
    case 'DosDonts':
      return dosDonts(el, ctx);
  }
}
