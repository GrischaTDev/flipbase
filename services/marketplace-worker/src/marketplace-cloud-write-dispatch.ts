import type {
  CloudMessageClaim,
  MarketplaceCloudWriteDispatch,
} from './marketplace-message-runner.ts';
import type { CloudNegotiationClaim } from './marketplace-negotiation-runner.ts';
import type { CloudFavoriteClaim } from './marketplace-favorite-message-runner.ts';
import type { CloudListingClaim } from './marketplace-listing-runner.ts';

export type MarketplaceCloudWriteClaim =
  CloudMessageClaim | CloudNegotiationClaim | CloudFavoriteClaim | CloudListingClaim;
interface CloudWriteHandlers {
  messages: MarketplaceCloudWriteDispatch<CloudMessageClaim>;
  negotiations?: MarketplaceCloudWriteDispatch<CloudNegotiationClaim>;
  listings?: MarketplaceCloudWriteDispatch<CloudListingClaim>;
  favorites?: MarketplaceCloudWriteDispatch<CloudFavoriteClaim>;
}

/** Übernimmt höchstens einen Auftrag für den gemeinsamen exklusiven Browserplatz. */
export function createMarketplaceCloudWriteDispatch(
  handlers: CloudWriteHandlers,
): MarketplaceCloudWriteDispatch<MarketplaceCloudWriteClaim> {
  const ordered = [handlers.messages, handlers.negotiations, handlers.listings, handlers.favorites];
  return {
    claim: async (workerId, workerEpoch, runnerId) => {
      for (const handler of ordered) {
        if (!handler) continue;
        const claim = await handler.claim(workerId, workerEpoch, runnerId);
        if (claim) return claim;
      }
      return null;
    },
    run: (claim) => {
      switch (claim.kind) {
        case 'message':
          return handlers.messages.run(claim);
        case 'negotiation':
          if (handlers.negotiations) return handlers.negotiations.run(claim);
          break;
        case 'listing':
          if (handlers.listings) return handlers.listings.run(claim);
          break;
        case 'favorite_message':
        case 'favorite_offer':
          if (handlers.favorites) return handlers.favorites.run(claim);
          break;
      }
      return Promise.reject(new Error('Der Auftragsdienst ist nicht bereit.'));
    },
  };
}
