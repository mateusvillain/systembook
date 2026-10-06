import type { ReactNode } from 'react';
import { parseInlineMarkdown, type InlineNode } from '@systembook/content/inline';

function render(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.text;
      case 'bold':
        return <strong key={i}>{render(node.children)}</strong>;
      case 'italic':
        return <em key={i}>{render(node.children)}</em>;
      case 'code':
        return <code key={i}>{node.text}</code>;
      case 'link':
        return (
          <a key={i} href={node.href}>
            {render(node.children)}
          </a>
        );
    }
  });
}

/**
 * Markdown inline de um campo de uma linha (o subtítulo da página): negrito,
 * itálico, código e link. Sem blocos — para isso, o corpo da página.
 */
export function InlineMarkdown({ children }: { children: string }) {
  return <>{render(parseInlineMarkdown(children))}</>;
}
