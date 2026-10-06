import type { ReactNode } from 'react';
import type { Token } from '@systembook/schema';
import { DEFAULT_TOKEN_MODE, toCssValue } from '@systembook/content/tokens';
import { TokenCopy } from './TokenCopy.js';

/** O valor como o leitor o escreveria em CSS; sem conversão, o JSON. */
export function tokenValueText(token: Token, mode: string): string {
  const { resolvedValue } = token.byMode[mode]!;
  return toCssValue(token.type, resolvedValue) ?? JSON.stringify(resolvedValue);
}

export interface TokenTableProps {
  tokens: readonly Token[];
  modes: readonly string[];
  /** Nome acessível da tabela (o grupo, por exemplo). */
  label?: string;
  /** Amostra visual do valor num modo; sem ela, só o valor (o fallback). */
  preview?: (token: Token, mode: string) => ReactNode;
}

/**
 * Tabela de tokens (SYS-133), a moldura que todos os renderers por tipo usam:
 * uma linha por token, com o caminho, os botões de copiar, a descrição e o
 * aviso de deprecated, e uma coluna por modo com a amostra, o valor e o alias.
 * Um modo só (`default`) não ganha cabeçalho de modo.
 */
export function TokenTable({ tokens, modes, label, preview }: TokenTableProps) {
  const single = modes.length === 1 && modes[0] === DEFAULT_TOKEN_MODE;
  return (
    <div className="sb-tokens-scroll">
      <table className="sb-tokens" aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Token</th>
            {single ? (
              <th scope="col">Value</th>
            ) : (
              modes.map((mode) => (
                <th key={mode} scope="col">
                  {mode}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <tr key={token.path} data-deprecated={token.deprecated ? '' : undefined}>
              <th scope="row" className="sb-token-head">
                <code className="sb-token-name">{token.path}</code>
                {token.deprecated ? <span className="sb-token-deprecated">Deprecated</span> : null}
                {typeof token.deprecated === 'string' ? (
                  <span className="sb-token-description">{token.deprecated}</span>
                ) : null}
                {token.description ? <span className="sb-token-description">{token.description}</span> : null}
                <TokenCopy path={token.path} />
              </th>
              {modes.map((mode) => {
                const alias = token.byMode[mode]!.aliasOf;
                return (
                  <td key={mode} className="sb-token-cell">
                    {preview?.(token, mode)}
                    <code className="sb-token-value">{tokenValueText(token, mode)}</code>
                    {alias ? <span className="sb-token-alias">→ {alias}</span> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
