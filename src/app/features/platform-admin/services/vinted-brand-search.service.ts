import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedBrand } from '../models/vinted-brand.model';

@Injectable({ providedIn: 'root' })
export class VintedBrandSearchService {
  private readonly supabase = inject(SupabaseService);

  async search(keyword: string, workspaceId?: string): Promise<VintedBrand[]> {
    const { data, error } = await this.supabase.client.functions.invoke<{
      brands: VintedBrand[];
    }>('vinted-brand-search', {
      body: { keyword, ...(workspaceId === undefined ? {} : { workspaceId }) },
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
