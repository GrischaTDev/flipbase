import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { listingCurrentContentFixture } from '../../../../../services/marketplace-worker/test/fixtures/vinted-listing-current-content';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { VintedCategoryFieldStore } from './vinted-category-field.store';

const schema = listingCurrentContentFixture().schema;

function setup(data: unknown = { fields: schema }) {
  const filters: Record<string, unknown>[] = [];
  const read = vi.fn(async () => ({ data, error: null }));
  const from = vi.fn(() => {
    const current: Record<string, unknown> = {};
    filters.push(current);
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        current[key] = value;
        return query;
      },
      maybeSingle: read,
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

it('liest echte Auswahlwerte kontogebunden und fasst gleichzeitige Abrufe zusammen', async () => {
  const f = setup();
  const [first, second] = await Promise.all([
    f.store.load('account-a', schema.categoryId),
    f.store.load('account-a', schema.categoryId),
  ]);
  expect(first).toEqual(schema);
  expect(second).toEqual(schema);
  expect(f.read).toHaveBeenCalledTimes(1);
  expect(f.filters[0]).toEqual({
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

it('behandelt fehlende, fremde oder unlesbare Werte als nicht vorhanden', async () => {
  expect(await setup(null).store.load('account-a', schema.categoryId)).toBeNull();
  TestBed.resetTestingModule();
  expect(
    await setup({ fields: { ...schema, categoryId: 1 } }).store.load(
      'account-a',
      schema.categoryId,
    ),
  ).toBeNull();
  TestBed.resetTestingModule();
  const unknown = setup();
  expect(await unknown.store.load('account-b', schema.categoryId)).toBeNull();
  expect(unknown.read).not.toHaveBeenCalled();
});
