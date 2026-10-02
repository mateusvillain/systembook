import type { RootContent } from 'mdast';
import type { DosDontsCover } from '@systembook/schema';
import type { TiptapNode } from '../blocks.js';
import type { DiagnosticBag, Positioned } from '../diagnostics.js';
import { didYouMean } from '../diagnostics.js';

/**
 * Componentes MDX (SYS-94): os de bloco `<Callout>`, `<ComponentEmbed>` e
 * `<DosDonts>`, com **props literais** (string entre aspas), e o inline `<u>`
 * (tratado em `toTiptap.ts`). O contrato está em `docs/static-format.md`,
 * "Componentes MDX". Nada é executado: o elemento é lido do AST e vira o nó
 * Tiptap correspondente.
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

const BLOCK_COMPONENTS = ['Callout', 'ComponentEmbed', 'DosDonts'] as const;
type BlockComponent = (typeof BLOCK_COMPONENTS)[number];

/** Todos os componentes aceitos, para as mensagens: `<Callout>, …, ou <u>`. */
export const ACCEPTED_COMPONENTS = `${BLOCK_COMPONENTS.map((c) => `<${c}>`).join(', ')} ou <u>`;

export function isBlockComponent(name: string | null): name is BlockComponent {
  return BLOCK_COMPONENTS.includes(name as BlockComponent);
}

/** Mensagem para um elemento JSX que não é um componente aceito. */
export function componentMessage(name: string | null): string {
  return name
    ? `<${name}> não é um componente aceito — use ${ACCEPTED_COMPONENTS}.`
    : `fragmento JSX (<>…</>) não é aceito — use ${ACCEPTED_COMPONENTS}.`;
}

/** Filhos com conteúdo (ignora espaços entre as tags). */
export function meaningful<T extends { type: string }>(children: readonly T[]): T[] {
  return children.filter(
    (child) => !(child.type === 'text' && (child as unknown as { value: string }).value.trim() === ''),
  );
}

/** O que o componente precisa do conversor de blocos (evita import circular). */
export interface ComponentContext {
  bag: DiagnosticBag;
  convertChildren: (children: RootContent[]) => TiptapNode[];
  /** Registra uma imagem para o build resolver. */
  addImage: (src: string, at: Positioned) => void;
}

interface PropSpec {
  /** Valores aceitos; ausente = qualquer texto não vazio. */
  oneOf?: readonly string[];
  required?: boolean;
  /** Aceita `""` (só faz sentido em texto livre opcional, como `title`). */
  allowEmpty?: boolean;
}

interface Prop {
  value: string;
  at: Positioned;
}

/**
 * Lê as props como strings literais. Expressão `{…}`, spread, prop sem valor,
 * prop desconhecida, repetida, vazia, obrigatória ausente e valor fora da lista
 * são erro. Devolve `null` se houve qualquer erro (já registrado).
 */
function readProps(
  el: JsxElement,
  specs: Record<string, PropSpec>,
  bag: DiagnosticBag,
): Record<string, Prop> | null {
  const props: Record<string, Prop> = {};
  const seen = new Set<string>();
  let ok = true;
  const known = Object.keys(specs);
  const fail = (at: Positioned, message: string) => {
    bag.report(at.position ? at : el, `<${el.name}>: ${message}`);
    ok = false;
  };

  for (const attr of el.attributes) {
    if (attr.type === 'mdxJsxExpressionAttribute') {
      fail(attr, 'spread de props ({...x}) não é permitido — escreva cada prop com o valor entre aspas.');
      continue;
    }
    const spec = specs[attr.name];
    if (!spec) {
      const accepted = known.map((k) => `"${k}"`).join(', ');
      fail(attr, `a prop "${attr.name}" não existe${didYouMean(attr.name, known)} — aceitas: ${accepted}.`);
      continue;
    }
    if (seen.has(attr.name)) {
      fail(attr, `a prop "${attr.name}" aparece mais de uma vez — deixe só uma.`);
      continue;
    }
    seen.add(attr.name);
    if (typeof attr.value !== 'string') {
      fail(
        attr,
        attr.value === null
          ? `a prop "${attr.name}" precisa de um valor entre aspas.`
          : `a prop "${attr.name}" precisa ser texto entre aspas, sem {…}.`,
      );
      continue;
    }
    if (spec.oneOf && !spec.oneOf.includes(attr.value)) {
      const values = spec.oneOf.map((v) => `"${v}"`).join(', ');
      fail(attr, `"${attr.value}" não é um valor de "${attr.name}"${didYouMean(attr.value, spec.oneOf)} — use ${values}.`);
      continue;
    }
    if (!spec.allowEmpty && attr.value.trim() === '') {
      fail(attr, `a prop "${attr.name}" não pode ser vazia.`);
      continue;
    }
    props[attr.name] = { value: attr.value, at: attr };
  }

  // `seen` (e não `props`): uma prop presente mas inválida já tem o próprio erro.
  for (const [name, spec] of Object.entries(specs)) {
    if (spec.required && !seen.has(name)) fail(el, `a prop "${name}" é obrigatória.`);
  }
  return ok ? props : null;
}

function callout(el: JsxElement, ctx: ComponentContext): TiptapNode | null {
  const props = readProps(el, { variant: { oneOf: ['info', 'warning', 'tip'] } }, ctx.bag);
  const children = meaningful(el.children as RootContent[]);
  // Regra do editor do CMS (`CALLOUT_CONTENT`): tabela não pode ser filha
  // direta do callout — dentro de uma lista ou de um <DosDonts> do callout, pode.
  const allowed = children.filter((child) => {
    if (child.type !== 'table') return true;
    ctx.bag.report(
      child,
      'tabela não pode ficar direto dentro de <Callout> (como no editor do CMS) — use um <DosDonts> ou tire a tabela do callout.',
    );
    return false;
  });
  const content = ctx.convertChildren(allowed);
  if (!children.length) ctx.bag.report(el, '<Callout> vazio — escreva o conteúdo entre as tags.');
  // Filhos que existiam mas foram recusados já têm o próprio erro.
  if (!props || !content.length) return null;
  return { type: 'callout', attrs: { variant: props.variant?.value ?? 'info' }, content };
}

function componentEmbed(el: JsxElement, ctx: ComponentContext): TiptapNode | null {
  const props = readProps(el, { component: { required: true }, variant: { required: true } }, ctx.bag);
  if (meaningful(el.children as RootContent[]).length) {
    ctx.bag.report(el, '<ComponentEmbed> não tem conteúdo — use a forma auto-fechada: <ComponentEmbed … />.');
    return null;
  }
  if (!props) return null;
  return {
    type: 'componentEmbed',
    attrs: { componentName: props.component!.value, variantId: props.variant!.value },
  };
}

function dosDonts(el: JsxElement, ctx: ComponentContext): TiptapNode | null {
  const props = readProps(
    el,
    {
      variant: { oneOf: ['do', 'dont'], required: true },
      title: { allowEmpty: true },
      coverImage: {},
      coverAlt: {},
      coverComponent: {},
      coverVariant: {},
    },
    ctx.bag,
  );
  const children = meaningful(el.children as RootContent[]);
  const content = ctx.convertChildren(children);
  if (!children.length) ctx.bag.report(el, '<DosDonts> vazio — escreva a explicação entre as tags.');
  if (!props) return null;

  const { coverImage, coverAlt, coverComponent, coverVariant } = props;
  const pair = (a: Prop | undefined, b: Prop | undefined, names: string) => {
    if (!a === !b) return true;
    ctx.bag.report((a ?? b)!.at, `<DosDonts>: ${names} andam juntas — informe as duas.`);
    return false;
  };
  if (!pair(coverImage, coverAlt, '"coverImage" e "coverAlt"')) return null;
  if (!pair(coverComponent, coverVariant, '"coverComponent" e "coverVariant"')) return null;
  if (coverImage && coverComponent) {
    ctx.bag.report(
      coverComponent.at,
      '<DosDonts>: o cover é uma imagem ou um componente — use "coverImage" ou "coverComponent", não os dois.',
    );
    return null;
  }
  if (!content.length) return null;

  let cover: DosDontsCover | null = null;
  if (coverImage && coverAlt) {
    // Só agora: um bloco recusado não leva a imagem para o build.
    ctx.addImage(coverImage.value, coverImage.at);
    cover = { kind: 'image', src: coverImage.value, alt: coverAlt.value };
  } else if (coverComponent && coverVariant) {
    cover = { kind: 'component-embed', componentName: coverComponent.value, variantId: coverVariant.value };
  }
  return {
    type: 'dosDonts',
    attrs: { variant: props.variant!.value, titulo: props.title?.value ?? '', cover },
    content,
  };
}

/** Converte um componente de bloco; `null` se houve erro (já registrado). */
export function blockComponent(el: JsxElement, ctx: ComponentContext): TiptapNode | null {
  switch (el.name) {
    case 'Callout':
      return callout(el, ctx);
    case 'ComponentEmbed':
      return componentEmbed(el, ctx);
    case 'DosDonts':
      return dosDonts(el, ctx);
    default:
      ctx.bag.report(el, componentMessage(el.name));
      return null;
  }
}
