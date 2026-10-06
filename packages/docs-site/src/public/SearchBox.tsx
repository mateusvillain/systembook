import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { usePublicSettings } from '../content/docsQueries.js';
import { CommandPalette } from './CommandPalette.js';

// Rótulo do atalho: `⌘K` em Mac, `Ctrl K` no resto. Lido uma vez no módulo —
// a plataforma não muda em runtime, e assim não vira estado do componente.
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const SHORTCUT_LABEL = IS_MAC ? '⌘K' : 'Ctrl K';

/**
 * Gatilho da busca no header (TASK-54, SYS-40) e dono do estado da Command
 * Palette (SYS-116). O campo em pill do desktop e o ícone do mobile são só
 * botões que abrem o modal — quem busca de verdade é o `CommandPalette`. ⌘K /
 * Ctrl+K abre (e fecha) de qualquer ponto da doc, inclusive com o foco num
 * campo: o atalho do navegador para ⌘K é raro e a palette é o destino esperado.
 */
export function SearchBox() {
  const [open, setOpen] = useState(false);
  const settings = usePublicSettings();
  const name = settings.data?.nomeDesignSystem;
  const label = name ? `Search ${name}` : 'Search the documentation';

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'k' && e.key !== 'K') return;
      if (!e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      setOpen((o) => !o);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {/* Gatilho só-mobile: o ícone (CSS controla a visibilidade por breakpoint). */}
      <button
        type="button"
        className="sb-search-trigger"
        aria-label={label}
        onClick={() => setOpen(true)}
        data-testid="search-trigger"
      >
        <Search aria-hidden size={16} />
      </button>

      <div className="sb-searchbox" data-testid="searchbox">
        <button
          type="button"
          className="sb-searchbox-field sb-searchbox-trigger"
          aria-label={label}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          data-testid="search-open"
        >
          <Search className="sb-searchbox-icon" aria-hidden size={16} />
          <span className="sb-searchbox-label">{label}</span>
          {/* Dica do atalho: decorativa (`aria-hidden`) — o atalho não é a única
              forma de abrir a busca, e o botão já tem nome acessível. */}
          <kbd className="sb-searchbox-kbd" aria-hidden>
            {SHORTCUT_LABEL}
          </kbd>
        </button>
      </div>

      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}
