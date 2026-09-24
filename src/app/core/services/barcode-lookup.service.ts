import { Injectable, Injector, inject } from '@angular/core';
import { CatalogService } from './catalog.service';
import { InventoryService } from './inventory.service';
import { WorkspaceService } from './workspace.service';
import { canonicalGtin, normalizeGtin } from '../../shared/utils/gtin';

export interface BarcodeProductInfo {
  ean: string;
  title: string;
  brand?: string;
  model?: string;
  category?: string;
  estimatedPrice?: number;
  sourceUrl?: string;
  sourceName?: string;
}

interface OpenFactsResponse {
  readonly product?: {
    readonly code?: string;
    readonly product_name?: string;
    readonly brands?: string;
    readonly categories?: string;
    readonly product_type?: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class BarcodeLookupService {
  private readonly injector = inject(Injector);
  private readonly catalogService = inject(CatalogService);
  private readonly workspaceService = inject(WorkspaceService);

  /**
   * Looks up product details by EAN / Barcode.
   */
  async lookupByEan(ean: string): Promise<BarcodeProductInfo | null> {
    const normalized = normalizeGtin(ean);
    if (!normalized) return null;
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) return null;
    await this.catalogService.loadProducts(workspaceId);
    const product = this.catalogService
      .products()
      .find((entry) => canonicalGtin(entry.ean) === canonicalGtin(normalized));
    if (!product) return null;
    return {
      ean: normalized,
      title: product.title,
      brand: product.brand ?? undefined,
      model: product.model ?? undefined,
      category: product.category ?? undefined,
    };
  }

  async lookupInventoryByEan(ean: string): Promise<BarcodeProductInfo | null> {
    const normalized = normalizeGtin(ean);
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!normalized || !workspaceId) return null;
    const inventory = this.injector.get(InventoryService);
    if (!inventory.istGeladen()) await inventory.loadInventory(workspaceId);
    if (inventory.loadError()) throw new Error('Inventar konnte nicht geladen werden.');
    const item = inventory
      .items()
      .find(
        (entry) =>
          entry.workspace_id === workspaceId &&
          canonicalGtin(entry.ean) === canonicalGtin(normalized),
      );
    if (!item) return null;
    return {
      ean: normalized,
      title: item.title,
      brand: item.brand ?? undefined,
      model: item.model ?? undefined,
      category: item.category ?? undefined,
      sourceName: 'Inventar',
      sourceUrl: `/inventory/${item.id}`,
    };
  }

  async lookupExternalByEan(ean: string): Promise<BarcodeProductInfo | null> {
    const normalized = normalizeGtin(ean);
    if (!normalized) return null;
    const url = new URL(`https://world.openfoodfacts.org/api/v3/product/${normalized}.json`);
    url.searchParams.set('product_type', 'all');
    url.searchParams.set('lc', 'de');
    url.searchParams.set('fields', 'code,product_name,brands,categories,product_type');
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Die Online-Produktsuche ist gerade nicht erreichbar.');
    const result = (await response.json()) as OpenFactsResponse;
    const product = result.product;
    if (!product?.product_name?.trim() || canonicalGtin(product.code) !== canonicalGtin(normalized))
      return null;
    const sources: Record<string, { domain: string; name: string }> = {
      food: { domain: 'world.openfoodfacts.org', name: 'Open Food Facts' },
      beauty: { domain: 'world.openbeautyfacts.org', name: 'Open Beauty Facts' },
      petfood: { domain: 'world.openpetfoodfacts.org', name: 'Open Pet Food Facts' },
      product: { domain: 'world.openproductsfacts.org', name: 'Open Products Facts' },
    };
    const source = sources[product.product_type ?? 'food'] ?? sources['food'];
    return {
      ean: normalized,
      title: product.product_name.trim(),
      brand: product.brands?.split(',')[0]?.trim() || undefined,
      category: product.categories?.split(',')[0]?.trim() || undefined,
      sourceUrl: `https://${source.domain}/product/${normalized}`,
      sourceName: source.name,
    };
  }
}
