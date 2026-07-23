/**
 * Estilo compartilhado do "text-link" de acento para as ações que fazem a
 * estrutura crescer — Nova seção, Adicionar página, + Aba e + menu (TASK-94).
 *
 * O `plano-de-interface.md` reserva o azul como **único acento de ação**;
 * criar estrutura É uma ação, então essas ações viram text-links azuis
 * (`text-primary`), no estilo do Zeroheight ('Add subcategory'/'Add page'):
 * texto de acento + ícone "+", sem caixa preenchida em repouso. O hover
 * sublinha (reforço sutil, sem introduzir fundo) e o foco de teclado fica
 * sempre visível. Reutilizado nos quatro pontos para uma affordance uniforme.
 *
 * `bg-transparent` é obrigatório, não redundante: o painel não importa o
 * preflight do Tailwind (TASK-75), então um `<button>` cru herda o fundo
 * nativo `ButtonFace` (cinza ~#efefef) — a exata "caixa cinza preenchida" do
 * `referencia-3.png`. Sem isto o acento ficaria sobre um box cinza.
 *
 * O padding fica a cargo de cada chamada (as barras têm métricas diferentes) —
 * combine com `cn()` no ponto de uso.
 */
export const createLinkClass =
  'inline-flex items-center gap-1.5 rounded-editorial-sm bg-transparent text-sm text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';
