export const SESSION_COOKIE = 'session_id';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 dias

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

function secureSuffix(): string {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

export function sessionCookie(sessionId: string): string {
  return (
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; ` +
    `Max-Age=${SESSION_MAX_AGE_SECONDS}${secureSuffix()}`
  );
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureSuffix()}`;
}
