import { count } from 'drizzle-orm';
import { hashPassword } from '../auth/password.js';
import type { Db } from './client.js';
import { memberships, users } from './schema.js';

/**
 * Cria o admin de bootstrap a partir de INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD,
 * apenas se a tabela `users` estiver vazia. Idempotente: rodar duas vezes não duplica.
 * NUNCA logar a senha em texto plano.
 */
export async function seedBootstrapAdmin(db: Db): Promise<{ created: boolean }> {
  const row = db.select({ total: count() }).from(users).get();
  if (row && row.total > 0) {
    return { created: false };
  }

  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const pepper = process.env.ARGON2_SECRET;

  const invalid = (v: string | undefined) =>
    v === undefined || v.trim() === '' || v === 'TODO_FILL_MANUALLY';

  if (invalid(email) || invalid(password) || invalid(pepper)) {
    throw new Error(
      'Banco vazio, mas INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD ou ARGON2_SECRET ' +
        'não estão preenchidos em .env.local — impossível criar o admin de bootstrap.',
    );
  }

  // O hash é assíncrono e precisa acontecer fora da transação — as transações
  // do better-sqlite3 são estritamente síncronas.
  const senhaHash = await hashPassword(password as string);

  const result = db.transaction((tx) => {
    const user = tx
      .insert(users)
      .values({
        nome: 'Admin',
        email: email as string,
        senhaHash,
      })
      .returning({ id: users.id })
      .get();

    if (!user) {
      throw new Error('Falha ao inserir o admin de bootstrap.');
    }

    tx.insert(memberships).values({ userId: user.id, role: 'admin' }).run();
    return { created: true };
  });

  console.log(`[seed] Admin de bootstrap criado para ${email}`);
  return result;
}
