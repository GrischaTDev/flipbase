import { Injectable, inject, signal } from '@angular/core';
import { CatalogProduct, ItemCondition } from '../models/flipbase.models';
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
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly media = inject(MediaService);

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
