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
