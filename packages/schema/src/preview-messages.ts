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
 * Atributo do `<html>` do iframe que escolhe o modo dos tokens — o mesmo que
 * os seletores gerados por `tokensToCss` (`@systembook/content/tokens`) usam.
 */
export type TokenModeAttribute = 'data-mode';

/**
 * Enviada pelo pai ao iframe com os design tokens (SYS-147): o preview-kit
 * troca a folha de estilo das variáveis e põe o modo no `<html>`. Reenviada a
 * cada troca de modo; sem tokens publicados, o pai não envia nada.
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
