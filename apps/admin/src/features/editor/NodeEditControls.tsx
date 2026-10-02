import type { CalloutVariant, DosDontsVariant } from '@systembook/schema';
import {
  CALLOUT_META,
  CALLOUT_VARIANTS,
  type VariantSwitcherProps,
} from '../content/nodes/Callout.js';
import { LANGUAGES, type CodeLanguageSelectProps } from '../content/nodes/CodeBlock.js';
import {
  DOS_DONTS_META,
  DOS_DONTS_VARIANTS,
  type DosDontsTitleFieldProps,
} from '../content/nodes/DosDonts.js';

/**
 * Controles de edição inline dos nós de conteúdo (SYS-89). Os NodeViews vivem
 * em `features/content/` e só renderizam; o editor injeta estes controles por
 * opção da extensão (`features/editor/extensions.ts`), e eles só aparecem com
 * o editor editável.
 */

/** Switcher de variante do callout: overlay no canto superior direito (SYS-24). */
export function CalloutVariantSwitcher({ variant, onChange }: VariantSwitcherProps<CalloutVariant>) {
  return (
    <span
      role="group"
      aria-label="Variante do callout"
      className="sb-callout-switcher"
      contentEditable={false}
    >
      {CALLOUT_VARIANTS.map((v) => {
        const SwitchIcon = CALLOUT_META[v].icon;
        return (
          <button
            key={v}
            type="button"
            title={`Change to ${CALLOUT_META[v].label.toLowerCase()}`}
            aria-pressed={v === variant}
            className="sb-callout-switch"
            data-active={v === variant || undefined}
            onClick={() => onChange(v)}
          >
            <SwitchIcon aria-hidden size={12} />
            {CALLOUT_META[v].label}
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
  return (
    <span
      role="group"
      aria-label="Variante do bloco Do/Don't"
      className="sb-dos-donts-switcher"
      contentEditable={false}
    >
      {DOS_DONTS_VARIANTS.map((v) => {
        const SwitchIcon = DOS_DONTS_META[v].icon;
        return (
          <button
            key={v}
            type="button"
            title={`Change to ${DOS_DONTS_META[v].label}`}
            aria-pressed={v === variant}
            className="sb-dos-donts-switch"
            data-active={v === variant || undefined}
            onClick={() => onChange(v)}
          >
            <SwitchIcon aria-hidden size={12} />
            {DOS_DONTS_META[v].label}
          </button>
        );
      })}
    </span>
  );
}

export function DosDontsTitleField({ titulo, onChange }: DosDontsTitleFieldProps) {
  return (
    <input
      type="text"
      className="sb-dos-donts-title-input"
      placeholder="Title"
      value={titulo}
      aria-label="Do/Don't block title"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Valor do `<select>` para "sem linguagem" — o atributo em si é `null`. */
const PLAIN = 'plain';

export function CodeLanguageSelect({ language, onChange }: CodeLanguageSelectProps) {
  return (
    <select
      className="sb-code-lang-select"
      aria-label="Code language"
      value={language ?? PLAIN}
      onChange={(e) => onChange(e.target.value === PLAIN ? null : e.target.value)}
    >
      <option value={PLAIN}>Plain text</option>
      {LANGUAGES.map((l) => (
        <option key={l.value} value={l.value}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
