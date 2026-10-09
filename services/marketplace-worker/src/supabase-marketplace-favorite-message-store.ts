import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type {
  CloudFavoriteClaim,
  FavoriteWriteResult,
} from './marketplace-favorite-message-runner.ts';
import type {
  MarketplaceFavoriteMessageCommand,
  MarketplaceFavoriteOfferCommand,
} from '../../../supabase/functions/_shared/marketplace-message-contracts.d.ts';
import { validateMarketplaceMessageLease } from './supabase-marketplace-message-store.ts';
const invalid = () => new Error('Cloud-Favoritenantwort ungültig');
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  const fields = input as Record<string, unknown>;
  if (Object.keys(fields).length !== keys.length || keys.some((key) => !Object.hasOwn(fields, key)))
    throw invalid();
  return fields;
}
function uuid(input: unknown): string {
  if (
    typeof input !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)
  )
    throw invalid();
  return input;
}
function identifier(input: unknown): string {
  if (typeof input !== 'string' || !/^[1-9][0-9]{0,31}$/.test(input)) throw invalid();
  return input;
}
function version(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1) throw invalid();
  return input;
}
function text(input: unknown): string {
  if (
    typeof input !== 'string' ||
    !input.trim() ||
    input.length > 2000 ||
    [...input].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    })
  )
    throw invalid();
  return input;
}
function timestamp(input: unknown): string {
  if (typeof input !== 'string' || !Number.isFinite(Date.parse(input))) throw invalid();
  return input;
}
function command(
  input: unknown,
  accountId: string,
  phase: 'message' | 'offer',
): MarketplaceFavoriteMessageCommand | MarketplaceFavoriteOfferCommand {
  const fields = record(input, [
    'recipientId',
    'itemId',
    'text',
    'offer',
    'conversationId',
    'transactionId',
    'externalMessageId',
  ]);
  const basic = {
    recipientId: identifier(fields['recipientId']),
    itemId: identifier(fields['itemId']),
    text: text(fields['text']),
  };
  if (basic.recipientId === accountId) throw invalid();
  if (phase === 'message') {
    if (
      fields['conversationId'] !== null ||
      fields['transactionId'] !== null ||
      fields['externalMessageId'] !== null
    )
      throw invalid();
    return Object.freeze(basic);
  }
  const offer = record(fields['offer'], ['type', 'value']);
  if (
    (offer['type'] !== 'amount' && offer['type'] !== 'percentage') ||
    typeof offer['value'] !== 'number' ||
    !Number.isFinite(offer['value']) ||
    offer['value'] <= 0 ||
    offer['value'] > 1000000 ||
    (offer['type'] === 'percentage' && (offer['value'] < 1 || offer['value'] > 50))
  )
    throw invalid();
  return Object.freeze({
    ...basic,
    conversationId: identifier(fields['conversationId']),
    transactionId: identifier(fields['transactionId']),
    externalMessageId: identifier(fields['externalMessageId']),
    offer: Object.freeze({ type: offer['type'], value: offer['value'] }),
  });
}
export class SupabaseMarketplaceFavoriteMessageStore {
  private readonly options: {
    url: string;
    serviceRoleKey: string;
    fetch?: typeof fetch;
    now?: () => number;
  };
  constructor(options: {
    url: string;
    serviceRoleKey: string;
    fetch?: typeof fetch;
    now?: () => number;
  }) {
    if (!options.serviceRoleKey.trim()) throw invalid();
    this.options = options;
  }
  async claim(
    workerId: string,
    epoch: number,
    runnerId: string,
  ): Promise<CloudFavoriteClaim | null> {
    const input = await this.rpc('marketplace_cloud_favorite_claim', {
      p_worker_id: uuid(workerId),
      p_worker_epoch: version(epoch),
      p_runner_id: uuid(runnerId),
    });
    if (input === null) return null;
    const fields = record(input, [
      'eventId',
      'claimToken',
      'workspaceId',
      'connectionId',
      'userId',
      'workerId',
      'workerEpoch',
      'runnerId',
      'authorizationVersion',
      'settingsVersion',
      'externalAccountId',
      'sessionId',
      'expiresAt',
      'absoluteExpiresAt',
      'phase',
      'command',
    ]);
    if (
      fields['workerId'] !== workerId ||
      fields['workerEpoch'] !== epoch ||
      fields['runnerId'] !== runnerId ||
      (fields['phase'] !== 'message' && fields['phase'] !== 'offer')
    )
      throw invalid();
    const phase = fields['phase'],
      accountId = identifier(fields['externalAccountId']),
      eventId = uuid(fields['eventId']),
      claimToken = uuid(fields['claimToken']);
    const binding: NonNullable<BrowserSessionScope['favoriteWrite']> = {
      eventId,
      claimToken,
      phase,
      workerId,
      workerEpoch: epoch,
      runnerId,
      sessionId: uuid(fields['sessionId']),
      expiresAt: timestamp(fields['expiresAt']),
      absoluteExpiresAt: timestamp(fields['absoluteExpiresAt']),
    };
    if (
      Date.parse(binding.expiresAt) <= (this.options.now ?? Date.now)() ||
      Date.parse(binding.expiresAt) > Date.parse(binding.absoluteExpiresAt)
    )
      throw invalid();
    return Object.freeze({
      kind: phase === 'message' ? 'favorite_message' : 'favorite_offer',
      eventId,
      claimToken,
      accountId,
      authorizationVersion: version(fields['authorizationVersion']),
      settingsVersion: version(fields['settingsVersion']),
      command: command(fields['command'], accountId, phase),
      scope: Object.freeze({
        workspaceId: uuid(fields['workspaceId']),
        connectionId: uuid(fields['connectionId']),
        userId: uuid(fields['userId']),
        userAccessToken: '',
        favoriteWrite: Object.freeze(binding),
      }),
    });
  }
  async check(claim: CloudFavoriteClaim): Promise<boolean> {
    const binding = claim.scope.favoriteWrite;
    if (!binding) throw invalid();
    return (
      validateMarketplaceMessageLease(
        await this.rpc('marketplace_cloud_favorite_check', this.binding(claim)),
        binding,
        (this.options.now ?? Date.now)(),
      ) !== null
    );
  }
  async begin(claim: CloudFavoriteClaim, original?: number, offered?: number): Promise<void> {
    const response = record(
      await this.rpc('marketplace_cloud_favorite_begin', {
        ...this.binding(claim),
        ...(original === undefined
          ? {}
          : { p_original_price_cents: original, p_offer_price_cents: offered }),
      }),
      ['ok'],
    );
    if (response['ok'] !== true) throw invalid();
  }
  async finish(claim: CloudFavoriteClaim, result: FavoriteWriteResult): Promise<void> {
    const externalId =
      claim.kind === 'favorite_message'
        ? 'externalMessageId' in result
          ? result.externalMessageId
          : undefined
        : 'externalOfferId' in result
          ? result.externalOfferId
          : undefined;
    if (
      !['sent', 'failed', 'skipped', 'outcome_unknown'].includes(result.outcome) ||
      (result.outcome === 'sent' ? !externalId : externalId !== undefined) ||
      (result.errorCode !== undefined && !/^[a-z_]{1,80}$/.test(result.errorCode))
    )
      throw invalid();
    if (externalId !== undefined) identifier(externalId);
    const conversationId = 'conversationId' in result ? result.conversationId : undefined,
      transactionId = 'transactionId' in result ? result.transactionId : undefined;
    if (claim.kind === 'favorite_message' && result.outcome === 'sent') {
      identifier(conversationId);
      if (transactionId !== undefined) identifier(transactionId);
    }
    const response = record(
      await this.rpc('marketplace_cloud_favorite_finish', {
        ...this.binding(claim),
        p_outcome: result.outcome,
        p_external_id: externalId ?? null,
        p_error_code: result.errorCode ?? null,
        p_conversation_id: conversationId ?? null,
        p_transaction_id: transactionId ?? null,
      }),
      ['ok'],
    );
    if (response['ok'] !== true) throw invalid();
  }
  private binding(claim: CloudFavoriteClaim): Record<string, string | number> {
    const scope = claim.scope,
      binding = scope.favoriteWrite;
    if (
      !binding ||
      scope.messageWrite ||
      scope.syncRead ||
      scope.cloudSetup ||
      scope.negotiationWrite ||
      scope.userAccessToken ||
      binding.eventId !== claim.eventId ||
      binding.claimToken !== claim.claimToken ||
      binding.phase !== (claim.kind === 'favorite_message' ? 'message' : 'offer')
    )
      throw invalid();
    return {
      p_workspace_id: uuid(scope.workspaceId),
      p_connection_id: uuid(scope.connectionId),
      p_event_id: uuid(claim.eventId),
      p_claim_token: uuid(claim.claimToken),
      p_worker_id: uuid(binding.workerId),
      p_worker_epoch: version(binding.workerEpoch),
      p_phase: binding.phase,
    };
  }
  private async rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await (this.options.fetch ?? fetch)(
        new URL('/rest/v1/rpc/' + name, this.options.url),
        {
          method: 'POST',
          headers: {
            apikey: this.options.serviceRoleKey,
            Authorization: 'Bearer ' + this.options.serviceRoleKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw invalid();
      return (await response.json()) as unknown;
    } catch {
      throw invalid();
    }
  }
}
