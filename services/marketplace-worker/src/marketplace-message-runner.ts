import type { BrowserInfo } from './gologin-cloud-browser.ts';
import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type {
  MarketplaceMessageCommand,
  MarketplaceMessageResult,
} from '../../../supabase/functions/_shared/marketplace-message-contracts.d.ts';

export interface CloudMessageClaim {
  readonly kind: 'message';
  readonly messageId: string;
  readonly claimToken: string;
  readonly scope: BrowserSessionScope;
  readonly accountId: string;
  readonly command: MarketplaceMessageCommand;
}

export interface MarketplaceCloudWriteDispatch<Job> {
  claim(workerId: string, workerEpoch: number, runnerId: string): Promise<Job | null>;
  run(job: Job): Promise<void>;
}

interface MessageBroker {
  open(scope: BrowserSessionScope): Promise<string>;
  run<T>(
    scope: BrowserSessionScope,
    id: string,
    operation: (browser: BrowserInfo) => Promise<T>,
  ): Promise<T>;
  close(scope: BrowserSessionScope, id: string): Promise<void>;
}

interface MessageStore {
  check(claim: CloudMessageClaim): Promise<boolean>;
  begin(claim: CloudMessageClaim): Promise<void>;
  finish(claim: CloudMessageClaim, result: MarketplaceMessageResult): Promise<void>;
}

export class MarketplaceMessageRunner {
  private readonly broker: MessageBroker;
  private readonly store: MessageStore;
  constructor(broker: MessageBroker, store: MessageStore) {
    this.broker = broker;
    this.store = store;
  }

  async run(claim: CloudMessageClaim): Promise<void> {
    const scope = claim.scope;
    const binding = scope.messageWrite;
    if (
      !binding ||
      binding.messageId !== claim.messageId ||
      binding.claimToken !== claim.claimToken ||
      scope.syncRead ||
      scope.cloudSetup ||
      scope.favoriteWrite ||
      scope.userAccessToken
    )
      throw new Error('Versandclaim ungültig');
    let sessionId: string | undefined;
    let beginAttempted = false;
    let beginConfirmed = false;
    let requiresRecovery = false;
    let result: MarketplaceMessageResult = {
      outcome: 'failed',
      errorCode: 'authorization_expired',
    };
    try {
      try {
        sessionId = await this.broker.open(scope);
        if (sessionId !== binding.sessionId) throw new Error('Versandclaim ungültig');
        if (await this.store.check(claim)) {
          result = await this.broker.run(scope, sessionId, async (browser) => {
            if (!browser.sendMessage) return { outcome: 'failed', errorCode: 'unsupported' };
            beginAttempted = true;
            try {
              await this.store.begin(claim);
            } catch {
              // Ohne Begin-ACK niemals einen weiteren Anbieter-Versuch auslösen.
              return { outcome: 'outcome_unknown', errorCode: 'begin_unconfirmed' };
            }
            beginConfirmed = true;
            const currentSessionId = sessionId;
            if (!currentSessionId) throw new Error('Versandclaim ungültig');
            try {
              return await browser.sendMessage(claim.accountId, claim.command, async () => {
                if (!(await this.store.check(claim)))
                  throw new Error('Nachrichtenfreigabe ungültig');
                await this.broker.run(scope, currentSessionId, async () => undefined);
              });
            } catch {
              return { outcome: 'outcome_unknown', errorCode: 'provider_unavailable' };
            }
          });
        }
      } catch {
        result = {
          outcome: beginAttempted ? 'outcome_unknown' : 'failed',
          errorCode:
            beginAttempted && !beginConfirmed ? 'begin_unconfirmed' : 'provider_unavailable',
        };
        // Ohne bestätigte Broker-Sitzung ist die bereits reservierte Lease möglicherweise offen.
        if (!sessionId) requiresRecovery = true;
      }
      try {
        await this.store.finish(claim, result);
      } catch {
        requiresRecovery = true;
      }
    } finally {
      if (sessionId) {
        try {
          await this.broker.close(scope, sessionId);
        } catch {
          requiresRecovery = true;
        }
      }
    }
    if (requiresRecovery) throw new Error('Cloud-Versand verlangt Wiederherstellung');
  }
}
