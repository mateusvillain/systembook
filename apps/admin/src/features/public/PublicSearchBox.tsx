import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Caixa de busca no header da doc pública (TASK-53). Submete para
 * `/docs/search?q=…`, onde `PublicSearch` roda a query FTS5. Mantém o valor em
 * sincronia com o `?q` da URL para refletir buscas via link/refresh.
 */
export function PublicSearchBox() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');

  // Reflete mudanças externas de `?q` (navegação, refresh) no input.
  useEffect(() => {
    setValue(params.get('q') ?? '');
  }, [params]);

  return (
    <form
      className="sb-public-searchbox"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (q.length > 0) navigate(`/docs/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar na documentação…"
        aria-label="Buscar na documentação"
        data-testid="public-search-input"
      />
    </form>
  );
}
