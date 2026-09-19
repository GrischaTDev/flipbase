import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from '../models/flipbase.models';
import { BrandService } from './brand.service';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';

const workspace = (id: string): Workspace => ({
  id,
  name: id,
  currency: 'EUR',
  min_roi_percent: 30,
  min_profit_amount: 15,
  created_at: '2026-09-14T10:00:00.000Z',
});

interface BrandRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
}

function selectQuery(pages: BrandRow[][]) {
  const range = vi.fn(async () => ({ data: pages.shift() ?? [], error: null }));
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    range,
  };
  return { query, range };
}

function createService(options: {
  readonly pages?: BrandRow[][];
  readonly insertResult?: {
    data: BrandRow | null;
    error: { code?: string; message: string } | null;
  };
}) {
  const current = signal<Workspace | null>(workspace('ws-1'));
  const pages = options.pages ?? [];
  const insert = vi.fn(() => ({
    select: () => ({
      single: async () =>
        options.insertResult ?? { data: null, error: { message: 'kein Ergebnis' } },
    }),
  }));
  const selects: ReturnType<typeof selectQuery>[] = [];
  const from = vi.fn(() => {
    const select = selectQuery(pages);
    selects.push(select);
    return { ...select.query, insert };
  });
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { from } } },
      { provide: WorkspaceService, useValue: { currentWorkspace: current } },
    ],
  });
  const service = runInInjectionContext(injector, () => new BrandService());
  return { service, from, insert, current, selects };
}

describe('BrandService', () => {
  beforeEach(() => localStorage.clear());

  it('lädt die Marken des Workspace einmal und sortiert sie', async () => {
    const { service, from } = createService({
      pages: [
        [
          { id: 'b2', workspace_id: 'ws-1', name: 'Sony' },
          { id: 'b1', workspace_id: 'ws-1', name: 'Bosch' },
        ],
        [],
      ],
    });

    await service.ensureLoaded();
    await service.ensureLoaded();

    expect(service.brands().map((brand) => brand.name)).toEqual(['Bosch', 'Sony']);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('zeigt nach einem Workspacewechsel keine fremden Marken', async () => {
    const { service, current } = createService({
      pages: [[{ id: 'b1', workspace_id: 'ws-1', name: 'Bosch' }], []],
    });
    await service.ensureLoaded();

    current.set(workspace('ws-2'));

    expect(service.brands()).toEqual([]);
  });

  it('sucht Anfangstreffer vor enthaltenen Treffern', async () => {
    const { service } = createService({
      pages: [
        [
          { id: 'b1', workspace_id: 'ws-1', name: 'Adidas' },
          { id: 'b2', workspace_id: 'ws-1', name: 'Dash' },
          { id: 'b3', workspace_id: 'ws-1', name: 'Das Keyboard' },
        ],
        [],
      ],
    });
    await service.ensureLoaded();

    expect(service.search('das').map((brand) => brand.name)).toEqual([
      'Das Keyboard',
      'Dash',
      'Adidas',
    ]);
    expect(service.findByName(' DASH ')?.id).toBe('b2');
  });

  it('liefert eine vorhandene Marke, statt sie doppelt anzulegen', async () => {
    const { service, insert } = createService({
      pages: [[{ id: 'b1', workspace_id: 'ws-1', name: 'Bosch' }], []],
    });

    const result = await service.create('  bosch ');

    expect(result).toEqual({ data: { id: 'b1', workspaceId: 'ws-1', name: 'Bosch' }, error: null });
    expect(insert).not.toHaveBeenCalled();
  });

  it('legt eine neue Marke an und nimmt sie in die Liste auf', async () => {
    const { service, insert } = createService({
      pages: [[], []],
      insertResult: { data: { id: 'b9', workspace_id: 'ws-1', name: 'Makita' }, error: null },
    });

    const result = await service.create('Makita');

    expect(insert).toHaveBeenCalledWith({ workspace_id: 'ws-1', name: 'Makita' });
    expect(result.data?.id).toBe('b9');
    expect(service.findByName('makita')?.id).toBe('b9');
  });

  it('übernimmt bei gleichzeitigem Anlegen die bereits vorhandene Marke', async () => {
    const { service } = createService({
      pages: [[], [{ id: 'b5', workspace_id: 'ws-1', name: 'Makita' }], []],
      insertResult: { data: null, error: { code: '23505', message: 'duplicate key' } },
    });

    const result = await service.create('makita');

    expect(result).toEqual({
      data: { id: 'b5', workspaceId: 'ws-1', name: 'Makita' },
      error: null,
    });
  });

  it('meldet ungültige Namen ohne Datenbankzugriff', async () => {
    const { service, from } = createService({});

    await expect(service.create('   ')).resolves.toMatchObject({ data: null });
    await expect(service.create('x'.repeat(121))).resolves.toMatchObject({ data: null });
    expect(from).not.toHaveBeenCalled();
  });
});
