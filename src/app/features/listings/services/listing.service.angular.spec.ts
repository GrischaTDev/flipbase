import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaService } from '../../../core/services/media.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { ListingContent } from '../models/listing.models';
import { ListingService } from './listing.service';
import { ListingImagesService } from './listing-images.service';

interface QueryResult<T> {
  readonly data: T | null;
  readonly error: { readonly message: string } | null;
}

function resolvedQuery<T>(result: Promise<QueryResult<T>>) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    then: result.then.bind(result),
  };
  return query;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const listing = {
  id: 'listing-1',
  workspace_id: 'workspace-a',
  inventory_item_id: 'item-1',
  platform: 'kleinanzeigen',
  status: 'prepared',
  end_reason: null,
  title: 'Kamera',
  description: 'Sehr gut erhalten',
  price: 20,
  price_type: 'FIXED',
  shipping_type: 'pickup',
  shipping_price: null,
  postal_code: null,
  listed_count: 1,
  last_listed_at: '2026-09-20T10:00:00.000Z',
  online_since: null,
  ended_at: null,
  created_at: '2026-09-20T10:00:00.000Z',
  updated_at: '2026-09-20T10:00:00.000Z',
};

const item = {
  id: 'item-1',
  workspace_id: 'workspace-a',
  title: 'Kamera',
  brand: 'Canon',
  category: 'Technik',
  condition: 'used',
  condition_notes: null,
  status: 'ready',
  archived_at: null,
  expected_value: 25,
  allocated_purchase_cost: 10,
  media: [
    {
      id: 'media-2',
      inventory_item_id: 'item-1',
      storage_path: 'item-1/second.jpg',
      is_primary: false,
      file_name: 'second.jpg',
      file_size: 5,
      mime_type: 'image/jpeg',
      sort_order: 2,
      created_at: '2026-09-20T10:00:00.000Z',
    },
    {
      id: 'media-1',
      inventory_item_id: 'item-1',
      storage_path: 'item-1/first.jpg',
      is_primary: true,
      file_name: 'first.jpg',
      file_size: 5,
      mime_type: 'image/jpeg',
      sort_order: 1,
      created_at: '2026-09-20T10:00:00.000Z',
    },
  ],
};

const content: ListingContent = {
  title: 'Neue Kamera',
  description: 'Neue Beschreibung',
  price: 30,
  priceType: 'NEGOTIABLE',
  shippingType: 'shipping',
  shippingPrice: 4.9,
  postalCode: '12345',
};

describe('ListingService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function setup(options?: {
    readonly from?: ReturnType<typeof vi.fn>;
    readonly rpc?: ReturnType<typeof vi.fn>;
    readonly mediaUrls?: Record<string, string>;
    readonly currentWorkspace?: WritableSignal<{ readonly id: string } | null>;
  }) {
    const currentWorkspace =
      options?.currentWorkspace ?? signal<{ readonly id: string } | null>({ id: 'workspace-a' });
    const from = options?.from ?? vi.fn();
    const rpc = options?.rpc ?? vi.fn();
    const resolveMediaUrls = vi.fn(async () => options?.mediaUrls ?? {});

    TestBed.configureTestingModule({
      providers: [
        ListingService,
        {
          provide: SupabaseService,
          useValue: { client: { from, rpc } },
        },
        { provide: WorkspaceService, useValue: { currentWorkspace } },
        { provide: MediaService, useValue: { resolveMediaUrls } },
        {
          provide: ListingImagesService,
          useValue: {
            pathsForListing: vi.fn(
              async (
                _id: string,
                item: {
                  media: readonly {
                    storage_path: string;
                    file_name: string | null;
                    sort_order?: number;
                  }[];
                },
              ) =>
                [...item.media]
                  .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
                  .map((medium) => ({ path: medium.storage_path, name: medium.file_name })),
            ),
          },
        },
      ],
    });

    return {
      service: TestBed.inject(ListingService),
      currentWorkspace,
      from,
      rpc,
      resolveMediaUrls,
    };
  }

  it('maps listings and inventory media into rows ordered newest first', async () => {
    const listingQuery = resolvedQuery(Promise.resolve({ data: [listing], error: null }));
    const itemQuery = resolvedQuery(Promise.resolve({ data: [item], error: null }));
    const { service, from } = setup({
      from: vi.fn((table: string) => (table === 'listings' ? listingQuery : itemQuery)),
    });

    await service.load('workspace-a');

    expect(service.loadedWorkspaceId()).toBe('workspace-a');
    expect(service.rows()).toHaveLength(1);
    expect(service.rows()[0]?.primaryImagePath).toBe('item-1/first.jpg');
    expect(from).toHaveBeenCalledWith('listings');
    expect(from).toHaveBeenCalledWith('inventory_items');
  });

  it('ignores a workspace A response after workspace B became active', async () => {
    const listingsA = deferred<QueryResult<readonly (typeof listing)[]>>();
    const itemsA = deferred<QueryResult<readonly (typeof item)[]>>();
    const listingB = {
      ...listing,
      id: 'listing-b',
      workspace_id: 'workspace-b',
      inventory_item_id: 'item-b',
    };
    const itemB = { ...item, id: 'item-b', workspace_id: 'workspace-b' };
    const currentWorkspace = signal<{ readonly id: string } | null>({ id: 'workspace-a' });
    const from = vi.fn((table: string) => {
      const workspace = currentWorkspace();
      if (workspace?.id === 'workspace-a') {
        return resolvedQuery(
          (table === 'listings' ? listingsA.promise : itemsA.promise) as Promise<
            QueryResult<unknown>
          >,
        );
      }
      return resolvedQuery(
        Promise.resolve({ data: table === 'listings' ? [listingB] : [itemB], error: null }),
      );
    });
    const { service } = setup({ from, currentWorkspace });

    const firstLoad = service.load('workspace-a');
    currentWorkspace.set({ id: 'workspace-b' });
    await service.load('workspace-b');
    listingsA.resolve({ data: [listing], error: null });
    itemsA.resolve({ data: [item], error: null });
    await firstLoad;

    expect(service.loadedWorkspaceId()).toBe('workspace-b');
    expect(service.rows().map((row) => row.listing.workspaceId)).toEqual(['workspace-b']);
  });

  it('calls prepare_listing with camelCase content and retains the database error', async () => {
    const response = deferred<QueryResult<typeof listing>>();
    const { service, rpc, currentWorkspace } = setup({
      rpc: vi.fn(() => response.promise),
    });

    const action = service.prepare('item-1', content);
    currentWorkspace.set(null);
    response.resolve({
      data: null,
      error: {
        message:
          'Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.',
      },
    });

    await expect(action).resolves.toMatchObject({
      data: null,
      error: {
        message:
          'Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.',
      },
    });
    expect(rpc).toHaveBeenCalledWith('prepare_listing', {
      p_workspace_id: 'workspace-a',
      p_inventory_item_id: 'item-1',
      p_catalog_product_id: null,
      p_content: {
        title: 'Neue Kamera',
        description: 'Neue Beschreibung',
        price: 30,
        priceType: 'NEGOTIABLE',
        shippingType: 'shipping',
        shippingPrice: 4.9,
        postalCode: '12345',
      },
    });
  });

  it('resolves available image URLs and returns unresolved file names separately', async () => {
    const { service, resolveMediaUrls } = setup({
      mediaUrls: { 'item-1/first.jpg': 'https://signed.test/first.jpg' },
    });
    const row = {
      listing: {
        id: 'listing-1',
        workspaceId: 'workspace-a',
        inventoryItemId: 'item-1',
        platform: 'kleinanzeigen' as const,
        status: 'prepared' as const,
        endReason: null,
        content,
        listedCount: 1,
        lastListedAt: null,
        onlineSince: null,
        endedAt: null,
        createdAt: '2026-09-20T10:00:00.000Z',
        updatedAt: '2026-09-20T10:00:00.000Z',
      },
      item: {
        id: 'item-1',
        workspaceId: 'workspace-a',
        title: 'Kamera',
        brand: null,
        category: null,
        condition: 'used' as const,
        conditionNotes: null,
        description: null,
        status: 'ready' as const,
        archivedAt: null,
        expectedValue: null,
        allocatedPurchaseCost: null,
        media: item.media,
      },
      primaryImagePath: 'item-1/first.jpg',
    };

    const result = await service.buildExtensionPayload(row);

    expect(resolveMediaUrls).toHaveBeenCalledWith(['item-1/first.jpg', 'item-1/second.jpg']);
    expect(result.payload.images).toEqual([
      { url: 'https://signed.test/first.jpg', name: 'first.jpg' },
    ]);
    expect(result.missingImages).toEqual(['second.jpg']);
  });

  it('maps catalog products with stock into rows and editor items', async () => {
    const catalogProduct = {
      id: 'prod-1',
      workspace_id: 'workspace-a',
      title: 'Mengenartikel X',
      brand: 'TestBrand',
      category: 'Gadgets',
      condition: 'new',
      condition_notes: null,
      description: 'Tolles Produkt',
      listing_price: 49.99,
      media: [
        {
          id: 'cp-media-1',
          workspace_id: 'workspace-a',
          catalog_product_id: 'prod-1',
          storage_path: 'catalog-products/workspace-a/prod-1/img.jpg',
          is_primary: true,
          file_name: 'img.jpg',
          file_size: 10,
          mime_type: 'image/jpeg',
          sort_order: 1,
          created_at: '2026-09-20T10:00:00.000Z',
        },
      ],
    };
    const stockLot = {
      catalog_product_id: 'prod-1',
      remaining_quantity: 7,
      unit_cost: 15.5,
    };
    const productListing = {
      ...listing,
      id: 'listing-prod-1',
      inventory_item_id: null,
      catalog_product_id: 'prod-1',
      title: 'Mengenartikel Inserat',
    };

    const from = vi.fn((table: string) => {
      if (table === 'listings')
        return resolvedQuery(Promise.resolve({ data: [productListing], error: null }));
      if (table === 'inventory_items')
        return resolvedQuery(Promise.resolve({ data: [], error: null }));
      if (table === 'catalog_products')
        return resolvedQuery(Promise.resolve({ data: [catalogProduct], error: null }));
      if (table === 'stock_lots')
        return resolvedQuery(Promise.resolve({ data: [stockLot], error: null }));
      return resolvedQuery(Promise.resolve({ data: [], error: null }));
    });

    const { service } = setup({ from });

    await service.load('workspace-a');

    expect(service.items()).toHaveLength(1);
    const editorItem = service.items()[0];
    expect(editorItem?.id).toBe('prod-1');
    expect(editorItem?.targetKind).toBe('catalog_product');
    expect(editorItem?.availableQuantity).toBe(7);
    expect(editorItem?.allocatedPurchaseCost).toBe(15.5);
    expect(editorItem?.expectedValue).toBe(49.99);
    expect(editorItem?.priceSource).toBe('product');

    expect(service.rows()).toHaveLength(1);
    expect(service.rows()[0]?.listing.catalogProductId).toBe('prod-1');
    expect(service.rows()[0]?.listing.inventoryItemId).toBeNull();
    expect(service.rows()[0]?.primaryImagePath).toBe('catalog-products/workspace-a/prod-1/img.jpg');
  });

  it('prefers the recorded product price for linked items and never uses purchase cost as a sale price', async () => {
    const product = {
      id: 'prod-1',
      workspace_id: 'workspace-a',
      title: 'Kamera',
      listing_price: 89,
      archived_at: null,
      media: [],
    };
    const linkedItem = {
      ...item,
      expected_value: 72.45,
      purchase_line_id: 'line-1',
      purchase_line: { catalog_product_id: 'prod-1' },
    };
    const costOnlyItem = {
      ...item,
      id: 'item-without-sale-price',
      expected_value: null,
      allocated_purchase_cost: 17.35,
    };
    const from = vi.fn((table: string) => {
      const rows =
        table === 'inventory_items'
          ? [linkedItem, costOnlyItem]
          : table === 'catalog_products'
            ? [product]
            : [];
      return resolvedQuery(Promise.resolve({ data: rows, error: null }));
    });
    const { service } = setup({ from });

    await service.load('workspace-a');

    expect(service.items().find((entry) => entry.id === linkedItem.id)).toMatchObject({
      expectedValue: 89,
      priceSource: 'product',
    });
    expect(service.items().find((entry) => entry.id === costOnlyItem.id)).toMatchObject({
      expectedValue: null,
      priceSource: null,
      allocatedPurchaseCost: 17.35,
    });
  });

  it('marks an archived product and its linked item unavailable for new listings', async () => {
    const archivedAt = '2026-09-24T00:00:00Z';
    const product = {
      id: 'prod-1',
      workspace_id: 'workspace-a',
      title: 'Archiviert',
      archived_at: archivedAt,
      media: [],
    };
    const linkedItem = {
      ...item,
      purchase_line_id: 'line-1',
      purchase_line: { catalog_product_id: 'prod-1' },
    };
    const from = vi.fn((table: string) => {
      const rows =
        table === 'inventory_items' ? [linkedItem] : table === 'catalog_products' ? [product] : [];
      return resolvedQuery(Promise.resolve({ data: rows, error: null }));
    });
    const { service } = setup({ from });

    await service.load('workspace-a');

    expect(service.items().find((entry) => entry.id === item.id)?.archivedAt).toBe(archivedAt);
    expect(service.items().find((entry) => entry.id === product.id)?.archivedAt).toBe(archivedAt);
  });

  it('calls prepare_listing with p_catalog_product_id when target is a catalog product', async () => {
    const response = deferred<QueryResult<unknown>>();
    const { service, rpc } = setup({
      rpc: vi.fn(() => response.promise),
    });

    const action = service.prepare('prod-1', content, 'catalog_product');
    response.resolve({
      data: {
        ...listing,
        inventory_item_id: null,
        catalog_product_id: 'prod-1',
      },
      error: null,
    });

    await expect(action).resolves.toMatchObject({
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith('prepare_listing', {
      p_workspace_id: 'workspace-a',
      p_inventory_item_id: null,
      p_catalog_product_id: 'prod-1',
      p_content: {
        title: 'Neue Kamera',
        description: 'Neue Beschreibung',
        price: 30,
        priceType: 'NEGOTIABLE',
        shippingType: 'shipping',
        shippingPrice: 4.9,
        postalCode: '12345',
      },
    });
  });
});
