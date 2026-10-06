/**
 * Markdown **inline** de campos de uma linha — hoje, o subtítulo da página
 * (`subtitle` no frontmatter, `subtitulo` no CMS). É texto curto, não um
 * documento: só os marks que a prosa da doc também tem (negrito, itálico,
 * código, link), sem blocos e sem o parser completo (remark), de modo que
 * este módulo seja barato de levar ao browser e ao `<head>` do build.
 *
 * Sem sintaxe com `_`: `snake_case` e nomes de token aparecem com frequência
 * em doc de design system, e `_` como itálico os quebraria.
 */

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic'; children: InlineNode[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: InlineNode[] };

/** Ordem importa (e `*` não abre/fecha ao lado de espaço, como no CommonMark: `2 * 3 * 4` é conta): código e link primeiro (o conteúdo deles não é reinterpretado como negrito/itálico). */
const TOKEN = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(?!\s)(.+?)(?<!\s)\*\*|\*(?!\s)(.+?)(?<!\s)\*/g;

/** `javascript:` e afins não viram link: o subtítulo é texto de autor, não confiável. */
function safeHref(href: string): boolean {
  return /^(https?:|mailto:|\/|#|\.{1,2}\/)/i.test(href) || !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

/** Texto adjacente vira um nó só (o `)` que sobra de um link recusado, por exemplo). */
function pushText(out: InlineNode[], text: string) {
  const prev = out[out.length - 1];
  if (prev?.type === 'text') prev.text += text;
  else out.push({ type: 'text', text });
}

export function parseInlineMarkdown(source: string): InlineNode[] {
  const out: InlineNode[] = [];
  let last = 0;
  for (const m of source.matchAll(TOKEN)) {
    const start = m.index;
    if (start > last) pushText(out, source.slice(last, start));
    last = start + m[0].length;
    if (m[1] !== undefined) out.push({ type: 'code', text: m[1] });
    else if (m[2] !== undefined) {
      const href = m[3]!;
      if (safeHref(href)) out.push({ type: 'link', href, children: parseInlineMarkdown(m[2]) });
      else pushText(out, m[0]);
    } else if (m[4] !== undefined) out.push({ type: 'bold', children: parseInlineMarkdown(m[4]) });
    else out.push({ type: 'italic', children: parseInlineMarkdown(m[5]!) });
  }
  if (last < source.length) pushText(out, source.slice(last));
  return out;
}

function toPlain(nodes: InlineNode[]): string {
  return nodes.map((n) => (n.type === 'text' || n.type === 'code' ? n.text : toPlain(n.children))).join('');
}

/** O texto sem marcadores — para `<meta description>`, busca e qualquer lugar sem marcação. */
export function stripInlineMarkdown(source: string): string {
  return toPlain(parseInlineMarkdown(source));
}
