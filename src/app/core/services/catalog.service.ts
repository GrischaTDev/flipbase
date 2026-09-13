import { Injectable, inject, signal } from '@angular/core';
import {
  CatalogProduct,
  InventoryItem,
  ItemCondition,
  Purchase,
  PurchaseLine,
} from '../models/flipbase.models';
import { WorkspaceService } from './workspace.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { createLocalDemoId } from '../utils/client-identity';
import { MutationResult } from '../models/mutation-result.model';
import { MediaService } from './media.service';

export type { MutationResult } from '../models/mutation-result.model';

export interface CreateCatalogProductInput {
  readonly workspaceId: string;
  readonly title: string;
  readonly condition?: ItemCondition | null;
  readonly conditionNotes?: string | null;
  readonly brand?: string | null;
  readonly model?: string | null;
  readonly ean?: string | null;
  readonly category?: string | null;
  readonly isPublicStore?: boolean;
  readonly listingPrice?: number | null;
  readonly description?: string | null;
}

export type UpdateCatalogProductInput = Pick<CreateCatalogProductInput, 'workspaceId'> &
  Partial<Omit<CreateCatalogProductInput, 'workspaceId'>>;

export interface CatalogProductEntry extends PurchaseLine {
  readonly inventory_items: InventoryItem[];
  readonly purchase: Pick<Purchase, 'id' | 'title'> | null;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly media = inject(MediaService);
  private readonly workspace = inject(WorkspaceService);

  imageUrls(): Readonly<Record<string, string>> {
    return Object.fromEntries(
      this.products().flatMap((product) =>
        product.primary_media_path
          ? [[product.id, this.media.getMediaUrl(product.primary_media_path)]]
          : [],
      ),
    );
  }

  invalidateProductImage(productId: string): void {
    const path = this.products().find((product) => product.id === productId)?.primary_media_path;
    if (path) this.media.reportMediaFailure(path);
  }

  readonly products = signal<CatalogProduct[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal<Error | null>(null);
  readonly loadedWorkspaceId = signal<string | null>(null);
  private loadRequestId = 0;
  private requestedWorkspaceId: string | null = null;

  async loadProducts(workspaceId: string): Promise<void> {
    const requestId = ++this.loadRequestId;
    this.requestedWorkspaceId = workspaceId;
    if (this.loadedWorkspaceId() !== workspaceId) {
      this.products.set([]);
      this.loadedWorkspaceId.set(null);
    }
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      if (this.mockStore.isDemoMode()) {
        if (requestId !== this.loadRequestId) return;
        const media = this.mockStore.getCatalogProductMedia();
        this.products.set(
          this.mockStore.getCatalogProducts(workspaceId).map((product) => ({
            ...product,
            primary_media_path:
              media.find((entry) => entry.catalog_product_id === product.id)?.storage_path ?? null,
          })),
        );
        this.loadedWorkspaceId.set(workspaceId);
        return;
      }

      const { data, error } = await this.supabase.client
        .from('catalog_products')
        .select('*, catalog_product_media(storage_path, is_primary, sort_order, created_at, id)')
        .eq('workspace_id', workspaceId)
        .order('title', { ascending: true });
      if (requestId !== this.loadRequestId) return;
      if (error) {
        this.loadError.set(this.syncStatus.melde('Laden der Artikelstammdaten', error));
        return;
      }
      this.products.set(
        (data ?? []).map((product) => {
          const media = [...(product.catalog_product_media ?? [])].sort(
            (left, right) =>
              Number(right.is_primary) - Number(left.is_primary) ||
              left.sort_order - right.sort_order ||
              left.created_at.localeCompare(right.created_at) ||
              left.id.localeCompare(right.id),
          );
          return {
            ...this.mapProduct(product),
            primary_media_path: media[0]?.storage_path ?? null,
          };
        }),
      );
      this.loadedWorkspaceId.set(workspaceId);
    } catch (error: unknown) {
      if (requestId !== this.loadRequestId) return;
      this.loadError.set(this.syncStatus.melde('Laden der Artikelstammdaten', error));
    } finally {
      if (requestId === this.loadRequestId) this.isLoading.set(false);
    }
  }

  async loadProduct(
    productId: string,
    workspaceId: string,
  ): Promise<MutationResult<CatalogProduct>> {
    try {
      if (this.workspace.currentWorkspace()?.id !== workspaceId)
        throw new Error('Der Workspace wurde gewechselt.');
      if (this.mockStore.isDemoMode()) {
        const product = this.mockStore
          .getCatalogProducts(workspaceId)
          .find((entry) => entry.id === productId && entry.workspace_id === workspaceId);
        return { data: product ?? null, error: null, reportedBySyncStatus: false };
      }
      const { data, error } = await this.supabase.client
        .from('catalog_products')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('id', productId)
        .maybeSingle();
      if (error) throw error;
      return {
        data: data ? this.mapProduct(data) : null,
        error: null,
        reportedBySyncStatus: false,
      };
    } catch (error: unknown) {
      return this.failure('Laden des Artikels', error);
    }
  }

  async createProduct(input: CreateCatalogProductInput): Promise<MutationResult<CatalogProduct>> {
    if (this.mockStore.isDemoMode()) {
      const product: CatalogProduct = {
        id: createLocalDemoId('catalog'),
        workspace_id: input.workspaceId,
        title: input.title.trim(),
        tracking_mode: 'quantity',
        condition: input.condition ?? null,
        condition_notes: input.conditionNotes?.trim() || null,
        brand: input.brand?.trim() || null,
        model: input.model?.trim() || null,
        ean: input.ean?.trim() || null,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        is_public_store: input.isPublicStore ?? false,
        listing_price: input.listingPrice ?? null,
      };
      this.mockStore.saveCatalogProduct(product);
      this.includeCreatedProduct(product);
      return { data: product, error: null, reportedBySyncStatus: false };
    }

    try {
      const { data, error } = await this.supabase.client
        .from('catalog_products')
        .insert({
          workspace_id: input.workspaceId,
          title: input.title.trim(),
          tracking_mode: 'quantity',
          condition: input.condition ?? null,
          condition_notes: input.conditionNotes?.trim() || null,
          brand: input.brand?.trim() || null,
          model: input.model?.trim() || null,
          ean: input.ean?.trim() || null,
          category: input.category?.trim() || null,
          description: input.description?.trim() || null,
          is_public_store: input.isPublicStore ?? false,
          listing_price: input.listingPrice ?? null,
        })
        .select()
        .single();
      if (error || !data) {
        return this.failure(
          'Anlegen des Artikelstamms',
          error ?? new Error('Der Artikel wurde nicht zurückgegeben.'),
        );
      }
      const product = this.mapProduct(data);
      this.includeCreatedProduct(product);
      return { data: product, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      return this.failure('Anlegen des Artikelstamms', error);
    }
  }

  async updateProduct(
    productId: string,
    input: UpdateCatalogProductInput,
  ): Promise<MutationResult<CatalogProduct>> {
    try {
      if (this.workspace.currentWorkspace()?.id !== input.workspaceId)
        throw new Error('Der Workspace wurde gewechselt. Bitte den Artikel erneut öffnen.');
      const patch: Partial<Omit<CatalogProduct, 'primary_media_path'>> = {};
      if (input.title !== undefined) {
        if (!input.title.trim()) throw new Error('Bitte einen Namen eingeben.');
        patch.title = input.title.trim();
      }
      if (input.brand !== undefined) patch.brand = input.brand?.trim() || null;
      if (input.model !== undefined) patch.model = input.model?.trim() || null;
      if (input.ean !== undefined) patch.ean = input.ean?.trim() || null;
      if (input.category !== undefined) patch.category = input.category?.trim() || null;
      if (input.description !== undefined) patch.description = input.description?.trim() || null;
      if (input.condition !== undefined) patch.condition = input.condition;
      if (input.conditionNotes !== undefined)
        patch.condition_notes = input.conditionNotes?.trim() || null;
      if (input.isPublicStore !== undefined) patch.is_public_store = input.isPublicStore;
      if (input.listingPrice !== undefined) {
        if (
          input.listingPrice !== null &&
          (!Number.isFinite(input.listingPrice) || input.listingPrice <= 0)
        )
          throw new Error('Bitte einen positiven Shoppreis eingeben.');
        patch.listing_price = input.listingPrice;
      }
      let product: CatalogProduct;
      if (this.mockStore.isDemoMode()) {
        const existing = this.mockStore
          .getCatalogProducts(input.workspaceId)
          .find((entry) => entry.id === productId && entry.workspace_id === input.workspaceId);
        if (!existing) throw new Error('Artikel wurde nicht gefunden oder ist nicht zugänglich.');
        product = { ...existing, ...patch };
        this.mockStore.saveCatalogProduct(product);
      } else {
        const { data, error } = await this.supabase.client
          .from('catalog_products')
          .update(patch)
          .eq('id', productId)
          .eq('workspace_id', input.workspaceId)
          .select()
          .single();
        if (error || !data)
          throw error ?? new Error('Artikel wurde nicht gefunden oder ist nicht zugänglich.');
        product = this.mapProduct(data);
      }
      if (
        this.workspace.currentWorkspace()?.id === input.workspaceId &&
        (!this.requestedWorkspaceId || this.requestedWorkspaceId === input.workspaceId)
      ) {
        this.products.update((products) =>
          products.map((entry) =>
            entry.id === productId && entry.workspace_id === input.workspaceId
              ? { ...entry, ...product }
              : entry,
          ),
        );
      }
      return { data: product, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      return this.failure('Speichern des Artikels', error);
    }
  }

  async loadProductEntries(
    productId: string,
    workspaceId: string,
  ): Promise<MutationResult<CatalogProductEntry[]>> {
    try {
      if (this.workspace.currentWorkspace()?.id !== workspaceId)
        throw new Error('Der Workspace wurde gewechselt.');
      if (this.mockStore.isDemoMode()) {
        const items = this.mockStore.getItems();
        const purchases = this.mockStore.getPurchases();
        return {
          data: this.mockStore
            .getPurchaseLines(workspaceId)
            .filter(
              (line) => line.catalog_product_id === productId && line.workspace_id === workspaceId,
            )
            .map((line) => ({
              ...line,
              inventory_items: items.filter(
                (item) => item.purchase_line_id === line.id && item.workspace_id === workspaceId,
              ),
              purchase:
                purchases.find(
                  (purchase) =>
                    purchase.id === line.purchase_id && purchase.workspace_id === workspaceId,
                ) ?? null,
            })),
          error: null,
          reportedBySyncStatus: false,
        };
      }
      const { data, error } = await this.supabase.client
        .from('purchase_lines')
        .select(
          '*, inventory_items!inventory_items_purchase_line_id_fkey(*), purchase:purchases!purchase_lines_purchase_id_fkey(id, title)',
        )
        .eq('workspace_id', workspaceId)
        .eq('catalog_product_id', productId)
        .order('created_at');
      if (error) throw error;
      const entries = (data ?? []) as CatalogProductEntry[];
      const itemIds = entries.flatMap((line) =>
        line.inventory_items
          .filter((item) => item.workspace_id === workspaceId && item.purchase_line_id === line.id)
          .map((item) => item.id),
      );
      if (!itemIds.length)
        return {
          data: entries.map((line) => ({ ...line, inventory_items: [] })),
          error: null,
          reportedBySyncStatus: false,
        };
      const states = await this.supabase.client
        .from('inventory_item_sale_states')
        .select('inventory_item_id, workspace_id, sale_state, active_sale_count, active_sale_id')
        .eq('workspace_id', workspaceId)
        .in('inventory_item_id', itemIds);
      if (states.error) throw states.error;
      const stateByItem = new Map(
        (states.data ?? []).map((state) => [state.inventory_item_id, state]),
      );
      return {
        data: entries.map((line) => ({
          ...line,
          inventory_items: line.inventory_items
            .filter(
              (item) => item.workspace_id === workspaceId && item.purchase_line_id === line.id,
            )
            .map((item) => {
              const state = stateByItem.get(item.id);
              return {
                ...item,
                sale_state: state?.sale_state as InventoryItem['sale_state'],
                active_sale_count: state?.active_sale_count ?? undefined,
                active_sale_id: state?.active_sale_id ?? null,
              };
            }),
        })),
        error: null,
        reportedBySyncStatus: false,
      };
    } catch (error: unknown) {
      return this.failure('Laden der Einkaufsherkunft', error);
    }
  }

  private includeCreatedProduct(product: CatalogProduct): void {
    if (this.requestedWorkspaceId && this.requestedWorkspaceId !== product.workspace_id) return;
    this.products.update((products) => [
      product,
      ...products.filter((entry) => entry.id !== product.id),
    ]);
  }

  private mapProduct(product: Record<string, unknown>): CatalogProduct {
    return product as unknown as CatalogProduct;
  }

  private failure<T>(operation: string, cause: unknown): MutationResult<T> {
    const error = this.syncStatus.melde(operation, cause);
    return { data: null, error, reportedBySyncStatus: this.syncStatus.istZentralGemeldet(error) };
  }
}
