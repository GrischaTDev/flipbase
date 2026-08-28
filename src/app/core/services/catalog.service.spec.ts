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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('übernimmt einen bestätigten Katalogartikel in den lokalen Zustand', async () => {
    const service = Object.create(CatalogService.prototype) as CatalogService;
    Object.assign(service, {
      products: signal<CatalogProduct[]>([]),
      mockStore: { isDemoMode: signal(false) },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => ({
            insert: () => ({
              select: () => ({ single: async () => ({ data: product, error: null }) }),
            }),
          }),
        },
      },
    });

    const result = await service.createProduct({
      workspaceId: product.workspace_id,
      title: product.title,
      trackingMode: 'quantity',
    });

    expect(result).toMatchObject({ data: product, error: null, reportedBySyncStatus: false });
    expect(service.products()).toEqual([product]);
  });

  it('stellt einen Ladefehler für die Artikelstammdaten bereit', async () => {
    const service = Object.create(CatalogService.prototype) as CatalogService;
    Object.assign(service, {
      products: signal<CatalogProduct[]>([]),
      isLoading: signal(false),
      loadError: signal<Error | null>(null),
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
      trackingMode: 'quantity',
    });

    expect(result.error).toBeNull();
    expect(result.data?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(saveCatalogProduct).toHaveBeenCalledWith(result.data);
  });
});
