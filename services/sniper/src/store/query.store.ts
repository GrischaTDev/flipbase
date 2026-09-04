import type { SupabaseClient } from '@supabase/supabase-js';

import type { QueryStatus, SniperQuery } from '../domain/query.js';

interface QueryRow {
  id: string;
  query_key: string;
  marketplace: string;
  search_text: string;
  catalog_id: number | null;
  brand_id: number | null;
  price_to: string | number | null;
  price_from: string | number | null;
  poll_interval_ms: number;
  is_seeded: boolean;
  is_active: boolean;
  last_polled_at: string | null;
  last_status: QueryStatus;
  consecutive_failures: number;
}

const COLUMNS =
  'id, query_key, marketplace, search_text, catalog_id, brand_id, price_to, price_from, poll_interval_ms, is_seeded, is_active, last_polled_at, last_status, consecutive_failures';

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
    lastPolledAt: row.last_polled_at,
    lastStatus: row.last_status,
    consecutiveFailures: row.consecutive_failures,
  };
}

/**
 * Faellig ist eine Abfrage, wenn sie noch nie lief oder ihr Takt abgelaufen
 * ist. Bewusst in TypeScript entschieden statt in SQL: So bleibt die Regel
 * ohne Datenbank testbar, und der Taktgeber ist die einzige Stelle, die ueber
 * Reihenfolge und Budget entscheidet.
 */
function isDue(query: SniperQuery, now: Date): boolean {
  if (query.lastPolledAt === null) {
    return true;
  }

  const elapsed = now.getTime() - new Date(query.lastPolledAt).getTime();
  return elapsed >= query.pollIntervalMs;
}

export class QueryStore {
  constructor(private readonly client: SupabaseClient) {}

  async dueQueries(now: Date): Promise<SniperQuery[]> {
    const { data, error } = await this.client
      .from('sniper_queries')
      .select(COLUMNS)
      .eq('is_active', true)
      .order('last_polled_at', { ascending: true, nullsFirst: true });

    if (error) {
      throw new Error(`loading queries failed: ${error.message}`);
    }

    return (data as QueryRow[]).map(toQuery).filter((query) => isDue(query, now));
  }

  /**
   * Ein erfolgreicher Lauf setzt den Fehlerzaehler zurueck, ein misslungener
   * zaehlt ihn hoch - der Taktgeber schaltet eine Abfrage nach drei Fehlern in
   * Folge ab.
   */
  async markPolled(id: string, status: QueryStatus): Promise<void> {
    const { data, error: readError } = await this.client
      .from('sniper_queries')
      .select('consecutive_failures')
      .eq('id', id)
      .single();

    if (readError) {
      throw new Error(`reading query ${id} failed: ${readError.message}`);
    }

    const failures = status === 'ok' ? 0 : (data!.consecutive_failures as number) + 1;

    const { error } = await this.client
      .from('sniper_queries')
      .update({
        last_polled_at: new Date().toISOString(),
        last_status: status,
        consecutive_failures: failures,
        updated_at: new Date().toISOString(),
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
