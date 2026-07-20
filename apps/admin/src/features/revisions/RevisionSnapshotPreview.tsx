import type { RouterOutput } from '../../lib/trpc.js';
import { PageRenderer } from '../public/PageRenderer.js';

type PageSnapshot = RouterOutput['revisions']['getById']['snapshot'];

/**
 * Preview read-only de um `PageSnapshot` completo (todas as tabs da revisão
 * selecionada), com seletor de tab (TASK-35). Desde a TASK-50 delega ao
 * `PageRenderer` compartilhado — a mesma renderização usada na doc pública.
 */
export function RevisionSnapshotPreview({ snapshot }: { snapshot: PageSnapshot }) {
  return <PageRenderer snapshot={snapshot} />;
}
