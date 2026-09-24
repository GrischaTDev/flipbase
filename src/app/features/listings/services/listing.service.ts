import { Injectable, inject, signal } from '@angular/core';
import type { ItemMedia } from '../../../core/models/flipbase.models';
import type { Tables } from '../../../core/models/supabase.types';
import { MediaService } from '../../../core/services/media.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type {
  KleinanzeigenListingPayload,
  Listing,
  ListingActionResult,
  ListingContent,
  ListingEditorItem,
  ListingPayloadResult,
  ListingRow,
} from '../models/listing.models';

interface ListingDatabaseRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly inventory_item_id: string | null;
  readonly catalog_product_id: string | null;
  readonly platform: string;
  readonly status: string;
  readonly end_reason: string | null;
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly price_type: string;
  readonly shipping_type: string;
  readonly shipping_price: number | null;
  readonly postal_code: string | null;
  readonly listed_count: number;
  readonly last_listed_at: string | null;
  readonly online_since: string | null;
  readonly ended_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}
type InventoryDatabaseRow = Tables<'inventory_items'> & {
  readonly condition_notes?: string | null;
  readonly media?: readonly ItemMediaDatabaseRow[] | null;
  readonly purchase_line?: { readonly catalog_product_id: string | null } | null;
};
type ItemMediaDatabaseRow = Tables<'item_media'> & { readonly sort_order?: number | null };

type CatalogProductDatabaseRow = Tables<'catalog_products'> & {
  readonly media?: readonly CatalogProductMediaDatabaseRow[] | null;
  readonly catalog_product_media?: readonly CatalogProductMediaDatabaseRow[] | null;
};
interface CatalogProductMediaDatabaseRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly catalog_product_id: string;
  readonly storage_path: string;
  readonly is_primary: boolean | null;
  readonly file_name?: string | null;
  readonly file_size?: number | null;
  readonly mime_type?: string | null;
  readonly sort_order?: number | null;
  readonly created_at: string;
}
interface StockLotDatabaseRow {
  readonly catalog_product_id: string;
  readonly remaining_quantity: number;
  readonly unit_cost: number | null;
}

interface QueryError {
  readonly message: string;
}

interface QueryResult<T> {
  readonly data: T | null;
  readonly error: QueryError | null;
}

interface CollectionQuery<T> extends PromiseLike<QueryResult<T>> {
  select(columns: string): CollectionQuery<T>;
  eq(column: string, value: string): CollectionQuery<T>;
  order(column: string, options: { readonly ascending: boolean }): CollectionQuery<T>;
}

interface UpdateQuery extends PromiseLike<QueryResult<ListingDatabaseRow | null>> {
  eq(column: string, value: string): UpdateQuery;
  select(columns: string): UpdateQuery;
  single(): Promise<QueryResult<ListingDatabaseRow>>;
}

interface ListingDatabaseClient {
  from(table: 'listings'): {
    select(columns: string): CollectionQuery<readonly ListingDatabaseRow[]>;
    update(values: ListingContentUpdate): UpdateQuery;
  };
  from(table: 'inventory_items'): {
    select(columns: string): CollectionQuery<readonly InventoryDatabaseRow[]>;
  };
  from(table: 'catalog_products'): {
    select(columns: string): CollectionQuery<readonly CatalogProductDatabaseRow[]>;
  };
  from(table: 'stock_lots'): {
    select(columns: string): CollectionQuery<readonly StockLotDatabaseRow[]>;
  };
  rpc(
    name: 'prepare_listing',
    parameters: {
      readonly p_workspace_id: string;
      readonly p_inventory_item_id: string | null;
      readonly p_catalog_product_id: string | null;
      readonly p_content: unknown;
    },
  ): Promise<QueryResult<ListingDatabaseRow>>;
  rpc(
    name: 'set_listing_online' | 'end_listing',
    parameters: { readonly p_workspace_id: string; readonly p_listing_id: string },
  ): Promise<QueryResult<ListingDatabaseRow>>;
}

interface ListingContentUpdate {
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly price_type: ListingContent['priceType'];
  readonly shipping_type: ListingContent['shippingType'];
  readonly shipping_price: number | null;
  readonly postal_code: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class ListingService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly mediaService = inject(MediaService);
  private loadGeneration = 0;

  readonly rows = signal<readonly ListingRow[]>([]);
  readonly items = signal<readonly ListingEditorItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly loadedWorkspaceId = signal<string | null>(null);

  private get client(): ListingDatabaseClient {
    return this.supabase.client as unknown as ListingDatabaseClient;
  }

  async load(workspaceId: string): Promise<void> {
    if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;

    const generation = ++this.loadGeneration;
    this.rows.set([]);
    this.items.set([]);
    this.error.set(null);
    this.loading.set(true);
    this.loadedWorkspaceId.set(null);

    try {
      const [listingsResult, itemsResult, productsResult, stockLotsResult] = await Promise.all([
        this.client
          .from('listings')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('updated_at', { ascending: false }),
        this.client
          .from('inventory_items')
          .select(
            '*, media:item_media(*), purchase_line:purchase_lines!inventory_items_workspace_purchase_line_fkey(catalog_product_id)',
          )
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false }),
        this.client
          .from('catalog_products')
          .select('*, media:catalog_product_media(*)')
          .eq('workspace_id', workspaceId)
          .order('title', { ascending: true }),
        this.client
          .from('stock_lots')
          .select('catalog_product_id, remaining_quantity, unit_cost')
          .eq('workspace_id', workspaceId),
      ]);

      if (!this.isCurrentLoad(generation, workspaceId)) return;

      if (
        listingsResult.error ||
        itemsResult.error ||
        productsResult.error ||
        stockLotsResult.error
      ) {
        this.error.set(
          (
            listingsResult.error ??
            itemsResult.error ??
            productsResult.error ??
            stockLotsResult.error
          )?.message ?? 'Inserate konnten nicht geladen werden.',
        );
        return;
      }

      const stockByProductId = new Map<
        string,
        { totalQuantity: number; oldestUnitCost: number | null }
      >();
      for (const lot of stockLotsResult.data ?? []) {
        if (!lot.catalog_product_id || lot.remaining_quantity <= 0) continue;
        const current = stockByProductId.get(lot.catalog_product_id) ?? {
          totalQuantity: 0,
          oldestUnitCost: null,
        };
        stockByProductId.set(lot.catalog_product_id, {
          totalQuantity: current.totalQuantity + Number(lot.remaining_quantity || 0),
          oldestUnitCost:
            current.oldestUnitCost ??
            (lot.unit_cost !== null && lot.unit_cost !== undefined ? Number(lot.unit_cost) : null),
        });
      }

      const productsById = new Map(
        (productsResult.data ?? []).map((product) => [product.id, product]),
      );
      const inventoryEditorItems = (itemsResult.data ?? []).map((item) =>
        this.mapEditorItem(item, productsById),
      );
      const catalogEditorItems = (productsResult.data ?? []).map((product) =>
        this.mapCatalogEditorItem(product, stockByProductId.get(product.id)),
      );
      const editorItems = [...inventoryEditorItems, ...catalogEditorItems];
      const itemsById = new Map(editorItems.map((item) => [item.id, item]));
      this.items.set(editorItems);
      this.rows.set(
        (listingsResult.data ?? [])
          .map((listing) => {
            const targetId = listing.inventory_item_id ?? listing.catalog_product_id;
            const item = targetId ? itemsById.get(targetId) : null;
            return item ? this.mapRow(listing, item) : null;
          })
          .filter((row): row is ListingRow => row !== null),
      );
      this.loadedWorkspaceId.set(workspaceId);
    } catch (error: unknown) {
      if (this.isCurrentLoad(generation, workspaceId)) {
        this.error.set(this.toError(error).message);
      }
    } finally {
      if (this.isCurrentLoad(generation, workspaceId)) this.loading.set(false);
    }
  }

  async prepare(
    itemId: string,
    content: ListingContent,
    targetKind?: 'inventory_item' | 'catalog_product',
  ): Promise<ListingActionResult> {
    const workspaceId = this.activeWorkspaceId();
    if (!workspaceId) return this.noWorkspaceResult();

    const resolvedKind =
      targetKind ?? this.items().find((item) => item.id === itemId)?.targetKind ?? 'inventory_item';

    try {
      const { data, error } = await this.client.rpc('prepare_listing', {
        p_workspace_id: workspaceId,
        p_inventory_item_id: resolvedKind === 'inventory_item' ? itemId : null,
        p_catalog_product_id: resolvedKind === 'catalog_product' ? itemId : null,
        p_content: this.toRpcContent(content),
      });
      return await this.finishMutation(workspaceId, data, error);
    } catch (error: unknown) {
      return { data: null, error: this.toError(error) };
    }
  }

  async updateContent(listingId: string, content: ListingContent): Promise<ListingActionResult> {
    const workspaceId = this.activeWorkspaceId();
    if (!workspaceId) return this.noWorkspaceResult();

    try {
      const { data, error } = await this.client
        .from('listings')
        .update(this.toContentUpdate(content))
        .eq('workspace_id', workspaceId)
        .eq('id', listingId)
        .select('*')
        .single();
      return await this.finishMutation(workspaceId, data, error);
    } catch (error: unknown) {
      return { data: null, error: this.toError(error) };
    }
  }

  async setOnline(listingId: string): Promise<ListingActionResult> {
    return this.runLifecycleAction('set_listing_online', listingId);
  }

  async end(listingId: string): Promise<ListingActionResult> {
    return this.runLifecycleAction('end_listing', listingId);
  }

  getById(listingId: string): ListingRow | null {
    return this.rows().find((row) => row.listing.id === listingId) ?? null;
  }

  async buildExtensionPayload(row: ListingRow): Promise<ListingPayloadResult> {
    const orderedMedia = [...row.item.media].sort(
      (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
    );
    const urls = await this.mediaService.resolveMediaUrls(
      orderedMedia.map((medium) => medium.storage_path),
    );
    const missingImages = orderedMedia
      .filter((medium) => !urls[medium.storage_path])
      .map((medium) => medium.file_name ?? this.fileNameFromPath(medium.storage_path));
    const payload: KleinanzeigenListingPayload = {
      itemId: row.item.id,
      title: row.listing.content.title,
      description: row.listing.content.description,
      price: row.listing.content.price,
      priceType: row.listing.content.priceType,
      postalCode: row.listing.content.postalCode ?? undefined,
      shippingType: row.listing.content.shippingType,
      shippingPrice: row.listing.content.shippingPrice ?? undefined,
      images: orderedMedia.flatMap((medium) => {
        const url = urls[medium.storage_path];
        return url
          ? [{ url, name: medium.file_name ?? this.fileNameFromPath(medium.storage_path) }]
          : [];
      }),
    };

    return { payload, missingImages };
  }

  clear(): void {
    this.loadGeneration += 1;
    this.rows.set([]);
    this.items.set([]);
    this.loading.set(false);
    this.error.set(null);
    this.loadedWorkspaceId.set(null);
  }

  private async runLifecycleAction(
    name: 'set_listing_online' | 'end_listing',
    listingId: string,
  ): Promise<ListingActionResult> {
    const workspaceId = this.activeWorkspaceId();
    if (!workspaceId) return this.noWorkspaceResult();

    try {
      const { data, error } = await this.client.rpc(name, {
        p_workspace_id: workspaceId,
        p_listing_id: listingId,
      });
      return await this.finishMutation(workspaceId, data, error);
    } catch (error: unknown) {
      return { data: null, error: this.toError(error) };
    }
  }

  private async finishMutation(
    workspaceId: string,
    data: ListingDatabaseRow | null,
    error: QueryError | null,
  ): Promise<ListingActionResult> {
    if (error) return { data: null, error: this.toError(error) };
    if (!data) return { data: null, error: new Error('Das Inserat wurde nicht gefunden.') };

    if (this.activeWorkspaceId() === workspaceId) await this.load(workspaceId);
    return { data: this.mapListing(data), error: null };
  }

  private activeWorkspaceId(): string | null {
    return this.workspaceService.currentWorkspace()?.id ?? null;
  }

  private isCurrentLoad(generation: number, workspaceId: string): boolean {
    return generation === this.loadGeneration && this.activeWorkspaceId() === workspaceId;
  }

  private noWorkspaceResult(): ListingActionResult {
    return { data: null, error: new Error('Es ist kein Workspace ausgewählt.') };
  }

  private toRpcContent(content: ListingContent): Record<string, string | number | null> {
    return {
      title: content.title,
      description: content.description,
      price: content.price,
      priceType: content.priceType,
      shippingType: content.shippingType,
      shippingPrice: content.shippingPrice,
      postalCode: content.postalCode,
    };
  }

  private toContentUpdate(content: ListingContent): ListingContentUpdate {
    return {
      title: content.title,
      description: content.description,
      price: content.price,
      price_type: content.priceType,
      shipping_type: content.shippingType,
      shipping_price: content.shippingPrice,
      postal_code: content.postalCode,
    };
  }

  private mapRow(listing: ListingDatabaseRow, item: ListingEditorItem): ListingRow {
    return {
      listing: this.mapListing(listing),
      item,
      primaryImagePath:
        item.media.find((medium) => medium.is_primary)?.storage_path ??
        item.media[0]?.storage_path ??
        null,
    };
  }

  private mapListing(row: ListingDatabaseRow): Listing {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      inventoryItemId: row.inventory_item_id ?? null,
      catalogProductId: row.catalog_product_id ?? null,
      platform: 'kleinanzeigen',
      status: row.status as Listing['status'],
      endReason: row.end_reason as Listing['endReason'],
      content: {
        title: row.title,
        description: row.description,
        price: row.price,
        priceType: row.price_type as ListingContent['priceType'],
        shippingType: row.shipping_type as ListingContent['shippingType'],
        shippingPrice: row.shipping_price,
        postalCode: row.postal_code,
      },
      listedCount: row.listed_count,
      lastListedAt: row.last_listed_at,
      onlineSince: row.online_since,
      endedAt: row.ended_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapEditorItem(
    row: InventoryDatabaseRow,
    productsById: ReadonlyMap<string, CatalogProductDatabaseRow>,
  ): ListingEditorItem {
    const productId = row.purchase_line?.catalog_product_id;
    const parentArchivedAt = row.purchase_line_id
      ? productId === null
        ? null
        : (productId && productsById.get(productId)?.archived_at) || 'unbekannter-stammartikel'
      : null;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      targetKind: 'inventory_item',
      title: row.title,
      brand: row.brand,
      category: row.category,
      condition: row.condition as ListingEditorItem['condition'],
      conditionNotes: row.condition_notes ?? null,
      description: row.description,
      status: row.status as ListingEditorItem['status'],
      archivedAt: row.archived_at ?? parentArchivedAt,
      expectedValue: row.expected_value,
      allocatedPurchaseCost: row.allocated_purchase_cost,
      media: (row.media ?? []).map((medium) => this.mapMedia(medium)),
    };
  }

  private mapCatalogEditorItem(
    row: CatalogProductDatabaseRow,
    stock?: { totalQuantity: number; oldestUnitCost: number | null },
  ): ListingEditorItem {
    const rawMedia = row.media ?? row.catalog_product_media ?? [];
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      targetKind: 'catalog_product',
      availableQuantity: stock?.totalQuantity ?? 0,
      title: row.title,
      brand: row.brand ?? null,
      category: row.category ?? null,
      condition: (row.condition as ListingEditorItem['condition']) ?? 'like_new',
      conditionNotes: row.condition_notes ?? null,
      description: row.description ?? null,
      status: (stock?.totalQuantity ?? 0) > 0 ? 'ready' : 'sold',
      archivedAt: row.archived_at ?? null,
      expectedValue: row.listing_price ?? null,
      allocatedPurchaseCost: stock?.oldestUnitCost ?? null,
      media: rawMedia.map((medium) => this.mapCatalogMedia(medium, row.id)),
    };
  }

  private mapCatalogMedia(row: CatalogProductMediaDatabaseRow, productId: string): ItemMedia {
    return {
      id: row.id,
      inventory_item_id: productId,
      storage_path: row.storage_path,
      is_primary: Boolean(row.is_primary),
      file_name: row.file_name ?? null,
      file_size: row.file_size ?? null,
      mime_type: row.mime_type ?? null,
      sort_order: row.sort_order ?? undefined,
      created_at: row.created_at,
    };
  }

  private mapMedia(row: ItemMediaDatabaseRow): ItemMedia {
    return {
      id: row.id,
      inventory_item_id: row.inventory_item_id,
      storage_path: row.storage_path,
      is_primary: row.is_primary,
      file_name: row.file_name,
      file_size: row.file_size,
      mime_type: row.mime_type,
      sort_order: row.sort_order ?? undefined,
      created_at: row.created_at,
    };
  }

  private fileNameFromPath(path: string): string {
    return path.split('/').filter(Boolean).at(-1) ?? path;
  }

  private toError(error: QueryError | unknown): Error {
    return error instanceof Error
      ? error
      : new Error(
          typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string'
            ? error.message
            : 'Die Inseratsaktion ist fehlgeschlagen.',
        );
  }
}
