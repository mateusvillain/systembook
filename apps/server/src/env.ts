import path from 'node:path';

/**
 * Validação fail-fast das variáveis de ambiente obrigatórias.
 * Falhar aqui, com mensagem clara, evita erros confusos depois
 * (ex.: código de sessão assumindo SESSION_SECRET presente).
 */

const REQUIRED = ['PORT', 'DATABASE_PATH', 'SESSION_SECRET'] as const;

export interface Env {
  PORT: number;
  DATABASE_PATH: string;
  SESSION_SECRET: string;
  /** Raiz dos artefatos de preview no volume; default: `<dir do DATABASE_PATH>/previews`. */
  PREVIEWS_PATH: string;
}

export function loadEnv(): Env {
  const missing = REQUIRED.filter((name) => {
    const value = process.env[name];
    return value === undefined || value.trim() === '' || value === 'TODO_FILL_MANUALLY';
  });

  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes ou não preenchidas: ${missing.join(', ')}. ` +
        'Preencha-as em .env.local (veja os comentários no próprio arquivo).',
    );
  }

  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT deve ser um inteiro positivo, recebido: "${process.env.PORT}"`);
  }

  const databasePath = process.env.DATABASE_PATH as string;
  const previewsPath =
    process.env.PREVIEWS_PATH && process.env.PREVIEWS_PATH.trim() !== ''
      ? process.env.PREVIEWS_PATH
      : path.join(path.dirname(databasePath), 'previews');

  return {
    PORT: port,
    DATABASE_PATH: databasePath,
    SESSION_SECRET: process.env.SESSION_SECRET as string,
    PREVIEWS_PATH: previewsPath,
  };
}
