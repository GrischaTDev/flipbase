import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VintedBrand } from '../models/vinted-brand.model';

@Injectable({ providedIn: 'root' })
export class VintedBrandSearchService {
  private readonly supabase = inject(SupabaseService);

  search(keyword: string, workspaceId?: string): Promise<VintedBrand[]> {
    return this.request({ keyword, ...(workspaceId === undefined ? {} : { workspaceId }) });
  }

  searchForFeed(keyword: string, workspaceId: string): Promise<VintedBrand[]> {
    return this.request({ keyword, workspaceId, purpose: 'feed' });
  }

  async resolveBrand(id: number, workspaceId: string): Promise<VintedBrand | null> {
    const { data, error } = await this.supabase.client.rpc('sniper_feed_import_brand', {
      p_workspace_id: workspaceId,
      p_brand_id: id,
    });
    if (error) throw new Error('Vinted-Marke konnte nicht geladen werden. Bitte erneut versuchen.');
    const name = data?.trim();
    return name ? { id, name } : null;
  }

  private async request(body: {
    keyword: string;
    workspaceId?: string;
    purpose?: 'feed';
  }): Promise<VintedBrand[]> {
    const { data, error } = await this.supabase.client.functions.invoke<{
      brands: VintedBrand[];
    }>('vinted-brand-search', {
      body,
    });
    if (error || !Array.isArray(data?.brands)) {
      throw new Error('Vinted-Marken konnten nicht geladen werden. Bitte erneut versuchen.');
    }
    return data.brands.filter(
      (brand) =>
        typeof brand === 'object' &&
        brand !== null &&
        Number.isSafeInteger(brand.id) &&
        brand.id > 0 &&
        typeof brand.name === 'string' &&
        brand.name.trim().length > 0,
    );
  }
}
