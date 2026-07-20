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

/** União de todas as mensagens que o preview-kit aceita. */
export type PreviewMessage = PreviewUpdatePropsMessage;
