import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Check, ChevronDown, Languages } from 'lucide-react';
import type { LocaleInfo } from '@systembook/schema';
import { localePrefix, localizedSitePath, TOKENS_SEGMENT } from '@systembook/content/site';
import { useDocsLocale } from '../content/dataSource.js';
import { usePageBySlug } from '../content/docsQueries.js';
import { useDocsPaths } from './docsRoutes.js';
import { useOnTokensPage } from './PublicMenuNav.js';
import { useMessages } from '../i18n/UiLocale.js';

interface LocaleLink {
  info: LocaleInfo;
  /** Destino no router (sem a base). */
  to: string;
  current: boolean;
}

/**
 * Destino de cada idioma a partir da rota atual (SYS-184): a mesma página pelos
 * `alternates` (com os slugs traduzidos e a tab da URL — se ela não existir no
 * outro idioma, o `PublicPageView` troca a URL pela do corpo), a página Tokens
 * do idioma, ou a home
 * dele quando não há equivalente. O idioma atual aponta para onde o leitor já
 * está.
 */
function useLocaleLinks(): LocaleLink[] {
  const { locale, defaultLocale, locales } = useDocsLocale();
  const { root } = useDocsPaths();
  const { pathname } = useLocation();
  // O layout enxerga os params da rota filha (o React Router os acumula em
  // cada match); fora de uma página, faltam e a query não dispara.
  const { menuSlug, sectionSlug, pageSlug, tabId } = useParams();
  const page = usePageBySlug({ menuSlug, sectionSlug, pageSlug }).data;
  const onTokens = useOnTokensPage();

  if (!locale || !defaultLocale) return [];
  return locales.map((info) => {
    if (info.code === locale) return { info, to: pathname, current: true };
    const alternate = page?.alternates[info.code];
    const prefix = `${root}${localePrefix(info.code, defaultLocale)}`;
    const to = alternate
      ? `${root}${localizedSitePath(info.code, alternate, defaultLocale, tabId)}`
      : onTokens
        ? `${prefix}/${TOKENS_SEGMENT}`
        : prefix || '/';
    return { info, to, current: false };
  });
}

/**
 * Troca de idioma da doc pública (SYS-184). Como a `PublicMenuNav`, é
 * renderizada duas vezes — `header` (desktop, um menu que abre de um botão) e
 * `drawer` (mobile, a lista à vista) — e a cópia fora de uso some por
 * `display: none` em `public.css`. Some com um idioma só.
 *
 * Os itens são links (não opções de um select): trocar de idioma é navegar, e
 * o leitor pode abrir o outro idioma em nova aba. Cada um leva `lang` e
 * `hreflang`, para o leitor de tela pronunciar o rótulo no idioma dele.
 */
export function LocaleSwitcher({
  variant,
  onNavigate,
}: {
  variant: 'header' | 'drawer';
  /** Chamado ao escolher um idioma — o layout fecha o drawer no mobile. */
  onNavigate?: () => void;
}) {
  const links = useLocaleLinks();
  const t = useMessages();
  if (links.length < 2) return null;

  const items = (onChoose?: () => void) =>
    links.map(({ info, to, current }) => (
      <li key={info.code}>
        <Link
          to={to}
          lang={info.code}
          hrefLang={info.code}
          aria-current={current ? 'page' : undefined}
          data-active={current || undefined}
          className="sb-locale-item"
          onClick={() => {
            onChoose?.();
            onNavigate?.();
          }}
        >
          <span>{info.label}</span>
          {current && <Check aria-hidden size={14} className="sb-locale-check" />}
        </Link>
      </li>
    ));

  if (variant === 'drawer') {
    return (
      <nav className="sb-locale sb-locale-drawer" aria-label={t('locale.nav')}>
        <ul className="sb-locale-list">{items()}</ul>
      </nav>
    );
  }
  // Sem o idioma da rota na lista (fonte inconsistente), não há o que marcar.
  const current = links.find((link) => link.current)?.info;
  if (!current) return null;
  return <LocaleMenu current={current} items={items} label={t('locale.current', { name: current.label })} />;
}

/**
 * Botão + lista que abre embaixo dele; fecha com Esc, clique fora, foco saindo
 * (Tab) ou escolha.
 */
function LocaleMenu({
  current,
  items,
  label,
}: {
  current: LocaleInfo;
  items: (onChoose: () => void) => React.ReactNode;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const t = useMessages();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setOpen(false);
      // Só puxa o foco se ele estava aqui: o Esc pode ser de outro overlay.
      if (rootRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
    }
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div
      className="sb-locale sb-locale-header"
      ref={rootRef}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="sb-locale-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <Languages aria-hidden size={16} />
        <span lang={current.code}>{current.label}</span>
        <ChevronDown aria-hidden size={14} />
      </button>
      <nav id={listId} className="sb-locale-popover" aria-label={t('locale.nav')} hidden={!open}>
        <ul className="sb-locale-list">{items(() => setOpen(false))}</ul>
      </nav>
    </div>
  );
}
