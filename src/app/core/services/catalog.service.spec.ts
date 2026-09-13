import '@angular/compiler';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service';
import { CatalogProduct } from '../models/flipbase.models';
import { SyncStatusService } from './sync-status.service';

const product: CatalogProduct = {
  id: 'product-1',
  workspace_id: 'workspace-1',
  title: 'LED-Lampe',
  tracking_mode: 'quantity',
  is_public_store: false,
};

describe('CatalogService', () => {
  it('fügt die verspätete Anlage aus A nicht in den geladenen Workspace B ein', async () => {
    let complete: ((value: { data: CatalogProduct; error: null }) => void) | undefined;
    const second = { ...product, id: 'product-2', workspace_id: 'workspace-2' };
    const service = Object.create(CatalogService.prototype) as CatalogService;
    Object.assign(service, {
      products: signal<CatalogProduct[]>([product]),
      loadedWorkspaceId: signal<string | null>('workspace-1'),
      isLoading: signal(false),
      loadError: signal(null),
      loadRequestId: 0,
      mockStore: { isDemoMode: () => false },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => ({
            insert: () => ({
              select: () => ({
                single: () =>
                  new Promise((resolve) => {
                    complete = resolve;
                  }),
              }),
            }),
            select: () => ({
              eq: () => ({ order: async () => ({ data: [second], error: null }) }),
            }),
          }),
        },
      },
    });
    const creation = service.createProduct({
      workspaceId: product.workspace_id,
      title: product.title,
    });
    await service.loadProducts('workspace-2');
    complete?.({ data: product, error: null });
    expect((await creation).data).toEqual(product);
    expect(service.products()).toEqual([{ ...second, primary_media_path: null }]);
  });
  it('legt Produkte ohne Bestandsart an und speichert ihren Zustand ohne Wareneingang', async () => {
    const saveCatalogProduct = vi.fn();
    const service = Object.create(CatalogService.prototype) as CatalogService;
    Object.assign(service, {
      products: signal<CatalogProduct[]>([]),
      mockStore: { isDemoMode: () => true, saveCatalogProduct },
    });
    const result = await service.createProduct({
      workspaceId: 'workspace-1',
      title: '  Schuh  ',
      condition: 'defective',
      conditionNotes: '  Naht beschädigt  ',
    });
    expect(result.error).toBeNull();
    expect(saveCatalogProduct).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: 'Schuh',
        tracking_mode: 'quantity',
        condition: 'defective',
        condition_notes: 'Naht beschädigt',
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('übernimmt einen bestätigten Katalogartikel in den lokalen Zustand', async () => {
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: product, error: null }) }),
    }));
    const service = Object.create(CatalogService.prototype) as CatalogService;
    Object.assign(service, {
      products: signal<CatalogProduct[]>([]),
      mockStore: { isDemoMode: signal(false) },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => ({
            insert,
          }),
        },
      },
    });

    const result = await service.createProduct({
      workspaceId: product.workspace_id,
      title: product.title,
      condition: 'new',
      conditionNotes: ' originalverpackt ',
    });

    expect(result).toMatchObject({ data: product, error: null, reportedBySyncStatus: false });
    expect(service.products()).toEqual([product]);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tracking_mode: 'quantity',
        condition: 'new',
        condition_notes: 'originalverpackt',
      }),
    );
  });

  it('stellt einen Ladefehler für die Artikelstammdaten bereit', async () => {
    const service = Object.create(CatalogService.prototype) as CatalogService;
    Object.assign(service, {
      products: signal<CatalogProduct[]>([]),
      isLoading: signal(false),
      loadError: signal<Error | null>(null),
      loadedWorkspaceId: signal<string | null>(null),
      loadRequestId: 0,
      mockStore: { isDemoMode: signal(false) },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => ({
            select: () => ({
              eq: () => ({
                order: async () => ({ data: null, error: new Error('Nicht erreichbar') }),
              }),
            }),
          }),
        },
      },
    });

    await service.loadProducts(product.workspace_id);

    expect(service.isLoading()).toBe(false);
    expect(service.loadError()?.message).toContain('Nicht erreichbar');
  });

  it('ignoriert eine verspätete Antwort des zuvor aktiven Workspace', async () => {
    const products = signal<CatalogProduct[]>([product]);
    const loadedWorkspaceId = signal<string | null>('workspace-1');
    const responses = new Map<
      string,
      (result: { data: CatalogProduct[]; error: Error | null }) => void
    >();
    const service = Object.create(CatalogService.prototype) as CatalogService;
    Object.assign(service, {
      products,
      isLoading: signal(false),
      loadError: signal<Error | null>(null),
      loadedWorkspaceId,
      loadRequestId: 0,
      mockStore: { isDemoMode: signal(false) },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => ({
            select: () => ({
              eq: (_column: string, workspaceId: string) => ({
                order: () =>
                  new Promise<{ data: CatalogProduct[]; error: Error | null }>((resolve) => {
                    responses.set(workspaceId, resolve);
                  }),
              }),
            }),
          }),
        },
      },
    });
    const firstLoad = service.loadProducts('workspace-1');
    const secondLoad = service.loadProducts('workspace-2');
    expect(products()).toEqual([]);
    expect(loadedWorkspaceId()).toBeNull();
    const secondProduct = { ...product, id: 'product-2', workspace_id: 'workspace-2' };

    responses.get('workspace-2')?.({ data: [secondProduct], error: null });
    await secondLoad;
    responses.get('workspace-1')?.({ data: [product], error: null });
    await firstLoad;

    expect(products()).toEqual([{ ...secondProduct, primary_media_path: null }]);
    expect(loadedWorkspaceId()).toBe('workspace-2');
    expect(service.isLoading()).toBe(false);
    expect(service.loadError()).toBeNull();
  });

  it('legt im Demo-Modus auch ohne crypto.randomUUID einen Katalogartikel an', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.set(Array.from({ length: values.length }, (_, index) => index));
        return values;
      },
    });
    const saveCatalogProduct = vi.fn();
    const service = Object.create(CatalogService.prototype) as CatalogService;
    Object.assign(service, {
      products: signal<CatalogProduct[]>([]),
      mockStore: { isDemoMode: () => true, saveCatalogProduct },
    });

    const result = await service.createProduct({
      workspaceId: product.workspace_id,
      title: product.title,
    });

    expect(result.error).toBeNull();
    expect(result.data?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(saveCatalogProduct).toHaveBeenCalledWith(result.data);
  });
});

// Änderungen dürfen ausschließlich den Artikelstamm und dessen Workspace betreffen.
describe('CatalogService.updateProduct', () => {
  function setup() {
    const activeWorkspace = signal({ id: 'workspace-1' });
    const stored = {
      ...product,
      title: 'Alter Titel',
      primary_media_path: 'images/one.webp',
      condition: 'used' as const,
      listing_price: 9,
    };
    const single = vi.fn(
      async (): Promise<{ data: CatalogProduct | null; error: Error | null }> => ({
        data: { ...stored, title: 'Neuer Titel' },
        error: null,
      }),
    );
    const eq = vi.fn();
    eq.mockImplementation(() => ({ eq, select: () => ({ single }) }));
    const update = vi.fn(() => ({ eq }));
    const insert = vi.fn();
    const saveCatalogProduct = vi.fn();
    const service = Object.create(CatalogService.prototype) as CatalogService;
    Object.assign(service, {
      workspace: { currentWorkspace: activeWorkspace },
      products: signal<CatalogProduct[]>([stored]),
      requestedWorkspaceId: 'workspace-1',
      mockStore: {
        isDemoMode: () => false,
        getCatalogProducts: () => [stored],
        saveCatalogProduct,
      },
      syncStatus: new SyncStatusService(),
      supabase: { client: { from: vi.fn(() => ({ update, insert })) } },
    });
    return { service, activeWorkspace, stored, single, eq, update, insert, saveCatalogProduct };
  }

  it('aktualisiert statt anzulegen und begrenzt die Abfrage auf ID und Workspace', async () => {
    const { service, update, eq, insert, stored } = setup();
    const result = await service.updateProduct(product.id, {
      workspaceId: product.workspace_id,
      title: ' Neuer Titel ',
      description: ' Text ',
    });
    expect(result.error).toBeNull();
    expect(update).toHaveBeenCalledExactlyOnceWith({ title: 'Neuer Titel', description: 'Text' });
    expect(eq.mock.calls).toEqual([
      ['id', product.id],
      ['workspace_id', product.workspace_id],
    ]);
    expect(insert).not.toHaveBeenCalled();
    expect(service.products()).toEqual([{ ...stored, title: 'Neuer Titel' }]);
  });

  it('speichert Demoänderungen dauerhaft und erhält Medien und nicht bearbeitete Felder', async () => {
    const { service, stored, saveCatalogProduct } = setup();
    Object.assign(service, {
      mockStore: { isDemoMode: () => true, getCatalogProducts: () => [stored], saveCatalogProduct },
    });
    await service.updateProduct(product.id, {
      workspaceId: product.workspace_id,
      description: ' Beschreibung ',
    });
    expect(saveCatalogProduct).toHaveBeenCalledExactlyOnceWith({
      ...stored,
      description: 'Beschreibung',
    });
    expect(service.products()).toEqual([{ ...stored, description: 'Beschreibung' }]);
  });

  it('blockiert einen bereits gewechselten Workspace vor dem Schreiben', async () => {
    const { service, activeWorkspace, update } = setup();
    activeWorkspace.set({ id: 'workspace-2' });
    const result = await service.updateProduct(product.id, {
      workspaceId: product.workspace_id,
      title: 'Neu',
    });
    expect(result.error?.message).toContain('Workspace');
    expect(update).not.toHaveBeenCalled();
  });

  it('übernimmt eine verspätete Speicherantwort nicht in den neuen Workspace', async () => {
    const { service, activeWorkspace, single, stored } = setup();
    let complete!: (value: { data: CatalogProduct; error: null }) => void;
    single.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const save = service.updateProduct(product.id, {
      workspaceId: product.workspace_id,
      title: 'Neu',
    });
    activeWorkspace.set({ id: 'workspace-2' });
    const other = { ...stored, id: 'other', workspace_id: 'workspace-2' };
    service.products.set([other]);
    complete({ data: { ...stored, title: 'Neu' }, error: null });
    expect((await save).error).toBeNull();
    expect(service.products()).toEqual([other]);
  });

  it.each(['error', 'missing', 'throw'] as const)(
    'lässt lokale Daten bei %s unverändert',
    async (failure) => {
      const { service, single, stored } = setup();
      if (failure === 'throw') single.mockRejectedValueOnce(new Error('Offline'));
      else
        single.mockResolvedValueOnce({
          data: null,
          error: failure === 'error' ? new Error('Offline') : null,
        });
      const result = await service.updateProduct(product.id, {
        workspaceId: product.workspace_id,
        title: 'Neu',
      });
      expect(result.error).toBeInstanceOf(Error);
      expect(service.products()).toEqual([stored]);
    },
  );

  it('legt im Demo-Modus keinen unbekannten oder fremden Artikel an', async () => {
    const { service, stored, saveCatalogProduct } = setup();
    Object.assign(service, {
      mockStore: {
        isDemoMode: () => true,
        getCatalogProducts: () => [{ ...stored, workspace_id: 'foreign' }],
        saveCatalogProduct,
      },
    });
    expect(
      (await service.updateProduct(product.id, { workspaceId: product.workspace_id, title: 'Neu' }))
        .error,
    ).toBeInstanceOf(Error);
    expect(saveCatalogProduct).not.toHaveBeenCalled();
  });

  it('liefert Demozuordnungen ausschließlich über Einkaufspositionen und verändert deren Text nicht', async () => {
    const { service, stored, saveCatalogProduct } = setup();
    const line = {
      id: 'line-1',
      workspace_id: product.workspace_id,
      catalog_product_id: product.id,
      purchase_id: 'purchase-1',
      title_snapshot: 'Historischer Einkaufstext',
    };
    const item = {
      id: 'item-1',
      workspace_id: product.workspace_id,
      purchase_line_id: line.id,
      title: 'Historisches Stück',
    };
    Object.assign(service, {
      mockStore: {
        isDemoMode: () => true,
        getCatalogProducts: () => [stored],
        saveCatalogProduct,
        getPurchaseLines: () => [line, { ...line, id: 'other-line', catalog_product_id: 'other' }],
        getItems: () => [
          item,
          { ...item, id: 'unlinked', purchase_line_id: null },
          { ...item, id: 'foreign', workspace_id: 'foreign' },
        ],
        getPurchases: () => [
          { id: 'purchase-1', workspace_id: product.workspace_id, title: 'Einkauf' },
        ],
      },
    });
    await service.updateProduct(product.id, {
      workspaceId: product.workspace_id,
      title: 'Neuer Stammtitel',
    });
    const result = await service.loadProductEntries(product.id, product.workspace_id);
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0].inventory_items).toEqual([item]);
    expect(result.data?.[0].title_snapshot).toBe('Historischer Einkaufstext');
  });
});

describe('CatalogService.loadProductEntries', () => {
  it('liest echte Stückbeziehungen samt Verkaufszustand innerhalb des Workspace', async () => {
    const item = {
      id: 'item-1',
      workspace_id: product.workspace_id,
      purchase_line_id: 'line-1',
      title: 'Historisches Stück',
    };
    const entries = [
      {
        id: 'line-1',
        workspace_id: product.workspace_id,
        catalog_product_id: product.id,
        title_snapshot: 'Alter Einkaufstext',
        inventory_items: [
          item,
          { ...item, id: 'wrong-workspace', workspace_id: 'foreign' },
          { ...item, id: 'wrong-line', purchase_line_id: 'other' },
        ],
        purchase: { id: 'purchase-1', title: 'Einkauf' },
      },
    ];
    const order = vi.fn(async () => ({ data: entries, error: null }));
    const filterIds = vi.fn(async () => ({
      data: [
        {
          inventory_item_id: item.id,
          workspace_id: product.workspace_id,
          sale_state: 'sold',
          active_sale_count: 1,
          active_sale_id: 'sale-1',
        },
      ],
      error: null,
    }));
    const eq = vi.fn();
    eq.mockImplementation(() => ({ eq, order, in: filterIds }));
    const from = vi.fn(() => ({ select: () => ({ eq }) }));
    const service = Object.create(CatalogService.prototype) as CatalogService;
    Object.assign(service, {
      workspace: { currentWorkspace: () => ({ id: product.workspace_id }) },
      mockStore: { isDemoMode: () => false },
      syncStatus: new SyncStatusService(),
      supabase: { client: { from } },
    });
    const result = await service.loadProductEntries(product.id, product.workspace_id);
    expect(result.error).toBeNull();
    expect(from.mock.calls).toEqual([['purchase_lines'], ['inventory_item_sale_states']]);
    expect(eq.mock.calls).toEqual([
      ['workspace_id', product.workspace_id],
      ['catalog_product_id', product.id],
      ['workspace_id', product.workspace_id],
    ]);
    expect(filterIds).toHaveBeenCalledExactlyOnceWith('inventory_item_id', [item.id]);
    expect(result.data?.[0].inventory_items).toEqual([
      { ...item, sale_state: 'sold', active_sale_count: 1, active_sale_id: 'sale-1' },
    ]);
    expect(result.data?.[0].title_snapshot).toBe('Alter Einkaufstext');
  });
});

describe('CatalogService.loadProduct', () => {
  it('lädt Details direkt per Kennung unabhängig vom geladenen Katalog', async () => {
    const maybeSingle = vi.fn(async () => ({ data: product, error: null }));
    const eq = vi.fn();
    eq.mockImplementation(() => ({ eq, maybeSingle }));
    const from = vi.fn(() => ({ select: () => ({ eq }) }));
    const service = Object.create(CatalogService.prototype) as CatalogService;
    Object.assign(service, {
      products: signal<CatalogProduct[]>([]),
      workspace: { currentWorkspace: () => ({ id: product.workspace_id }) },
      mockStore: { isDemoMode: () => false },
      syncStatus: new SyncStatusService(),
      supabase: { client: { from } },
    });
    expect((await service.loadProduct(product.id, product.workspace_id)).data).toEqual(product);
    expect(eq.mock.calls).toEqual([
      ['workspace_id', product.workspace_id],
      ['id', product.id],
    ]);
    expect(service.products()).toEqual([]);
  });
});
