import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  parseVintedListingCatalogStatus,
  type VintedListingCatalogStatus,
} from '../models/vinted-listing-catalog-status';

/** Stand und Neu-Einlesen des lokalen Vinted-Katalogs; nur für die Plattform-Administration. */
@Injectable({ providedIn: 'root' })
export class VintedListingCatalogAdminService {
  private readonly database = inject(SupabaseService);

  async status(): Promise<VintedListingCatalogStatus> {
    const { data, error } = await this.database.client.rpc('vinted_listing_catalog_status');
    if (error) throw new Error('Der Stand des Vinted-Katalogs konnte nicht geladen werden.');
    return parseVintedListingCatalogStatus(data);
  }

  /** Der Worker liest beim nächsten Kontoabgleich alles vor diesem Zeitpunkt Gelesene neu. */
  async requestRefresh(): Promise<void> {
    const { error } = await this.database.client.rpc('request_vinted_listing_catalog_refresh');
    if (error) throw new Error('Das Neu-Einlesen konnte nicht angefordert werden.');
  }
}
