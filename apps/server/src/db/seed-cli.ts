import { loadEnv } from '../env.js';
import { createDb } from './client.js';
import { runMigrations } from './migrate.js';
import { seedBootstrapAdmin } from './seed.js';

const env = loadEnv();
const db = createDb(env.DATABASE_PATH);
runMigrations(db);
const { created } = seedBootstrapAdmin(db);
console.log(created ? '[seed] concluído.' : '[seed] tabela users não está vazia — nada a fazer.');
