import { Injectable, inject } from '@angular/core';
import { CatalogService } from './catalog.service';
import { WorkspaceService } from './workspace.service';
import { normalizeGtin } from '../../shared/utils/gtin';

export interface BarcodeProductInfo {
  ean: string;
  title: string;
  brand?: string;
  model?: string;
  category?: string;
  estimatedPrice?: number;
}

@Injectable({
  providedIn: 'root',
})
export class BarcodeLookupService {
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
    const product = this.catalogService.products().find((entry) => entry.ean === normalized);
    if (!product) return null;
    return {
      ean: normalized,
      title: product.title,
      brand: product.brand ?? undefined,
      model: product.model ?? undefined,
      category: product.category ?? undefined,
    };
  }
}
