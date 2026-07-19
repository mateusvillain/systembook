import { scryptSync, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

/**
 * Hashing de senha com argon2id + pepper de ARGON2_SECRET.
 * O pepper é concatenado à senha antes do salt por-chamada do próprio argon2 —
 * padrão simples e adequado para deploy single-container (nota da TASK-9).
 * NUNCA logar senha, hash ou o pepper, nem em mensagens de erro.
 */

let cachedPepper: string | null = null;

function pepper(): string {
  if (cachedPepper === null) {
    const value = process.env.ARGON2_SECRET;
    if (value === undefined || value.trim() === '' || value === 'TODO_FILL_MANUALLY') {
      throw new Error('ARGON2_SECRET não está preenchido em .env.local');
    }
    cachedPepper = value;
  }
  return cachedPepper;
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain + pepper(), {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
  });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    if (hash.startsWith('scrypt$')) {
      return verifyLegacyScrypt(plain, hash);
    }
    return await argon2.verify(hash, plain + pepper());
  } catch {
    return false;
  }
}

/**
 * Hashes `scrypt$...` foram gerados pelo seed provisório anterior à TASK-9.
 * O login re-hasheia com argon2id quando `needsRehash` retorna true.
 */
export function needsRehash(hash: string): boolean {
  return hash.startsWith('scrypt$');
}

function verifyLegacyScrypt(plain: string, stored: string): boolean {
  const [, saltB64, hashB64] = stored.split('$');
  if (!saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(plain + pepper(), salt, expected.length);
  return timingSafeEqual(actual, expected);
}

/** Usado apenas em testes para isolar o cache do pepper entre casos. */
export function _resetPepperCacheForTests(): void {
  cachedPepper = null;
}
