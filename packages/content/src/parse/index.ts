import type { Root, Yaml } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { TiptapDoc } from '../blocks.js';
import { DiagnosticBag, type Diagnostic } from '../diagnostics.js';
import { readFrontmatter, type DocumentKind, type FrontmatterFor } from '../frontmatter.js';
import { blocks, type ContentReferences } from './toTiptap.js';

export type { ContentReferences, SourcePoint } from './toTiptap.js';

export interface ParseOptions<K extends DocumentKind> {
  /** Caminho do arquivo como deve aparecer nos diagnósticos. */
  file: string;
  /** `mdx` habilita os componentes; `md` é Markdown puro (GFM). */
  format: 'md' | 'mdx';
  /** Papel do arquivo na árvore — define o frontmatter aceito. */
  kind: K;
}

export interface ParsedDocument<K extends DocumentKind> {
  /** `null` quando o frontmatter tem erro. */
  frontmatter: FrontmatterFor<K> | null;
  /** Corpo como doc Tiptap canônico (vazio se o arquivo não tem conteúdo). */
  doc: TiptapDoc;
  /** Imagens e links encontrados, para o build resolver/copiar. */
  references: ContentReferences;
  /** Todos os problemas do arquivo; vazio = arquivo válido. */
  diagnostics: Diagnostic[];
}

/**
 * Lê um arquivo `.md`/`.mdx` (SYS-93): frontmatter validado + corpo como doc
 * Tiptap no formato que o editor do CMS produz. Análise estática do AST — o MDX
 * nunca é executado. Nunca lança por erro de conteúdo: tudo vai para
 * `diagnostics` (`docs/static-format.md`).
 */
export function parseDocument<K extends DocumentKind>(
  source: string,
  options: ParseOptions<K>,
): ParsedDocument<K> {
  const bag = new DiagnosticBag(options.file);
  const references: ContentReferences = { images: [], links: [], components: [] };
  const empty: TiptapDoc = { type: 'doc', content: [] };

  const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm);
  if (options.format === 'mdx') processor.use(remarkMdx);

  let tree: Root;
  try {
    tree = processor.parse(source);
  } catch (error) {
    // Erro de sintaxe do MDX (JSX malformado etc.) vem com a posição.
    const place = (error as { place?: { line: number; column: number } | { start: { line: number; column: number } } }).place;
    const point = place && 'start' in place ? place.start : place;
    const message = (error as Error).message.replace(/\.?$/, '.');
    // Erro clássico: texto na mesma linha da tag de abertura que continua em
    // outras linhas. O MDX só fecha na mesma linha nesse caso.
    const hint = /closing tag/i.test(message)
      ? ' Dica: com conteúdo de várias linhas, quebre a linha logo depois da tag de abertura (<Callout>⏎).'
      : '';
    bag.report(point ?? { line: 1, column: 1 }, `sintaxe inválida: ${message}${hint}`);
    return { frontmatter: null, doc: empty, references, diagnostics: bag.items };
  }

  const yaml = tree.children.find((node): node is Yaml => node.type === 'yaml');
  const frontmatter = readFrontmatter(
    yaml?.value,
    options.kind,
    yaml?.position?.start ?? { line: 1, column: 1 },
    bag,
  );

  const content = blocks(tree.children, { bag, refs: references });
  return { frontmatter, doc: { type: 'doc', content }, references, diagnostics: bag.items };
}
