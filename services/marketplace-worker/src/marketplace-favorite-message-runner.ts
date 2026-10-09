import type { BrowserInfo } from './gologin-cloud-browser.ts';
import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type {
  MarketplaceFavoriteMessageCommand,
  MarketplaceFavoriteOfferCommand,
  MarketplaceFavoriteMessageResult,
  MarketplaceFavoriteOfferResult,
} from '../../../supabase/functions/_shared/marketplace-message-contracts.d.ts';

export interface CloudFavoriteClaim {
  readonly kind: 'favorite_message' | 'favorite_offer';
  readonly eventId: string;
  readonly claimToken: string;
  readonly scope: BrowserSessionScope;
  readonly accountId: string;
  readonly authorizationVersion: number;
  readonly settingsVersion: number;
  readonly command: MarketplaceFavoriteMessageCommand | MarketplaceFavoriteOfferCommand;
}
export type FavoriteWriteResult = MarketplaceFavoriteMessageResult | MarketplaceFavoriteOfferResult;
interface FavoriteBroker {
  open(scope: BrowserSessionScope): Promise<string>;
  run<T>(
    scope: BrowserSessionScope,
    id: string,
    operation: (browser: BrowserInfo) => Promise<T>,
  ): Promise<T>;
  close(scope: BrowserSessionScope, id: string): Promise<void>;
}
interface FavoriteStore {
  check(claim: CloudFavoriteClaim): Promise<boolean>;
  begin(claim: CloudFavoriteClaim, original?: number, offered?: number): Promise<void>;
  finish(claim: CloudFavoriteClaim, result: FavoriteWriteResult): Promise<void>;
}
export class MarketplaceFavoriteMessageRunner {
  private readonly broker: FavoriteBroker;
  private readonly store: FavoriteStore;
  constructor(broker: FavoriteBroker, store: FavoriteStore) {
    this.broker = broker;
    this.store = store;
  }
  async run(claim: CloudFavoriteClaim): Promise<void> {
    const scope = claim.scope,
      binding = scope.favoriteWrite;
    if (
      !binding ||
      binding.eventId !== claim.eventId ||
      binding.claimToken !== claim.claimToken ||
      binding.phase !== (claim.kind === 'favorite_message' ? 'message' : 'offer') ||
      scope.syncRead ||
      scope.messageWrite ||
      scope.cloudSetup ||
      scope.negotiationWrite ||
      scope.userAccessToken
    )
      throw new Error('Favoritenclaim ungültig');
    let sessionId: string | undefined;
    let beginAttempted = false,
      beginConfirmed = false,
      requiresRecovery = false;
    let result: FavoriteWriteResult = { outcome: 'failed', errorCode: 'authorization_expired' };
    try {
      try {
        sessionId = await this.broker.open(scope);
        if (sessionId !== binding.sessionId) throw new Error('Favoritenclaim ungültig');
        const currentSessionId = sessionId;
        const authorize = async () => {
          if (!(await this.store.check(claim))) throw new Error('Favoritenfreigabe ungültig');
          await this.broker.run(scope, currentSessionId, async () => undefined);
        };
        if (await this.store.check(claim))
          result = await this.broker.run(scope, sessionId, async (browser) => {
            if (claim.kind === 'favorite_message') {
              if (!browser.sendFavoriteMessage)
                return { outcome: 'failed', errorCode: 'unsupported' };
              beginAttempted = true;
              try {
                await this.store.begin(claim);
              } catch {
                return { outcome: 'outcome_unknown', errorCode: 'begin_unconfirmed' };
              }
              beginConfirmed = true;
              return browser.sendFavoriteMessage(claim.accountId, claim.command, authorize);
            }
            if (!browser.sendFavoriteOffer || !('offer' in claim.command))
              return { outcome: 'failed', errorCode: 'unsupported' };
            const outcome = await browser.sendFavoriteOffer(
              claim.accountId,
              claim.command,
              authorize,
              async (original, offered) => {
                beginAttempted = true;
                await this.store.begin(claim, original, offered);
                beginConfirmed = true;
                return true;
              },
            );
            return beginAttempted && !beginConfirmed
              ? { outcome: 'outcome_unknown', errorCode: 'begin_unconfirmed' }
              : outcome;
          });
      } catch {
        result = {
          outcome: beginAttempted ? 'outcome_unknown' : 'failed',
          errorCode:
            beginAttempted && !beginConfirmed ? 'begin_unconfirmed' : 'provider_unavailable',
        };
        if (!sessionId) requiresRecovery = true;
      }
      try {
        await this.store.finish(claim, result);
      } catch {
        requiresRecovery = true;
      }
    } finally {
      if (sessionId)
        try {
          await this.broker.close(scope, sessionId);
        } catch {
          requiresRecovery = true;
        }
    }
    if (requiresRecovery) throw new Error('Cloud-Favoriten verlangen Wiederherstellung');
  }
}
