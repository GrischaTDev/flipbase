import type { VintedListingEditFields } from '../services/marketplace-browser-test-api.service';

/** Eine Browser-Leseantwort bestätigt keine dauerhafte Speicherung. */
export interface VintedListingReadResult {
  readonly fields: VintedListingEditFields;
  readonly cacheState: 'unconfirmed' | 'pending';
}

export interface VintedListingDescription {
  readonly description: string;
  readonly cacheState: 'stored' | 'unconfirmed' | 'pending';
}
