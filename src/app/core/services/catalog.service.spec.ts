import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
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
});
