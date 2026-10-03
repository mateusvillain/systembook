import type { InstanceExport } from '@systembook/schema';
import { exportInstance } from '../../db/export.js';
import { migrationProcedure, router } from '../init.js';

/**
 * Migração entre o modo CMS e o modo estático (Epic 5). Chamado pelo CLI
 * (`systembook export`/`import`) com um token de escopo `migration`.
 */
export const migrationRouter = router({
  export: migrationProcedure.query(({ ctx }): InstanceExport => exportInstance(ctx.db)),
});
