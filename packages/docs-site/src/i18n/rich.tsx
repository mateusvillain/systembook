import { Fragment, type ReactNode } from 'react';

const VARIABLE = /\{(\w+)\}/g;

/**
 * Mensagem com nós React no lugar das variáveis (SYS-168): `{component}` vira
 * um `<strong>`, `{page}` um link. Recebe o texto já traduzido com as
 * variáveis intactas (o tradutor mantém as que não recebe); variável sem nó
 * correspondente fica como está.
 */
export function formatRich(message: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of message.matchAll(VARIABLE)) {
    const [placeholder, name] = match as unknown as [string, string];
    if (!Object.hasOwn(nodes, name)) continue;
    parts.push(message.slice(last, match.index), <Fragment key={parts.length}>{nodes[name]}</Fragment>);
    last = match.index + placeholder.length;
  }
  parts.push(message.slice(last));
  return <>{parts}</>;
}
