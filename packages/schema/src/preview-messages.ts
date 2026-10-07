/**
 * Contrato postMessage entre o embedador (painel de controles do admin,
 * TASK-49) e o preview montado pelo preview-kit dentro do iframe (TASK-38).
 * Os dois lados importam estes tipos; manter aqui garante que não divergem.
 */

/**
 * Enviada pelo pai ao iframe para atualizar props do componente em runtime.
 * O preview-kit mescla `props` nas props atuais e re-renderiza.
 */
export interface PreviewUpdatePropsMessage {
  type: 'systembook:update-props';
  /** Props parciais a mesclar nas props atuais do componente. */
  props: Record<string, unknown>;
}

/**
 * Enviada pelo pai ao iframe com os design tokens (SYS-147): o preview-kit
 * troca a folha de estilo das variáveis e põe o modo no `<html>`
 * (`TokenModeAttribute`). Sem tokens publicados, o pai não envia nada.
 *
 * O iframe não guarda nada entre cargas e não avisa quando está pronto: o pai
 * envia no `load` do iframe (o `mount()` já escuta a essa altura), de novo a
 * cada carga (trocar de variante recarrega o iframe) e a cada troca de modo.
 */
export interface PreviewSetTokensMessage {
  type: 'systembook:set-tokens';
  /** Variáveis CSS de todos os modos, um bloco por modo (`tokensToCss`). */
  css: string;
  /** Modo ativo, um de `TokenSet.modes`. */
  mode: string;
}

/** União de todas as mensagens que o preview-kit aceita. */
export type PreviewMessage = PreviewUpdatePropsMessage | PreviewSetTokensMessage;
