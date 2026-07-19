/**
 * O driver better-sqlite3 não expõe códigos estruturados de constraint —
 * a detecção é pela mensagem, centralizada aqui para não divergir entre routers.
 */

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}
