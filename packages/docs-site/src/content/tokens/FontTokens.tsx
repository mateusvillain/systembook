import type { CSSProperties } from 'react';
import type { TokenType } from '@systembook/schema';
import { TokenTable, type TokenTableProps } from './TokenTable.js';
import { useMessages } from '../../i18n/UiLocale.js';

/** A propriedade que a amostra aplica, por tipo. */
const SAMPLE_STYLE: Partial<Record<TokenType, (css: string) => CSSProperties>> = {
  fontFamily: (css) => ({ fontFamily: css }),
  fontWeight: (css) => ({ fontWeight: css }),
};

/**
 * Tokens de fonte (SYS-134): `fontFamily` e `fontWeight`, com a frase de
 * amostra aplicando só a propriedade deles. A amostra é decorativa — o valor
 * vem escrito embaixo. A fonte precisa estar disponível na página para
 * aparecer; sem ela, o navegador cai na próxima da lista, como no produto. A
 * tipografia composta tem formato próprio (`TypographySpecimens`).
 */
export function FontTokens(props: Omit<TokenTableProps, 'preview'>) {
  const t = useMessages();
  return (
    <TokenTable
      {...props}
      preview={(token, _mode, css) => {
        const style = css === null ? null : SAMPLE_STYLE[token.type]?.(css);
        return style ? (
          <span className="sb-token-type-sample" aria-hidden style={style}>
            {t('tokens.typeSample')}
          </span>
        ) : null;
      }}
    />
  );
}
