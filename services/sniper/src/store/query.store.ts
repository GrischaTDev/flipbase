import type { SupabaseClient } from '@supabase/supabase-js';

import type { QueryRunState, QueryStatus, SniperQuery } from '../domain/query.js';
import type { RetryDecision } from '../runtime/retry-policy.js';

interface QueryRow {
  id: string;
  query_key: string;
  marketplace: string;
  search_text: string | null;
  catalog_id: number | null;
  brand_id: number | null;
  price_to: string | number | null;
  price_from: string | number | null;
  poll_interval_ms: number;
  is_seeded: boolean;
  is_active: boolean;
  run_state: QueryRunState;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error_kind: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  last_polled_at: string | null;
  last_status: QueryStatus;
  consecutive_failures: number;
}

const COLUMNS =
  'id, query_key, marketplace, search_text, catalog_id, brand_id, price_to, price_from, poll_interval_ms, is_seeded, is_active, run_state, next_attempt_at, last_attempt_at, last_success_at, last_error_kind, last_error_at, last_error_message, last_polled_at, last_status, consecutive_failures';

function toQuery(row: QueryRow): SniperQuery {
  return {
    id: row.id,
    queryKey: row.query_key,
    marketplace: 'vinted',
    searchText: row.search_text,
    catalogId: row.catalog_id,
    brandId: row.brand_id,
    // Postgres liefert numeric als Zeichenkette. Ohne diese Umwandlung landete
    // die Preisgrenze als "49.50" in der Vinted-Anfrage.
    priceTo: row.price_to === null ? null : Number(row.price_to),
    priceFrom: row.price_from === null ? null : Number(row.price_from),
    pollIntervalMs: row.poll_interval_ms,
    isSeeded: row.is_seeded,
    isActive: row.is_active,
    runState: row.run_state ?? 'ready',
    nextAttemptAt: row.next_attempt_at,
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    lastErrorKind: row.last_error_kind,
    lastErrorAt: row.last_error_at,
    lastErrorMessage: row.last_error_message,
    lastPolledAt: row.last_polled_at,
    lastStatus: row.last_status,
    consecutiveFailures: row.consecutive_failures,
  };
}

/**
 * Faellig ist eine Abfrage, wenn:
 * 1. Ihr run_state weder 'blocked' noch 'invalid' ist.
 * 2. Ein evtl. gesetzter next_attempt_at erreicht ist.
 * 3. Sie noch nie lief oder ihr pollIntervalMs bzw. Backoff abgelaufen ist.
 */
export function isDue(query: SniperQuery, now: Date): boolean {
  if (query.runState === 'blocked' || query.runState === 'invalid') {
    return false;
  }

  if (query.nextAttemptAt != null) {
    return now.getTime() >= new Date(query.nextAttemptAt).getTime();
  }

  if (query.lastPolledAt == null) {
    return true;
  }

  const elapsed = now.getTime() - new Date(query.lastPolledAt).getTime();
  let minInterval = query.pollIntervalMs;

  if (query.lastStatus === 'rate_limited' || query.lastStatus === 'forbidden') {
    const backoffExponent = Math.min(Math.max(0, query.consecutiveFailures - 1), 4);
    const backoffMs = Math.min(120_000 * Math.pow(2, backoffExponent), 600_000);
    minInterval = Math.max(minInterval, backoffMs);
  }

  return elapsed >= minInterval;
}

export class QueryStore {
  constructor(private readonly client: SupabaseClient) {}

  async dueQueries(now: Date): Promise<SniperQuery[]> {
    const { data, error } = await this.client
      .from('sniper_queries')
      .select(COLUMNS)
      .eq('is_active', true)
      .not('run_state', 'in', '("blocked","invalid")')
      .order('last_polled_at', { ascending: true, nullsFirst: true });

    if (error) {
      throw new Error(`loading queries failed: ${error.message}`);
    }

    return (data as QueryRow[]).map(toQuery).filter((query) => isDue(query, now));
  }

  /**
   * Ein erfolgreicher Lauf setzt run_state auf 'ready', Fehlerzaehler auf 0
   * und leert next_attempt_at.
   */
  async recordSuccess(id: string, now: Date = new Date()): Promise<void> {
    const timestamp = now.toISOString();
    const { error } = await this.client
      .from('sniper_queries')
      .update({
        run_state: 'ready',
        next_attempt_at: null,
        last_attempt_at: timestamp,
        last_success_at: timestamp,
        last_polled_at: timestamp,
        last_status: 'ok',
        consecutive_failures: 0,
        updated_at: timestamp,
      })
      .eq('id', id);

    if (error) {
      throw new Error(`recording success for query ${id} failed: ${error.message}`);
    }
  }

  /**
   * Speichert das Ergebnis einer Fehlerentscheidung (RetryDecision).
   * Wichtig: `is_active` wird hier NIEMALS veraendert - technische Fehler
   * steuern ausschliesslich run_state und next_attempt_at.
   */
  async recordFailure(id: string, decision: RetryDecision, now: Date = new Date()): Promise<void> {
    const timestamp = now.toISOString();
    let status: QueryStatus = 'failed';
    if (decision.errorKind === 'rate_limited') {
      status = 'rate_limited';
    } else if (decision.errorKind === 'forbidden') {
      status = 'forbidden';
    }

    const { error } = await this.client
      .from('sniper_queries')
      .update({
        run_state: decision.runState,
        next_attempt_at: decision.nextAttemptAt ? decision.nextAttemptAt.toISOString() : null,
        last_attempt_at: timestamp,
        last_error_kind: decision.errorKind,
        last_error_at: timestamp,
        last_error_message: decision.errorMessage.slice(0, 500),
        last_polled_at: timestamp,
        last_status: status,
        consecutive_failures: decision.consecutiveFailures,
        updated_at: timestamp,
      })
      .eq('id', id);

    if (error) {
      throw new Error(`recording failure for query ${id} failed: ${error.message}`);
    }
  }

  /**
   * Legacy-Kompatibilitaet: delegiert bei 'ok' an recordSuccess.
   */
  async markPolled(id: string, status: QueryStatus): Promise<void> {
    if (status === 'ok') {
      await this.recordSuccess(id);
      return;
    }

    const { data, error: readError } = await this.client
      .from('sniper_queries')
      .select('consecutive_failures')
      .eq('id', id)
      .single();

    if (readError) {
      throw new Error(`reading query ${id} failed: ${readError.message}`);
    }

    const failures = (data!.consecutive_failures as number) + 1;
    const timestamp = new Date().toISOString();

    const { error } = await this.client
      .from('sniper_queries')
      .update({
        last_polled_at: timestamp,
        last_status: status,
        consecutive_failures: failures,
        updated_at: timestamp,
      })
      .eq('id', id);

    if (error) {
      throw new Error(`updating query ${id} failed: ${error.message}`);
    }
  }

  /** Der Einlese-Lauf hat stattgefunden; ab jetzt zaehlen nur noch Neuzugaenge. */
  async markSeeded(id: string): Promise<void> {
    const { error } = await this.client
      .from('sniper_queries')
      .update({ is_seeded: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw new Error(`marking query ${id} as seeded failed: ${error.message}`);
    }
  }

  /** Administrativ vom Nutzer ausgeloestes Stilllegen. */
  async deactivate(id: string): Promise<void> {
    const { error } = await this.client
      .from('sniper_queries')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw new Error(`deactivating query ${id} failed: ${error.message}`);
    }
  }
}
