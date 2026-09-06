export interface CategorySyncState {
  refreshedAt: string | null;
  requestedAt: string | null;
}

/**
 * Wann der Kategoriebaum neu eingelesen wird.
 *
 * Zwei Gruende, und nur diese beiden: Der gespeicherte Stand ist aelter als die
 * Frist, oder jemand hat in der Administration ausdruecklich angefordert.
 *
 * Bewusst in TypeScript entschieden statt in SQL - genauso wie die
 * Faelligkeit einer Abfrage in query.store.ts. So bleibt die Regel ohne
 * Datenbank testbar.
 */
export function isRefreshDue(state: CategorySyncState, now: Date, maxAgeMs: number): boolean {
  if (state.refreshedAt === null) return true;

  const refreshed = new Date(state.refreshedAt).getTime();

  if (state.requestedAt !== null && new Date(state.requestedAt).getTime() > refreshed) {
    return true;
  }

  return now.getTime() - refreshed >= maxAgeMs;
}
