import { Injectable, inject, signal } from '@angular/core';
import { CatalogProduct, TrackingMode } from '../models/flipbase.models';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { createLocalDemoId } from '../utils/client-identity';
import { MutationResult } from '../models/mutation-result.model';

export type { MutationResult } from '../models/mutation-result.model';

export interface CreateCatalogProductInput {
  readonly workspaceId: string;
  readonly title: string;
  readonly trackingMode: TrackingMode;
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

  readonly products = signal<CatalogProduct[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal<Error | null>(null);
  readonly loadedWorkspaceId = signal<string | null>(null);
  private loadRequestId = 0;

  async loadProducts(workspaceId: string): Promise<void> {
    const requestId = ++this.loadRequestId;
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      if (this.mockStore.isDemoMode()) {
        if (requestId !== this.loadRequestId) return;
        this.products.set(this.mockStore.getCatalogProducts(workspaceId));
        this.loadedWorkspaceId.set(workspaceId);
        return;
      }

      const { data, error } = await this.supabase.client
        .from('catalog_products')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('title', { ascending: true });
      if (requestId !== this.loadRequestId) return;
      if (error) {
        this.loadError.set(this.syncStatus.melde('Laden der Artikelstammdaten', error));
        return;
      }
      this.products.set((data ?? []).map((product) => this.mapProduct(product)));
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
        tracking_mode: input.trackingMode,
        brand: input.brand?.trim() || null,
        model: input.model?.trim() || null,
        ean: input.ean?.trim() || null,
        category: input.category?.trim() || null,
        is_public_store: input.isPublicStore ?? false,
        listing_price: input.listingPrice ?? null,
      };
      this.mockStore.saveCatalogProduct(product);
      this.products.update((products) => [
        product,
        ...products.filter((entry) => entry.id !== product.id),
      ]);
      return { data: product, error: null, reportedBySyncStatus: false };
    }

    try {
      const { data, error } = await this.supabase.client
        .from('catalog_products')
        .insert({
          workspace_id: input.workspaceId,
          title: input.title.trim(),
          tracking_mode: input.trackingMode,
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
      this.products.update((products) => [
        product,
        ...products.filter((entry) => entry.id !== product.id),
      ]);
      return { data: product, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      return this.failure('Anlegen des Artikelstamms', error);
    }
  }

  private mapProduct(product: Record<string, unknown>): CatalogProduct {
    return product as unknown as CatalogProduct;
  }

  private failure<T>(operation: string, cause: unknown): MutationResult<T> {
    const error = this.syncStatus.melde(operation, cause);
    return { data: null, error, reportedBySyncStatus: this.syncStatus.istZentralGemeldet(error) };
  }
}
