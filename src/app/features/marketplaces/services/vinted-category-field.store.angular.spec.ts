import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { listingCurrentContentFixture } from '../../../../../services/marketplace-worker/test/fixtures/vinted-listing-current-content';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { VintedCategoryFieldStore } from './vinted-category-field.store';

const schema = listingCurrentContentFixture().schema;

/** Datenbankantworten je Tabelle; Katalogtabellen liefern Listen, der Altbestand eine Zeile. */
function setup(
  tables: Record<string, unknown> = { vinted_category_field_snapshots: { fields: schema } },
) {
  const filters: { table: string; filters: Record<string, unknown> }[] = [];
  const read = vi.fn(async (table: string) => ({ data: tables[table] ?? null, error: null }));
  const from = vi.fn((table: string) => {
    const current: Record<string, unknown> = {};
    filters.push({ table, filters: current });
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        current[key] = value;
        return query;
      },
      in: (key: string, value: unknown) => {
        current[key] = value;
        return query;
      },
      maybeSingle: () => read(table),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        read(table).then((result) => resolve({ ...result, data: result.data ?? [] }), reject),
    };
    return query;
  });
  const connections = signal([
    { connectionId: 'account-a', workspaceId: 'workspace-a', externalAccountId: '123' },
  ]);
  TestBed.configureTestingModule({
    providers: [
      VintedCategoryFieldStore,
      { provide: SupabaseService, useValue: { client: { from } } },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: 'workspace-a' }) },
      },
      { provide: MarketplaceAccountStore, useValue: { connections } },
    ],
  });
  return { store: TestBed.inject(VintedCategoryFieldStore), read, filters, connections };
}
afterEach(() => TestBed.resetTestingModule());

const snapshotReads = (read: ReturnType<typeof setup>['read']) =>
  read.mock.calls.filter(([table]) => table === 'vinted_category_field_snapshots').length;

it('liest echte Auswahlwerte kontogebunden und fasst gleichzeitige Abrufe zusammen', async () => {
  const f = setup();
  const [first, second] = await Promise.all([
    f.store.load('account-a', schema.categoryId),
    f.store.load('account-a', schema.categoryId),
  ]);
  expect(first).toEqual(schema);
  expect(second).toEqual(schema);
  expect(snapshotReads(f.read)).toBe(1);
  expect(
    f.filters.find((entry) => entry.table === 'vinted_category_field_snapshots')?.filters,
  ).toEqual({
    workspace_id: 'workspace-a',
    connection_id: 'account-a',
    external_account_id: '123',
    category_id: schema.categoryId,
  });
  expect(f.store.fields('account-a', schema.categoryId)).toEqual(schema);
  f.connections.set([
    { connectionId: 'account-a', workspaceId: 'workspace-a', externalAccountId: '456' },
  ]);
  expect(f.store.fields('account-a', schema.categoryId)).toBeNull();
});

it('nimmt zuerst den zentralen Katalog mit allen Größengruppen und Vinted-Kennungen', async () => {
  const f = setup({
    vinted_listing_category_fields: [
      { field_code: 'brand', position: 0, option_ids: null },
      { field_code: 'size', position: 1, option_ids: null },
      { field_code: 'condition', position: 2, option_ids: [6, 2] },
      { field_code: 'color', position: 3, option_ids: null },
    ],
    vinted_listing_category_size_groups: [
      { size_group_id: 77, position: 1 },
      { size_group_id: 14, position: 0 },
    ],
    vinted_listing_sizes: [
      { id: 1640, size_group_id: 77, title: 'W32 | DE 48', position: 0 },
      { id: 208, size_group_id: 14, title: 'M', position: 1 },
      { id: 207, size_group_id: 14, title: 'S', position: 0 },
    ],
    vinted_listing_options: [
      { field_code: 'condition', id: 2, title: 'Sehr gut', position: 2 },
      { field_code: 'condition', id: 6, title: 'Neu, mit Etikett', position: 0 },
      { field_code: 'condition', id: 3, title: 'Gut', position: 3 },
      { field_code: 'color', id: 1, title: 'Schwarz', position: 0 },
    ],
    vinted_category_field_snapshots: { fields: schema },
  });
  const fields = await f.store.load('account-a', 1819);
  expect(fields?.fields.map((field) => field.field)).toEqual(['size', 'condition', 'color']);
  expect(
    fields?.fields[0]?.choices.map((choice) => [choice.id, choice.label, choice.sizeGroupId]),
  ).toEqual([
    [207, 'S', 14],
    [208, 'M', 14],
    [1640, 'W32 | DE 48', 77],
  ]);
  expect(fields?.fields[1]?.choices.map((choice) => choice.label)).toEqual([
    'Neu, mit Etikett',
    'Sehr gut',
  ]);
  expect(snapshotReads(f.read)).toBe(0);
  expect(f.filters.find((entry) => entry.table === 'vinted_listing_sizes')?.filters).toEqual({
    size_group_id: [77, 14],
  });
});

it('behandelt fehlende, fremde oder unlesbare Werte als nicht vorhanden', async () => {
  expect(
    await setup({ vinted_category_field_snapshots: null }).store.load(
      'account-a',
      schema.categoryId,
    ),
  ).toBeNull();
  TestBed.resetTestingModule();
  expect(
    await setup({
      vinted_category_field_snapshots: { fields: { ...schema, categoryId: 1 } },
    }).store.load('account-a', schema.categoryId),
  ).toBeNull();
  TestBed.resetTestingModule();
  const unknown = setup();
  expect(await unknown.store.load('account-b', schema.categoryId)).toBeNull();
  expect(unknown.read).not.toHaveBeenCalled();
});
