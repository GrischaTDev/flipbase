import { Injectable, inject, signal } from '@angular/core';
import {
  CatalogProduct,
  InventoryItem,
  ItemCondition,
  Purchase,
  PurchaseLine,
} from '../models/flipbase.models';
import { WorkspaceService } from './workspace.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { MutationResult } from '../models/mutation-result.model';
import { normalizeProductHandle } from '../utils/product-seo';
import { MediaService } from './media.service';
import type { TablesInsert } from '../models/supabase.types';

export type { MutationResult } from '../models/mutation-result.model';

export interface CreateCatalogProductInput {
  readonly workspaceId: string;
  readonly title: string;
  readonly condition?: ItemCondition | null;
  readonly conditionNotes?: string | null;
  /** Verweis auf eine Marke; den Anzeigetext setzt der Trigger. */
  readonly brandId?: string | null;
  readonly brand?: string | null;
  readonly model?: string | null;
  readonly ean?: string | null;
  /** Verweis auf eine Produktkategorie; den Anzeigetext setzt der Trigger. */
  readonly categoryId?: string | null;
  /** Legacy-Freitext für bestehende Importwege. */
  readonly category?: string | null;
  readonly isPublicStore?: boolean;
  readonly listingPrice?: number | null;
  readonly description?: string | null;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
  readonly urlHandle?: string | null;
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

  updateProductPrimaryMedia(
    productId: string,
    workspaceId: string,
    primaryMediaPath: string | null,
  ): void {
    if (this.workspace.currentWorkspace()?.id !== workspaceId) return;
    this.products.update((products) =>
      products.map((product) =>
        product.id === productId && product.workspace_id === workspaceId
          ? { ...product, primary_media_path: primaryMediaPath }
          : product,
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
    if (this.workspace && this.workspace.currentWorkspace()?.id !== input.workspaceId)
      return this.failure('Anlegen des Artikels', new Error('Der Workspace wurde gewechselt.'));

    try {
      const insertPayload: TablesInsert<'catalog_products'> = {
        workspace_id: input.workspaceId,
        title: input.title.trim(),
        tracking_mode: 'quantity',
        condition: input.condition ?? null,
        condition_notes: input.conditionNotes?.trim() || null,
        brand_id: input.brandId ?? null,
        model: input.model?.trim() || null,
        ean: input.ean?.trim() || null,
        category_id: input.categoryId ?? null,
        description: input.description?.trim() || null,
        seo_title: input.seoTitle?.trim() || null,
        seo_description: input.seoDescription?.trim() || null,
        url_handle: normalizeProductHandle(input.urlHandle?.trim() || input.title) || null,
        is_public_store: input.isPublicStore ?? false,
        listing_price: input.listingPrice ?? null,
        ...(input.brandId === undefined ? { brand: input.brand?.trim() || null } : {}),
        ...(input.categoryId === undefined ? { category: input.category?.trim() || null } : {}),
      };

      const { data, error } = await this.supabase.client
        .from('catalog_products')
        .insert(insertPayload)
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
      if (input.brandId !== undefined) patch.brand_id = input.brandId;
      else if (input.brand !== undefined) patch.brand = input.brand?.trim() || null;
      if (input.model !== undefined) patch.model = input.model?.trim() || null;
      if (input.ean !== undefined) patch.ean = input.ean?.trim() || null;
      if (input.categoryId !== undefined) patch.category_id = input.categoryId;
      else if (input.category !== undefined) patch.category = input.category?.trim() || null;
      if (input.description !== undefined) patch.description = input.description?.trim() || null;
      if (input.seoTitle !== undefined) patch.seo_title = input.seoTitle?.trim() || null;
      if (input.seoDescription !== undefined)
        patch.seo_description = input.seoDescription?.trim() || null;
      if (input.urlHandle !== undefined)
        patch.url_handle = normalizeProductHandle(input.urlHandle ?? '') || null;
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
      const { data, error } = await this.supabase.client
        .from('catalog_products')
        .update(patch)
        .eq('id', productId)
        .eq('workspace_id', input.workspaceId)
        .select()
        .single();
      if (error || !data)
        throw error ?? new Error('Artikel wurde nicht gefunden oder ist nicht zugänglich.');
      const product = this.mapProduct(data);
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
    if (this.workspace && this.workspace.currentWorkspace()?.id !== product.workspace_id) return;
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
