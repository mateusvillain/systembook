import { randomBytes, scryptSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyPassword, _resetPepperCacheForTests } from './password.js';

describe('hashing de senha (argon2id + pepper)', () => {
  beforeEach(() => {
    process.env.ARGON2_SECRET = 'pepper-de-teste';
    _resetPepperCacheForTests();
  });

  it('produz hash no formato argon2id', async () => {
    const hash = await hashPassword('minha-senha');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('verifica senha correta e rejeita incorreta', async () => {
    const hash = await hashPassword('minha-senha');
    await expect(verifyPassword('minha-senha', hash)).resolves.toBe(true);
    await expect(verifyPassword('senha-errada', hash)).resolves.toBe(false);
  });

  it('dois hashes da mesma senha são diferentes (salt por chamada)', async () => {
    const [a, b] = await Promise.all([hashPassword('mesma'), hashPassword('mesma')]);
    expect(a).not.toBe(b);
  });

  it('retorna false para hash malformado em vez de lançar', async () => {
    await expect(verifyPassword('qualquer', 'lixo-nao-e-hash')).resolves.toBe(false);
  });

  it('verifica hashes legados scrypt e sinaliza re-hash', async () => {
    const salt = randomBytes(16);
    const digest = scryptSync('senha-legada' + 'pepper-de-teste', salt, 64);
    const legacy = `scrypt$${salt.toString('base64')}$${digest.toString('base64')}`;

    expect(needsRehash(legacy)).toBe(true);
    await expect(verifyPassword('senha-legada', legacy)).resolves.toBe(true);
    await expect(verifyPassword('outra-senha', legacy)).resolves.toBe(false);

    const modern = await hashPassword('senha-legada');
    expect(needsRehash(modern)).toBe(false);
  });
});
