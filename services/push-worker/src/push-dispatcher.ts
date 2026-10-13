import type { PushWorkerConfig } from './config.ts';
import type { PushDeliveryStore, PushClaim } from './push-delivery-store.ts';
import type { PushProvider, PushProviderResult } from './push-provider.ts';
const identifier = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
export function validatePayload(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const payload = input as Record<string, unknown>;
  if (
    Object.keys(payload).sort().join(',') !==
      'body,category,eventId,target,title,version,workspaceId' ||
    payload.version !== 1 ||
    typeof payload.eventId !== 'string' ||
    !identifier.test(payload.eventId) ||
    typeof payload.workspaceId !== 'string' ||
    !identifier.test(payload.workspaceId) ||
    typeof payload.title !== 'string' ||
    payload.title.length > 80 ||
    typeof payload.body !== 'string' ||
    payload.body.length > 200 ||
    !payload.target ||
    typeof payload.target !== 'object'
  )
    return false;
  const target = payload.target as Record<string, unknown>;
  const fields: Record<string, string[]> = {
    settings: [],
    vinted_message: ['connectionId', 'conversationId'],
    ebay_orders: ['connectionId'],
    store_orders: [],
    connection: ['connectionId'],
  };
  const kind = String(target.kind);
  const requiredFields = Object.hasOwn(fields, kind) ? fields[kind] : undefined;
  if (
    !requiredFields ||
    Object.keys(target).sort().join(',') !== ['kind', ...requiredFields].sort().join(',') ||
    requiredFields.some(
      (field) => typeof target[field] !== 'string' || !identifier.test(target[field] as string),
    )
  )
    return false;
  return (
    (payload.category === 'test' && kind === 'settings') ||
    (payload.category === 'message' && kind === 'vinted_message') ||
    (payload.category === 'order' && ['ebay_orders', 'store_orders'].includes(kind)) ||
    (payload.category === 'connection' && kind === 'connection')
  );
}
export class PushDispatcher {
  readonly counters = { accepted: 0, retry: 0, expired: 0, configuration_error: 0 };
  private readonly config: PushWorkerConfig;
  private readonly store: PushDeliveryStore;
  private readonly provider: PushProvider;
  constructor(config: PushWorkerConfig, store: PushDeliveryStore, provider: PushProvider) {
    this.config = config;
    this.store = store;
    this.provider = provider;
  }
  async dispatch(): Promise<void> {
    if (!this.config.enabled) return;
    const claims = await this.store.claim();
    let index = 0;
    // Ein RPC-Fehler darf den naechsten Poll erst nach den noch laufenden Sends starten.
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(4, claims.length) }, async () => {
        while (index < claims.length) {
          const claim = claims[index++];
          if (claim) await this.send(claim);
        }
      }),
    );
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('Push delivery batch incomplete');
  }
  private async send(claim: PushClaim): Promise<void> {
    const delivery = await this.store.authorize(claim);
    if (!delivery) return;
    let result: PushProviderResult;
    if (
      delivery.keyId !== this.config.keyId ||
      !validatePayload(delivery.payload) ||
      !Number.isFinite(Date.parse(delivery.expiresAt))
    )
      result = { status: 'configuration_error' };
    // SQL entscheidet ueber Ereignisablauf. Provider-expired ist ausschliesslich404/410 vorbehalten.
    else if (Date.parse(delivery.expiresAt) <= Date.now())
      result = { status: 'retry', retryAfterMs: 0 };
    else result = await this.provider.send(delivery, JSON.stringify(delivery.payload));
    if (await this.store.finish(claim, result)) {
      this.counters[result.status]++;
      // Nur interne IDs und die kontrollierte Fehlerklasse; niemals Endpoint oder Providerbody.
      process.stdout.write(`${JSON.stringify({ DeliveryId: claim.id, Status: result.status })}\n`);
    }
  }
}
