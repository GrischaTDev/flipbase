import type {
  MarketplaceListingResult,
  MarketplaceListingSnapshot,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import type { BrowserInfo } from './gologin-cloud-browser.ts';
import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import { isVintedListingResult } from './vinted-listing-contracts.ts';
import type { MarketplaceListingPhoto } from './marketplace-listing-photo.ts';

export interface CloudListingClaim {
  readonly kind: 'listing';
  readonly jobId: string;
  readonly claimToken: string;
  readonly scope: BrowserSessionScope;
  readonly accountId: string;
  readonly action: 'publish' | 'vinted_draft';
  readonly snapshot: MarketplaceListingSnapshot;
}
interface ListingBroker {
  open(scope: BrowserSessionScope): Promise<string>;
  run<T>(
    scope: BrowserSessionScope,
    id: string,
    operation: (browser: BrowserInfo) => Promise<T>,
  ): Promise<T>;
  close(scope: BrowserSessionScope, id: string): Promise<void>;
}
interface ListingStore {
  check(claim: CloudListingClaim): Promise<boolean>;
  begin(claim: CloudListingClaim): Promise<void>;
  finish(claim: CloudListingClaim, result: MarketplaceListingResult): Promise<void>;
  loadPhoto(claim: CloudListingClaim, imageId: string): Promise<MarketplaceListingPhoto>;
}
export class MarketplaceListingRunner {
  private readonly broker: ListingBroker;
  private readonly store: ListingStore;
  constructor(broker: ListingBroker, store: ListingStore) {
    this.broker = broker;
    this.store = store;
  }
  async run(claim: CloudListingClaim): Promise<void> {
    const scope = claim.scope,
      binding = scope.listingWrite;
    if (
      !binding ||
      binding.jobId !== claim.jobId ||
      binding.claimToken !== claim.claimToken ||
      scope.userAccessToken ||
      scope.syncRead ||
      scope.cloudSetup ||
      scope.messageWrite ||
      scope.favoriteWrite ||
      scope.negotiationWrite ||
      scope.connectionId !== claim.snapshot.connectionId
    )
      throw new Error('Inseratversuch ungültig');
    let sessionId: string | undefined,
      beginAttempted = false,
      beginConfirmed = false,
      recovery = false;
    let result: MarketplaceListingResult = {
      outcome: 'failed',
      errorCode: 'authorization_expired',
    };
    try {
      try {
        sessionId = await this.broker.open(scope);
        if (sessionId !== binding.sessionId) throw new Error('Inseratversuch ungültig');
        if (await this.store.check(claim)) {
          const currentSessionId = sessionId;
          result = await this.broker.run(scope, currentSessionId, async (browser) => {
            if (!browser.submitListing) return { outcome: 'failed', errorCode: 'unsupported' };
            let adapterActive = true,
              loadingPhoto = false,
              beginReserved = false;
            const authorize = async () => {
              if (!adapterActive) throw new Error('Inseratadapter bereits geschlossen');
              if (!(await this.store.check(claim))) throw new Error('Inseratfreigabe ungültig');
              await this.broker.run(scope, currentSessionId, async () => undefined);
            };
            const loadPhoto = async (imageId: string) => {
              if (
                !adapterActive ||
                loadingPhoto ||
                !claim.snapshot.images.some((image) => image.id === imageId)
              )
                throw new Error('Fotoübergabe ungültig');
              loadingPhoto = true;
              try {
                await authorize();
                const photo = await this.store.loadPhoto(claim, imageId);
                await authorize();
                return photo;
              } finally {
                loadingPhoto = false;
              }
            };
            const beforeWrite = async () => {
              if (beginReserved) throw new Error('Inseratversuch bereits begonnen');
              // Noch vor dem ersten await reservieren: parallele Aufrufe dürfen kein zweites Begin senden.
              beginReserved = true;
              await authorize();
              beginAttempted = true;
              await this.store.begin(claim);
              beginConfirmed = true;
            };
            // Der Adapter muss beforeWrite vor dem ersten Upload aufrufen, nicht erst vor Veröffentlichen.
            let provided: MarketplaceListingResult;
            try {
              provided = await browser.submitListing(
                claim.accountId,
                claim.action,
                claim.snapshot,
                beforeWrite,
                authorize,
                loadPhoto,
              );
            } finally {
              adapterActive = false;
            }
            if (
              !isVintedListingResult(provided, claim.action, claim.accountId) ||
              (provided.outcome === 'confirmed' && !beginConfirmed)
            )
              return {
                outcome: beginAttempted ? 'outcome_unknown' : 'failed',
                errorCode: 'provider_result_invalid',
              };
            return provided;
          });
        }
      } catch {
        result = {
          outcome: beginAttempted ? 'outcome_unknown' : 'failed',
          errorCode:
            beginAttempted && !beginConfirmed ? 'begin_unconfirmed' : 'provider_unavailable',
        };
        if (!sessionId) recovery = true;
      }
      try {
        await this.store.finish(claim, result);
      } catch {
        recovery = true;
      }
    } finally {
      if (sessionId)
        try {
          await this.broker.close(scope, sessionId);
        } catch {
          recovery = true;
        }
    }
    if (recovery) throw new Error('Cloud-Inseratversuch verlangt Wiederherstellung');
  }
}
