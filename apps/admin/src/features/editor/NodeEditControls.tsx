import type { CalloutVariant, DosDontsVariant } from '@systembook/schema';
import {
  CALLOUT_META,
  CALLOUT_VARIANTS,
  DOS_DONTS_META,
  DOS_DONTS_VARIANTS,
  LANGUAGES,
  type CodeLanguageSelectProps,
  type DosDontsTitleFieldProps,
  type TokenTableEditControlsProps,
  type VariantSwitcherProps,
} from '@systembook/docs-site';
import { useT } from '@/i18n/AdminLocale';
import type { AdminMessageKey } from '@/i18n/messages/en';

/**
 * Controles de edição inline dos nós de conteúdo (SYS-89). Os NodeViews vivem
 * em `@systembook/docs-site` e só renderizam; o editor injeta estes controles por
 * opção da extensão (`features/editor/extensions.ts`), e eles só aparecem com
 * o editor editável.
 */

const CALLOUT_LABEL = {
  info: 'editor.callout.info',
  warning: 'editor.callout.warning',
  tip: 'editor.callout.tip',
} as const satisfies Record<CalloutVariant, AdminMessageKey>;

const DOS_DONTS_LABEL = {
  do: 'editor.dosDonts.do',
  dont: 'editor.dosDonts.dont',
} as const satisfies Record<DosDontsVariant, AdminMessageKey>;

/** Switcher de variante do callout: overlay no canto superior direito (SYS-24). */
export function CalloutVariantSwitcher({ variant, onChange }: VariantSwitcherProps<CalloutVariant>) {
  const t = useT();
  return (
    <span
      role="group"
      aria-label={t('editor.callout.variants')}
      className="sb-callout-switcher"
      contentEditable={false}
    >
      {CALLOUT_VARIANTS.map((v) => {
        const SwitchIcon = CALLOUT_META[v].icon;
        return (
          <button
            key={v}
            type="button"
            title={t('editor.variant.changeTo', { name: t(CALLOUT_LABEL[v]) })}
            aria-pressed={v === variant}
            className="sb-callout-switch"
            data-active={v === variant || undefined}
            onClick={() => onChange(v)}
          >
            <SwitchIcon aria-hidden size={12} />
            {t(CALLOUT_LABEL[v])}
          </button>
        );
      })}
    </span>
  );
}

/**
 * Switcher de variante do dos-donts: overlay no canto superior direito (mesmo
 * padrão do Callout, SYS-24) — não disputa espaço com ícone/título na linha do
 * header.
 */
export function DosDontsVariantSwitcher({
  variant,
  onChange,
}: VariantSwitcherProps<DosDontsVariant>) {
  const t = useT();
  return (
    <span
      role="group"
      aria-label={t('editor.dosDonts.variants')}
      className="sb-dos-donts-switcher"
      contentEditable={false}
    >
      {DOS_DONTS_VARIANTS.map((v) => {
        const SwitchIcon = DOS_DONTS_META[v].icon;
        return (
          <button
            key={v}
            type="button"
            title={t('editor.variant.changeTo', { name: t(DOS_DONTS_LABEL[v]) })}
            aria-pressed={v === variant}
            className="sb-dos-donts-switch"
            data-active={v === variant || undefined}
            onClick={() => onChange(v)}
          >
            <SwitchIcon aria-hidden size={12} />
            {t(DOS_DONTS_LABEL[v])}
          </button>
        );
      })}
    </span>
  );
}

export function DosDontsTitleField({ titulo, onChange }: DosDontsTitleFieldProps) {
  const t = useT();
  return (
    <input
      type="text"
      className="sb-dos-donts-title-input"
      placeholder={t('editor.dosDonts.title')}
      value={titulo}
      aria-label={t('editor.dosDonts.titleLabel')}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Valor do `<select>` para "sem linguagem" — o atributo em si é `null`. */
const PLAIN = 'plain';

export function CodeLanguageSelect({ language, onChange }: CodeLanguageSelectProps) {
  const t = useT();
  return (
    <select
      className="sb-code-lang-select"
      aria-label={t('editor.code.language')}
      value={language ?? PLAIN}
      onChange={(e) => onChange(e.target.value === PLAIN ? null : e.target.value)}
    >
      <option value={PLAIN}>{t('editor.code.plain')}</option>
      {LANGUAGES.map((l) => (
        <option key={l.value} value={l.value}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Seletor de grupo do bloco `token-table` (SYS-138), na barra acima das
 * tabelas. "All tokens" é o grupo vazio. Um grupo salvo que sumiu dos tokens
 * (renomeado, apagado) continua na lista, marcado, para o autor ver o que está
 * escolhido e trocar. Sem tokens (ou com erro de leitura), o select fica
 * desabilitado; o porquê é o aviso do próprio bloco, logo abaixo.
 */
export function TokenTableGroupSelect({ group, groups, status, onSelect }: TokenTableEditControlsProps) {
  // O grupo salvo precisa ser uma opção para o select mostrá-lo: marcado
  // quando os tokens chegaram e ele não está entre os grupos; sem tokens, só o nome.
  const stale = !!group && !groups.includes(group);
  const t = useT();
  return (
    <label className="sb-token-group-label">
      <span>{t('editor.tokens.group')}</span>
      <select
        className="sb-token-group-select"
        value={group}
        disabled={status !== 'available'}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">{t('editor.tokens.all')}</option>
        {stale && <option value={group}>{status === 'available' ? t('editor.tokens.notFound', { name: group }) : group}</option>}
        {groups.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </label>
  );
}
