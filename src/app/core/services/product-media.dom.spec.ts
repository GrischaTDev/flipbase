import '@angular/compiler';
import { computed, Injector, runInInjectionContext, signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaService } from './media.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';
import { AuthService } from './auth.service';

const product = {
  id: 'product-1',
  workspace_id: 'workspace-1',
  title: 'Schuh',
  tracking_mode: 'quantity' as const,
  is_public_store: false,
};
const injectors: ReturnType<typeof Injector.create>[] = [];
function setup(client: unknown, demo = false) {
  const store = new MockDataStoreService();
  store.isDemoMode.set(demo);
  const workspace = signal({ id: product.workspace_id });
  const session = signal<{ access_token: string } | null>({ access_token: 'session-a' });
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client } },
      { provide: MockDataStoreService, useValue: store },
      { provide: SyncStatusService, useValue: new SyncStatusService() },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: AuthService, useValue: { session } },
    ],
  });
  injectors.push(injector);
  return {
    service: runInInjectionContext(injector, () => new MediaService()),
    store,
    workspace,
    session,
  };
}
afterEach(() => {
  injectors.splice(0).forEach((injector) => injector.destroy());
  localStorage.clear();
  vi.useRealTimers();
});

function clientForUpload(
  insertError: Error | null = null,
  rollbackError: Error | null = null,
  visible = true,
) {
  const upload = vi.fn(async (_path: string, _file: File, _options: unknown) => ({ error: null }));
  const remove = vi.fn(async () => ({ error: rollbackError }));
  const insert = vi.fn((metadata: Record<string, unknown>) => ({
    select: () => ({
      single: async () => ({
        data: insertError
          ? null
          : { ...metadata, id: 'media-1', created_at: '2026-09-09T00:00:00Z' },
        error: insertError,
      }),
    }),
  }));
  const orders: string[] = [];
  const query = {
    eq: () => query,
    order: (column: string) => {
      orders.push(column);
      return query;
    },
    then: (resolve: (value: { data: never[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  const client = {
    storage: { from: () => ({ upload, remove }) },
    from: (table: string) =>
      table === 'catalog_products'
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: visible ? product : null, error: null }),
              }),
            }),
          }
        : { select: () => query, insert },
  };
  return { client, upload, remove, insert, orders };
}

describe('Produktmedien', () => {
  it('kann Bild-URLs aus einer reinen Darstellung lesen, ohne synchron Signale zu schreiben', () => {
    const { service } = setup({});
    const image = computed(() => service.getMediaUrl('data:image/png;base64,YmlsZA=='));
    expect(image()).toBe('data:image/png;base64,YmlsZA==');
  });
  it('leitet den Workspace vom Produkt ab und speichert ausschließlich den sicheren neuen Pfad', async () => {
    const backend = clientForUpload();
    const { service } = setup(backend.client);
    const file = new File(['bild'], '../Schuh.jpg', { type: 'image/jpeg' });
    const result = await service.uploadProductMedia(product.id, file);
    expect(result.error).toBeNull();
    const path = backend.upload.mock.calls[0]?.[0];
    expect(path).toMatch(/^catalog-products\/workspace-1\/product-1\/[0-9a-f-]{36}\.jpg$/);
    expect(backend.upload).toHaveBeenCalledWith(path, file, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    expect(backend.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: product.workspace_id,
        storage_path: path,
        is_primary: true,
      }),
    );
    expect(backend.orders).toEqual(['is_primary', 'sort_order', 'created_at', 'id']);
    expect(backend.remove).not.toHaveBeenCalled();
  });

  it('entfernt bei Metadatenfehler exakt die gerade hochgeladene Datei', async () => {
    const backend = clientForUpload(new Error('Metadaten gesperrt'));
    const { service } = setup(backend.client);
    const result = await service.uploadProductMedia(
      product.id,
      new File(['bild'], 'a.png', { type: 'image/png' }),
    );
    expect(result.error?.message).toContain('Metadaten gesperrt');
    expect(backend.remove).toHaveBeenCalledExactlyOnceWith([backend.upload.mock.calls[0]?.[0]]);
  });

  it('meldet ein fehlgeschlagenes Rollback mit dem konkreten Pfad', async () => {
    const backend = clientForUpload(new Error('Metadaten gesperrt'), new Error('Storage gesperrt'));
    const { service } = setup(backend.client);
    const result = await service.uploadProductMedia(
      product.id,
      new File(['bild'], 'a.png', { type: 'image/png' }),
    );
    expect(result.error?.message).toContain('Nicht entfernt: catalog-products/');
  });

  it('lädt ohne autorisierten Produktnachweis keine Datei hoch', async () => {
    const backend = clientForUpload(null, null, false);
    const { service } = setup(backend.client);
    expect(
      (
        await service.uploadProductMedia(
          product.id,
          new File(['bild'], 'a.png', { type: 'image/png' }),
        )
      ).error,
    ).not.toBeNull();
    expect(backend.upload).not.toHaveBeenCalled();
  });

  it('persistiert Demo-Bilder getrennt von Item-Medien über neue Instanzen hinweg', async () => {
    const { service, store } = setup({}, true);
    store.saveCatalogProduct(product);
    localStorage.setItem('flipbase_local_media', '[]');
    const result = await service.uploadProductMedia(
      product.id,
      new File(['bild'], 'a.png', { type: 'image/png' }),
    );
    expect(result.error).toBeNull();
    const reloaded = setup({}, true);
    expect(await reloaded.service.loadProductMedia(product.id)).toEqual([result.data]);
    expect(localStorage.getItem('flipbase_local_media')).toBe('[]');
    expect(localStorage.getItem('flipbase_local_catalog_product_media')).toContain(
      'data:image/png;base64,',
    );
  });

  it('signiert Listen im Batch und erneuert URLs vor dem Ablauf', async () => {
    vi.useFakeTimers();
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({
        path,
        signedUrl: 'https://images/' + path + '?v=' + Date.now(),
        error: null,
      })),
      error: null,
    }));
    const { service } = setup({ storage: { from: () => ({ createSignedUrls }) } });
    expect(service.getMediaUrl('a.png')).toBe('');
    expect(service.getMediaUrl('b.png')).toBe('');
    await vi.advanceTimersByTimeAsync(0);
    expect(createSignedUrls).toHaveBeenCalledExactlyOnceWith(['a.png', 'b.png'], 3600);
    const first = service.getMediaUrl('a.png');
    expect(first).toContain('https://images/');
    await vi.advanceTimersByTimeAsync(3480000);
    expect(service.getMediaUrl('a.png')).toBe('');
    await vi.advanceTimersByTimeAsync(0);
    expect(service.getMediaUrl('a.png')).not.toBe(first);
  });

  it('verwirft verspätete Signaturen nach Workspacewechsel', async () => {
    let complete:
      ((value: { data: { path: string; signedUrl: string }[]; error: null }) => void) | undefined;
    const createSignedUrls = vi.fn(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { service, workspace } = setup({ storage: { from: () => ({ createSignedUrls }) } });
    service.getMediaUrl('catalog-products/workspace-1/product-1/a.png');
    await Promise.resolve();
    workspace.set({ id: 'workspace-2' });
    complete?.({
      data: [
        { path: 'catalog-products/workspace-1/product-1/a.png', signedUrl: 'https://old/image' },
      ],
      error: null,
    });
    await Promise.resolve();
    expect(service.getMediaUrl('catalog-products/workspace-1/product-1/a.png')).toBe('');
  });

  it('verwirft nach Sitzungswechsel bereits zwischengespeicherte Signaturen', async () => {
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: 'https://old/image' })),
      error: null,
    }));
    const { service, session } = setup({ storage: { from: () => ({ createSignedUrls }) } });
    service.getMediaUrl('a.png');
    await Promise.resolve();
    await Promise.resolve();
    expect(service.getMediaUrl('a.png')).toBe('https://old/image');
    session.set({ access_token: 'session-b' });
    expect(service.getMediaUrl('a.png')).toBe('');
  });

  it('signalisiert nach einem Bildfehler einen begrenzten automatischen Wiederholungsversuch', async () => {
    vi.useFakeTimers();
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: 'https://image/' + path })),
      error: null,
    }));
    const { service } = setup({ storage: { from: () => ({ createSignedUrls }) } });
    const reactiveUrl = computed(() => service.getMediaUrl('a.png'));
    expect(reactiveUrl()).toBe('');
    await vi.advanceTimersByTimeAsync(0);
    expect(reactiveUrl()).toBe('https://image/a.png');
    service.reportMediaFailure('a.png');
    expect(reactiveUrl()).toBe('');
    await vi.advanceTimersByTimeAsync(30000);
    expect(reactiveUrl()).toBe('');
    await vi.advanceTimersByTimeAsync(0);
    expect(reactiveUrl()).toBe('https://image/a.png');
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    service.reportMediaFailure('a.png');
    expect(reactiveUrl()).toBe('');
    await vi.advanceTimersByTimeAsync(60000);
    expect(reactiveUrl()).toBe('');
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });
});

describe('Galeriespeicherung', () => {
  it('sortiert und entfernt Demo-Bilder dauerhaft, erkennt aber konkurrierende Änderungen', async () => {
    const { service, store } = setup({}, true);
    store.saveCatalogProduct(product);
    const first = await service.uploadProductMedia(
      product.id,
      new File(['a'], 'a.png', { type: 'image/png' }),
    );
    const second = await service.uploadProductMedia(
      product.id,
      new File(['b'], 'b.png', { type: 'image/png' }),
    );
    const ids = [first.data!.id, second.data!.id];
    const conflict = await service.updateProductMediaLayout(
      product.id,
      [ids[0]!],
      [ids[0]!],
      product.workspace_id,
    );
    expect(conflict.error?.message).toContain('zwischenzeitlich');
    expect(store.getCatalogProductMedia(product.id)).toHaveLength(2);
    const result = await service.updateProductMediaLayout(
      product.id,
      [...ids].reverse(),
      ids,
      product.workspace_id,
    );
    expect(result.data?.map((entry) => [entry.id, entry.sort_order, entry.is_primary])).toEqual([
      [ids[1], 0, true],
      [ids[0], 1, false],
    ]);
    expect(
      (await service.updateProductMediaLayout(product.id, [ids[0]!], ids, product.workspace_id))
        .data,
    ).toHaveLength(1);
    const reloaded = new MockDataStoreService();
    reloaded.isDemoMode.set(true);
    expect(reloaded.getCatalogProductMedia(product.id)).toHaveLength(1);
  });
  it('verhindert doppelte IDs und fremde Workspaces ohne RPC', async () => {
    const rpc = vi.fn();
    const { service } = setup({ rpc });
    expect(
      (await service.updateProductMediaLayout(product.id, ['a', 'a'], ['a'], product.workspace_id))
        .error,
    ).not.toBeNull();
    expect(
      (await service.updateProductMediaLayout(product.id, [], [], 'foreign')).error,
    ).not.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('räumt Dateien erst nach erfolgreichem RPC auf und bestätigt trotz Bereinigungsfehler', async () => {
    const remove = vi.fn(async () => ({ error: new Error('Storage offline') }));
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const { service } = setup({ rpc, storage: { from: () => ({ remove }) } });
    vi.spyOn(service, 'loadProductMedia').mockResolvedValue([
      {
        id: 'a',
        workspace_id: product.workspace_id,
        catalog_product_id: product.id,
        storage_path: 'catalog-products/workspace-1/product-1/a.png',
        is_primary: true,
        sort_order: 0,
      },
    ]);
    const result = await service.updateProductMediaLayout(
      product.id,
      [],
      ['a'],
      product.workspace_id,
    );
    expect(result).toMatchObject({ data: [], error: null });
    expect(remove).toHaveBeenCalledOnce();
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]!);
    remove.mockClear();
    rpc.mockResolvedValueOnce({ data: [], error: new Error('Konflikt') } as never);
    expect(
      (await service.updateProductMediaLayout(product.id, [], ['a'], product.workspace_id)).error,
    ).not.toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
  it('beginnt nach Workspacewechsel während des Ladens keine Speicherung', async () => {
    const rpc = vi.fn();
    const { service, workspace } = setup({ rpc });
    vi.spyOn(service, 'loadProductMedia').mockImplementation(async () => {
      workspace.set({ id: 'foreign' });
      return [];
    });
    expect(
      (await service.updateProductMediaLayout(product.id, [], [], product.workspace_id)).error,
    ).not.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

it('bestätigt RPC-Erfolg nach Kontextwechsel, startet aber keine Dateibereinigung', async () => {
  const remove = vi.fn();
  const { service, workspace } = setup({
    storage: { from: () => ({ remove }) },
    rpc: async () => {
      workspace.set({ id: 'foreign' });
      return { data: [], error: null };
    },
  });
  vi.spyOn(service, 'loadProductMedia').mockResolvedValue([
    {
      id: 'a',
      workspace_id: product.workspace_id,
      catalog_product_id: product.id,
      storage_path: 'catalog-products/workspace-1/product-1/a.png',
      is_primary: true,
      sort_order: 0,
    },
  ]);
  expect(
    await service.updateProductMediaLayout(product.id, [], ['a'], product.workspace_id),
  ).toMatchObject({ data: [], error: null });
  expect(remove).not.toHaveBeenCalled();
});

it('schreibt nach Kontextwechsel während des Uploads keine Metadaten mit neuer Sitzung', async () => {
  const backend = clientForUpload();
  const { service, workspace } = setup(backend.client);
  backend.upload.mockImplementation(async () => {
    workspace.set({ id: 'foreign' });
    return { error: null };
  });
  const result = await service.uploadProductMedia(
    product.id,
    new File(['a'], 'a.png', { type: 'image/png' }),
  );
  expect(result.error?.message).toContain('gewechselt');
  expect(backend.insert).not.toHaveBeenCalled();
  expect(backend.remove).not.toHaveBeenCalled();
});
