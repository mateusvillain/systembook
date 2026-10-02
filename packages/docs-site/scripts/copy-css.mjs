// O `tsc` não copia CSS para o `dist/`, mas os módulos emitidos importam os
// `.css` por caminho relativo (e o `exports` publicado aponta para eles).
// Espelha cada `.css` de `src/` no mesmo caminho em `dist/`.
import { cpSync, readdirSync } from 'node:fs';
import path from 'node:path';

const src = path.resolve(import.meta.dirname, '../src');
const dist = path.resolve(import.meta.dirname, '../dist');

for (const entry of readdirSync(src, { recursive: true })) {
  if (String(entry).endsWith('.css')) {
    cpSync(path.join(src, entry), path.join(dist, entry));
  }
}
