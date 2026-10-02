/**
 * `@systembook/content/node`: o que depende de `node:fs`. Fica fora do ponto
 * de entrada principal para nunca chegar a um bundle de browser.
 */
export { readContentDir } from './tree/fs.js';
