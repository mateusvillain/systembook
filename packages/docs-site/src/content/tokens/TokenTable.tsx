import type { ReactNode } from 'react';
import type { Token } from '@systembook/schema';
import { toCssLines, toCssValue } from '@systembook/content/tokens';
import { TokenCopy, useCopyAnnouncer } from './TokenCopy.js';
import { modesToShow } from './tokenModes.js';
import '../content.css';

/** O valor de um token num modo como CSS; `null` quando não há conversão. */
function cssValue(token: Token, mode: string): string | null {
  return toCssValue(token.type, token.byMode[mode]!.resolvedValue);
}

export interface TokenTableProps {
  tokens: readonly Token[];
  modes: readonly string[];
  /** Nome acessível da tabela (o grupo, por exemplo). */
  label?: string;
  /**
   * Amostra visual do valor num modo, com o valor em CSS já calculado (`null`
   * quando não há conversão — sem amostra honesta). Sem ela, só o valor.
   */
  preview?: (token: Token, mode: string, css: string | null) => ReactNode;
}

/**
 * O valor escrito: uma linha só na maioria dos tipos; uma por propriedade na
 * tipografia e uma por camada na sombra, onde uma linha esconderia algo
 * (SYS-136 — é o que a tabela mostra também como fallback, sem amostra).
 */
function TokenValueLines({ lines }: { lines: string[] }) {
  if (lines.length === 1) return <code className="sb-token-value">{lines[0]}</code>;
  return (
    <span className="sb-token-lines">
      {lines.map((line, i) => (
        <code key={i} className="sb-token-value">
          {line}
        </code>
      ))}
    </span>
  );
}

/**
 * Tabela de tokens (SYS-133), a moldura de todos os renderers por tipo. Uma
 * linha por token: o caminho (cabeçalho da linha, só o nome e o selo de
 * deprecated — o leitor de tela o repete em cada célula), uma coluna por modo
 * com a amostra, o valor e o alias, e "Details" com o tipo, a descrição e os
 * botões de copiar. Sem nenhum valor que mude entre os modos (ou com um modo
 * só), uma coluna "Value" no lugar das colunas por modo (`modesToShow`).
 *
 * Sem `preview`, é o renderer de fallback (SYS-136): serve a qualquer tipo,
 * inclusive os que não têm amostra própria.
 */
export function TokenTable({ tokens, modes, label, preview }: TokenTableProps) {
  const shown = modesToShow(tokens, modes);
  const single = shown.length === 1;
  const { announce, region } = useCopyAnnouncer();

  return (
    <div className="sb-tokens-scroll">
      <table className="sb-tokens" aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Token</th>
            {single ? (
              <th scope="col">Value</th>
            ) : (
              shown.map((mode) => (
                <th key={mode} scope="col">
                  {mode}
                </th>
              ))
            )}
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <tr key={token.path} data-deprecated={token.deprecated ? '' : undefined}>
              <th scope="row" className="sb-token-head">
                <code className="sb-token-name">{token.path}</code>
                {token.deprecated ? <span className="sb-token-deprecated">Deprecated</span> : null}
              </th>
              {shown.map((mode) => {
                const css = cssValue(token, mode);
                const { resolvedValue, aliasOf } = token.byMode[mode]!;
                return (
                  <td key={mode} className="sb-token-cell">
                    {preview?.(token, mode, css)}
                    <TokenValueLines lines={toCssLines(token.type, resolvedValue) ?? [css ?? JSON.stringify(resolvedValue)]} />
                    {aliasOf ? <span className="sb-token-alias">→ {aliasOf}</span> : null}
                  </td>
                );
              })}
              <td className="sb-token-details">
                {/* O tipo diz como ler o valor cru — o fallback mistura tipos. */}
                <span className="sb-token-type">{token.type}</span>
                {typeof token.deprecated === 'string' ? (
                  <span className="sb-token-deprecated-reason">{token.deprecated}</span>
                ) : null}
                {token.description ? <span className="sb-token-description">{token.description}</span> : null}
                <TokenCopy path={token.path} onAnnounce={announce} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {region}
    </div>
  );
}
