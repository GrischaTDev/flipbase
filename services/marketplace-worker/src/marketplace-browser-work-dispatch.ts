import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type { CloudMessageClaim } from './marketplace-message-runner.ts';
import type { CloudNegotiationClaim } from './marketplace-negotiation-runner.ts';
import type { CloudListingClaim } from './marketplace-listing-runner.ts';
import type { CloudFavoriteClaim } from './marketplace-favorite-message-runner.ts';
import type { SupabaseMarketplaceMessageStore } from './supabase-marketplace-message-store.ts';
import type { SupabaseMarketplaceNegotiationStore } from './supabase-marketplace-negotiation-store.ts';
import type { SupabaseMarketplaceListingStore } from './supabase-marketplace-listing-store.ts';
import type { SupabaseMarketplaceFavoriteMessageStore } from './supabase-marketplace-favorite-message-store.ts';
import type { SupabaseMarketplaceSyncDispatchStore } from './supabase-marketplace-sync-dispatch-store.ts';
import {
  actionRecord,
  parseAccountActionClaim,
  type AccountActionClaim,
  type SupabaseMarketplaceAccountActionStore,
} from './supabase-marketplace-account-action-store.ts';

export type MarketplaceBrowserWorkClaim =
  | CloudMessageClaim
  | CloudNegotiationClaim
  | CloudListingClaim
  | CloudFavoriteClaim
  | AccountActionClaim
  | { kind: 'sync'; scope: BrowserSessionScope };
interface WorkDispatchOptions {
  actions: SupabaseMarketplaceAccountActionStore;
  sync: SupabaseMarketplaceSyncDispatchStore;
  messages?: SupabaseMarketplaceMessageStore;
  negotiations?: SupabaseMarketplaceNegotiationStore;
  listings?: SupabaseMarketplaceListingStore;
  favorites?: SupabaseMarketplaceFavoriteMessageStore;
  includeScheduled: boolean;
  run(claim: MarketplaceBrowserWorkClaim): Promise<void>;
}
/** Die Datenbank entscheidet über alle Auftragsarten gemeinsam, bevor genau ein Claim entsteht. */
export function createMarketplaceBrowserWorkDispatch(options: WorkDispatchOptions) {
  return {
    claim: async (
      workerId: string,
      workerEpoch: number,
      runnerId: string,
    ): Promise<MarketplaceBrowserWorkClaim | null> => {
      const enabled = [
        'account_action',
        'sync',
        ...(options.messages ? ['message'] : []),
        ...(options.negotiations ? ['negotiation'] : []),
        ...(options.listings ? ['listing'] : []),
        ...(options.favorites ? ['favorite_message', 'favorite_offer'] : []),
      ];
      const raw = await options.actions.rpc('marketplace_browser_work_claim', {
        p_worker_id: workerId,
        p_worker_epoch: workerEpoch,
        p_runner_id: runnerId,
        p_include_scheduled: options.includeScheduled,
        p_enabled_kinds: enabled,
      });
      if (raw === null) return null;
      const result = actionRecord(raw);
      if (typeof result.kind !== 'string' || !enabled.includes(result.kind))
        throw new Error('Unerlaubter Arbeitsauftrag');
      let claim: MarketplaceBrowserWorkClaim | null;
      switch (result.kind) {
        case 'account_action':
          return parseAccountActionClaim(result.claim, workerId, workerEpoch, runnerId);
        case 'sync': {
          const scope = options.sync.parseClaim(
            result.claim,
            workerId,
            workerEpoch,
            runnerId,
            options.includeScheduled,
          );
          if (!scope) throw new Error('Leseclaim fehlt');
          return { kind: 'sync', scope };
        }
        case 'message':
          claim =
            options.messages?.parseClaim(result.claim, workerId, workerEpoch, runnerId) ?? null;
          break;
        case 'negotiation':
          claim =
            options.negotiations?.parseClaim(result.claim, workerId, workerEpoch, runnerId) ?? null;
          break;
        case 'listing':
          claim =
            options.listings?.parseClaim(result.claim, workerId, workerEpoch, runnerId) ?? null;
          break;
        case 'favorite_message':
        case 'favorite_offer':
          claim =
            options.favorites?.parseClaim(result.claim, workerId, workerEpoch, runnerId) ?? null;
          break;
        default:
          throw new Error('Unbekannter Arbeitsauftrag');
      }
      if (!claim || claim.kind !== result.kind) throw new Error('Auftragsart stimmt nicht überein');
      return claim;
    },
    run: options.run,
  };
}
