import 'dotenv/config';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createSupabaseClient } from '../../src/store/supabase.js';
import { CategoryStore } from '../../src/store/category.store.js';
import type { VintedCategory } from '../../src/vinted/categories.js';

const client = createSupabaseClient(loadConfig(process.env));
const store = new CategoryStore(client);

const categories: VintedCategory[] = [
  { id: 1904, parentId: null, title: 'Damen', slug: '1904-women', path: 'Damen', isLeaf: false },
  {
    id: 16,
    parentId: 1904,
    title: 'Schuhe',
    slug: '16-shoes',
    path: 'Damen > Schuhe',
    isLeaf: true,
  },
];

describe('CategoryStore', () => {
  beforeEach(async () => {
    await client.from('vinted_categories').delete().gte('id', 0);
    await client
      .from('vinted_category_syncs')
      .update({ refreshed_at: null, requested_at: null, category_count: 0, last_error: null })
      .eq('id', 1);
  });

  it('schreibt den Baum und liest den Stand zurueck', async () => {
    await store.replaceAll(categories);
    await store.markRefreshed(categories.length, new Date('2026-09-06T12:00:00.000Z'));

    const { data } = await client
      .from('vinted_categories')
      .select('id, parent_id, path')
      .order('id');

    expect(data).toEqual([
      { id: 16, parent_id: 1904, path: 'Damen > Schuhe' },
      { id: 1904, parent_id: null, path: 'Damen' },
    ]);

    const state = await store.readSyncState();
    expect(state.refreshedAt).toBe('2026-09-06T12:00:00+00:00');
  });

  it('ersetzt einen frueheren Stand vollstaendig', async () => {
    await store.replaceAll(categories);
    await store.replaceAll([
      { id: 5, parentId: null, title: 'Herren', slug: '5-men', path: 'Herren', isLeaf: true },
    ]);

    const { data } = await client.from('vinted_categories').select('id');

    expect(data).toEqual([{ id: 5 }]);
  });

  it('haelt einen Fehlschlag fest, ohne den letzten guten Stand zu loeschen', async () => {
    await store.replaceAll(categories);
    await store.markRefreshed(categories.length, new Date('2026-09-06T12:00:00.000Z'));
    await store.markFailed(
      'Kein catalogTree im HTML gefunden',
      new Date('2026-09-06T13:00:00.000Z'),
    );

    const { data } = await client.from('vinted_categories').select('id');
    expect(data).toHaveLength(2);

    const { data: sync } = await client
      .from('vinted_category_syncs')
      .select('last_error, refreshed_at')
      .eq('id', 1)
      .single();

    expect(sync?.last_error).toBe('Kein catalogTree im HTML gefunden');
    expect(sync?.refreshed_at).toBe('2026-09-06T12:00:00+00:00');
  });
});
