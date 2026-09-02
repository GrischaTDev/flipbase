import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createSupabaseClient } from '../../src/store/supabase.js';
import { QueryStore } from '../../src/store/query.store.js';

const client = createSupabaseClient(loadConfig(process.env));

async function insertQuery(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await client
    .from('sniper_queries')
    .insert({
      query_key: `test|${randomUUID()}`,
      search_text: 'nike air max',
      poll_interval_ms: 60000,
      ...overrides,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data!.id as string;
}

describe('QueryStore', () => {
  it('returns a query that has never been polled', async () => {
    const id = await insertQuery();
    const store = new QueryStore(client);

    const due = await store.dueQueries(new Date());

    expect(due.map((query) => query.id)).toContain(id);
  });

  it('omits a query polled more recently than its interval', async () => {
    const id = await insertQuery({ last_polled_at: new Date().toISOString() });
    const store = new QueryStore(client);

    const due = await store.dueQueries(new Date());

    expect(due.map((query) => query.id)).not.toContain(id);
  });

  it('returns a query again once its interval has passed', async () => {
    const id = await insertQuery({
      last_polled_at: new Date(Date.now() - 61_000).toISOString(),
    });
    const store = new QueryStore(client);

    const due = await store.dueQueries(new Date());

    expect(due.map((query) => query.id)).toContain(id);
  });

  it('omits an inactive query', async () => {
    const id = await insertQuery({ is_active: false });
    const store = new QueryStore(client);

    const due = await store.dueQueries(new Date());

    expect(due.map((query) => query.id)).not.toContain(id);
  });

  it('records a successful poll and resets the failure counter', async () => {
    const id = await insertQuery({ consecutive_failures: 2 });
    const store = new QueryStore(client);

    await store.markPolled(id, 'ok');

    const { data } = await client
      .from('sniper_queries')
      .select('last_status, consecutive_failures, last_polled_at')
      .eq('id', id)
      .single();

    expect(data!.last_status).toBe('ok');
    expect(data!.consecutive_failures).toBe(0);
    expect(data!.last_polled_at).not.toBeNull();
  });

  it('counts up on a failed poll', async () => {
    const id = await insertQuery({ consecutive_failures: 1 });
    const store = new QueryStore(client);

    await store.markPolled(id, 'rate_limited');

    const { data } = await client
      .from('sniper_queries')
      .select('last_status, consecutive_failures')
      .eq('id', id)
      .single();

    expect(data!.last_status).toBe('rate_limited');
    expect(data!.consecutive_failures).toBe(2);
  });

  it('marks a query as seeded and deactivates it', async () => {
    const id = await insertQuery();
    const store = new QueryStore(client);

    await store.markSeeded(id);
    const { data: seeded } = await client
      .from('sniper_queries')
      .select('is_seeded, is_active')
      .eq('id', id)
      .single();

    await store.deactivate(id);
    const { data: stopped } = await client
      .from('sniper_queries')
      .select('is_active')
      .eq('id', id)
      .single();

    expect(seeded!.is_seeded).toBe(true);
    expect(seeded!.is_active).toBe(true);
    expect(stopped!.is_active).toBe(false);
  });

  it('reads the price ceiling back as a number', async () => {
    const id = await insertQuery({ price_to: 49.5 });
    const store = new QueryStore(client);

    const due = await store.dueQueries(new Date());
    const found = due.find((query) => query.id === id);

    // Postgres liefert numeric als Zeichenkette. Ohne Umwandlung landete die
    // Preisgrenze als "49.50" in der Vinted-Anfrage.
    expect(found?.priceTo).toBe(49.5);
  });
});
