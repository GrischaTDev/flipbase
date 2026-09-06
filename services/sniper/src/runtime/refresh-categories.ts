import type { Logger } from '../log.js';
import { parseCategoryTree, type VintedCategory } from '../vinted/categories.js';
import { isRefreshDue, type CategorySyncState } from './category-refresh.js';

export interface CategoryStoreLike {
  readSyncState(): Promise<CategorySyncState>;
  replaceAll(categories: VintedCategory[]): Promise<void>;
  markRefreshed(count: number, at: Date): Promise<void>;
  markFailed(reason: string, at: Date): Promise<void>;
}

export interface RefreshDeps {
  store: CategoryStoreLike;
  fetchHomepage: () => Promise<string>;
  maxAgeMs: number;
  log: Logger;
}

/**
 * Frischt den Kategoriebaum auf, wenn er faellig ist.
 *
 * Wirft nie: Ein gescheitertes Einlesen darf den Takt des Sammelns nicht
 * anhalten. Der Grund landet im Auffrischungsstand und ist in der
 * Administration sichtbar.
 */
export async function refreshCategoriesIfDue(
  deps: RefreshDeps,
  now: Date,
): Promise<'skipped' | 'refreshed' | 'failed'> {
  let state: CategorySyncState;

  try {
    state = await deps.store.readSyncState();
  } catch (error) {
    deps.log.error('category_sync_state_failed', { reason: reasonOf(error) });
    return 'failed';
  }

  if (!isRefreshDue(state, now, deps.maxAgeMs)) return 'skipped';

  try {
    const html = await deps.fetchHomepage();
    const categories = parseCategoryTree(html);

    await deps.store.replaceAll(categories);
    await deps.store.markRefreshed(categories.length, now);

    deps.log.info('categories_refreshed', { count: categories.length });
    return 'refreshed';
  } catch (error) {
    const reason = reasonOf(error);
    deps.log.error('categories_refresh_failed', { reason });

    try {
      await deps.store.markFailed(reason, now);
    } catch (markError) {
      deps.log.error('category_mark_failed', { reason: reasonOf(markError) });
    }

    return 'failed';
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
