import type { AccountScope } from './marketplace-contracts.ts';
import type { MarketplaceListingResult } from './marketplace-listing-contracts.d.ts';

export type LocalListingRequest = AccountScope &
  (
    | { readonly action: 'listing_claim' }
    | {
        readonly action: 'listing_check' | 'listing_begin';
        readonly jobId: string;
        readonly claimToken: string;
      }
    | {
        readonly action: 'listing_finish';
        readonly jobId: string;
        readonly claimToken: string;
        readonly result: MarketplaceListingResult;
      }
  );

/** Die Erweiterung nennt nur die Originalkennung, niemals einen Storage-Pfad. */
export type LocalListingPhotoRequest = AccountScope & {
  readonly action: 'listing_photo';
  readonly jobId: string;
  readonly claimToken: string;
  readonly imageId: string;
};

export interface LocalListingPhoto {
  readonly imageId: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly bytes: ArrayBuffer;
}
