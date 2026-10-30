import type { Token } from '@systembook/schema';
import { toCssLines, typographyStyle } from '@systembook/content/tokens';
import { TokenCopy, useCopyAnnouncer } from './TokenCopy.js';
import type { TokenTableProps } from './TokenTable.js';
import { modesForToken, modesToShow } from './tokenModes.js';
import { useMessages } from '../../i18n/UiLocale.js';
import type { DocsMessageKey } from '../../i18n/messages/en.js';
import type { Translator } from '../../i18n/format.js';

/** Rótulo de cada linha de `toCssLines('typography')`, na ordem dela. */
const PROPERTY_LABELS: Record<string, DocsMessageKey> = {
  'font-family': 'tokens.fontFamily',
  'font-size': 'tokens.fontSize',
  'font-weight': 'tokens.fontWeight',
  'letter-spacing': 'tokens.letterSpacing',
  'line-height': 'tokens.lineHeight',
};

/** As propriedades da tipografia num modo: campo faltando é "—", o que não converte sai cru. */
function properties(token: Token, mode: string, t: Translator<DocsMessageKey>): [label: string, value: string][] {
  const lines = toCssLines('typography', token.byMode[mode]!.resolvedValue) ?? [];
  return lines.map((line) => {
    const [property, value] = line.split(/: (.*)/s) as [string, string];
    const key = PROPERTY_LABELS[property];
    return [key ? t(key) : property, value];
  });
}

/**
 * Tipografia composta (SYS-149): um specimen por token, não uma tabela — a
 * frase com o estilo inteiro na largura da página, e embaixo as cinco
 * propriedades rotuladas. Um modo só aparece quando a tipografia muda com ele
 * (`modesToShow`); aí cada modo tem a sua amostra.
 */
export function TypographySpecimens({ tokens, modes, label }: Omit<TokenTableProps, 'preview'>) {
  const shown = modesToShow(tokens, modes);
  const { announce, region } = useCopyAnnouncer();
  const t = useMessages();
  return (
    // `sb-tokens`: as regras de conteúdo do ProseMirror (código inline, tabela)
    // já excluem o que mora dentro dela. `div` com role de lista em vez de
    // `ul`, que a doc pública estiliza com marcador e recuo.
    <div className="sb-tokens sb-type-specimens">
      <div role="list" aria-label={label}>
        {tokens.map((token) => (
          <div role="listitem" key={token.path} className="sb-type-specimen" data-deprecated={token.deprecated ? '' : undefined}>
            <div className="sb-type-specimen-head">
              <code className="sb-token-name">{token.path}</code>
              {token.deprecated ? <span className="sb-token-deprecated">{t('tokens.deprecated')}</span> : null}
              <TokenCopy path={token.path} onAnnounce={announce} />
            </div>
            {typeof token.deprecated === 'string' ? (
              <span className="sb-token-deprecated-reason">{token.deprecated}</span>
            ) : null}
            {token.description ? <span className="sb-token-description">{token.description}</span> : null}
            {modesForToken(token, shown).map((mode, _i, specimens) => {
              const { resolvedValue, aliasOf } = token.byMode[mode]!;
              return (
                <div key={mode} className="sb-type-specimen-mode">
                  {specimens.length > 1 ? <span className="sb-type-specimen-mode-name">{mode}</span> : null}
                  <span className="sb-type-specimen-sample" aria-hidden style={typographyStyle(resolvedValue)}>
                    {t('tokens.typeSample')}
                  </span>
                  <dl className="sb-type-specimen-props">
                    {properties(token, mode, t).map(([name, value]) => (
                      <div key={name}>
                        <dt>{name}</dt>
                        <dd>
                          <code className="sb-token-value">{value}</code>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {aliasOf ? <span className="sb-token-alias">→ {aliasOf}</span> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {region}
    </div>
  );
}
