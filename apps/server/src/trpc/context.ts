import type { IncomingMessage, ServerResponse } from 'node:http';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { memberships, sessions } from '../db/schema.js';
import { parseCookies, SESSION_COOKIE } from '../auth/cookies.js';

export interface AuthUser {
  userId: string;
  role: 'admin' | 'editor';
  sessionId: string;
}

export interface TrpcContext {
  db: Db;
  /** null em chamadas fora do HTTP (testes via createCaller sem resposta). */
  res: ServerResponse | null;
  user: AuthUser | null;
  /**
   * Raiz dos artefatos de preview no volume (`env.PREVIEWS_PATH`) — usada por
   * `componentPreviews.getLatest` (TASK-47) para localizar o `index.html` da
   * variante em disco. Opcional: a maioria dos testes forja o contexto sem ela
   * (só os testes de preview a fornecem).
   */
  previewsRoot?: string;
}

type ReqLike = Pick<IncomingMessage, 'headers'>;

/**
 * Resolve o usuário a partir do cookie de sessão. Sessões expiradas são
 * tratadas como não autenticadas e a linha é removida no acesso (cleanup
 * preguiçoso — suficiente para o MVP single-container, TASK-11).
 */
export function resolveUser(db: Db, req: ReqLike): AuthUser | null {
  const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!sessionId) return null;

  const row = db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      expiraEm: sessions.expiraEm,
      role: memberships.role,
    })
    .from(sessions)
    .innerJoin(memberships, eq(memberships.userId, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .get();

  if (!row) return null;

  if (row.expiraEm.getTime() <= Date.now()) {
    db.delete(sessions).where(eq(sessions.id, row.sessionId)).run();
    return null;
  }

  return { userId: row.userId, role: row.role, sessionId: row.sessionId };
}

export function createContext(
  db: Db,
  req: ReqLike,
  res: ServerResponse | null,
  previewsRoot?: string,
): TrpcContext {
  return { db, res, user: resolveUser(db, req), previewsRoot };
}
