import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Raeumt weg, was die Integrationstests angelegt haben.
 *
 * Ohne das bleiben ihre Abfragen in der Datenbank stehen - und der Dienst
 * fragt sie beim naechsten Start brav alle bei Vinted ab. Am 02.09.2026 hat
 * ein Rauchtest deshalb 22 statt einer Abfrage gepollt und 77 Prozent des
 * Minutenbudgets verbraucht, bevor er zur eigentlichen Abfrage kam.
 *
 * Erkennungsmerkmal ist ausschliesslich das Praefix `test|` im Abfrage-
 * schluessel. Echte Profile tragen es nicht und bleiben unberuehrt.
 */
export async function removeTestRows(client: SupabaseClient): Promise<void> {
  const { data, error } = await client
    .from('sniper_queries')
    .select('id')
    .like('query_key', 'test|%');

  if (error) {
    throw new Error(`finding test queries failed: ${error.message}`);
  }

  const ids = (data ?? []).map((row) => row.id as string);
  if (ids.length === 0) {
    return;
  }

  // Erst die Angebote: Der Fremdschluessel steht auf `on delete set null`,
  // sonst blieben sie als herrenlose Zeilen zurueck.
  const { error: listingError } = await client
    .from('sniper_listings')
    .delete()
    .in('discovered_by_query_id', ids);

  if (listingError) {
    throw new Error(`removing test listings failed: ${listingError.message}`);
  }

  const { error: queryError } = await client.from('sniper_queries').delete().in('id', ids);

  if (queryError) {
    throw new Error(`removing test queries failed: ${queryError.message}`);
  }
}
