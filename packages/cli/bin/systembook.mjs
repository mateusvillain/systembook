#!/usr/bin/env node
// O `systembook` dentro do monorepo: roda o fonte via tsx, sem build. O pacote
// publicado usa o `bin` do `publishConfig` (`dist/cli.js`), e esta pasta nem
// vai no tarball.
import { register } from 'tsx/esm/api';

register();
await import('../src/cli.ts');
