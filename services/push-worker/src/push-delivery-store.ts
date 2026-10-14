import type { PushWorkerConfig } from './config.ts';
import type { PushProviderResult, PushSubscription } from './push-provider.ts';
import { readFavoriteNotificationContent } from './favorite-notification-content.ts';
export interface PushClaim {
  id: string;
  binding_generation: string;
  claim_token: string;
}
export interface AuthorizedDelivery extends PushSubscription {
  keyId: string;
  payload: unknown;
  expiresAt: string;
}
export interface PushDeliveryStore {
  claim(): Promise<PushClaim[]>;
  authorize(claim: PushClaim): Promise<AuthorizedDelivery | null>;
  finish(claim: PushClaim, result: PushProviderResult): Promise<boolean>;
  health(): Promise<Record<string, number>>;
  cleanup(): Promise<void>;
}
const uuid = /^[a-f0-9-]{36}$/iu;
export function createPushDeliveryStore(config: PushWorkerConfig): PushDeliveryStore {
  async function rpc(name: string, parameters: Record<string, unknown> = {}): Promise<unknown> {
    const response = await fetch(`${config.supabaseUrl.replace(/\/$/u, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parameters),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Push database unavailable');
    return response.status === 204 ? null : response.json();
  }
  const identity = (claim: PushClaim) => ({
    p_delivery_id: claim.id,
    p_generation: claim.binding_generation,
    p_claim_token: claim.claim_token,
  });
  return {
    async claim() {
      const claims = await rpc('web_push_claim', {
        p_key_id: config.keyId,
        p_allow_all: config.allowAll,
        p_pilot_users: config.pilotUsers,
        p_pilot_devices: config.pilotDevices,
      });
      if (
        !Array.isArray(claims) ||
        claims.length > 4 ||
        claims.some(
          (claim) =>
            !claim ||
            !uuid.test(claim.id) ||
            !uuid.test(claim.binding_generation) ||
            !uuid.test(claim.claim_token),
        )
      )
        throw new Error('Invalid push claims');
      return claims as PushClaim[];
    },
    async authorize(claim) {
      const delivery = await rpc('web_push_authorize', identity(claim));
      if (delivery === null) return null;
      if (!delivery || typeof delivery !== 'object') throw new Error('Invalid push delivery');
      const binding = delivery as Record<string, unknown>;
      if (
        ['endpoint', 'p256dh', 'auth', 'keyId', 'expiresAt'].some(
          (field) => typeof binding[field] !== 'string',
        )
      )
        throw new Error('Invalid push binding');
      const content = await readFavoriteNotificationContent(config, binding['payload']);
      const payload = binding['payload'];
      if (
        payload &&
        typeof payload === 'object' &&
        'category' in payload &&
        payload.category === 'favorite'
      ) {
        // Zwischen Detailabruf und Send kann eine Kategorie oder ein Konto widerrufen werden.
        const confirmed = await rpc('web_push_authorize', identity(claim));
        if (confirmed === null) return null;
        if (JSON.stringify(confirmed) !== JSON.stringify(binding))
          throw new Error('Push binding changed during content lookup');
        if (content) binding['payload'] = { ...(payload as Record<string, unknown>), ...content };
      }
      return binding as unknown as AuthorizedDelivery;
    },
    async finish(claim, result) {
      return (
        (await rpc('web_push_finish', {
          ...identity(claim),
          p_result: result.status,
          p_retry_after_ms: result.status === 'retry' ? (result.retryAfterMs ?? null) : null,
        })) === true
      );
    },
    async health() {
      const counts = await rpc('web_push_health');
      if (
        !counts ||
        typeof counts !== 'object' ||
        Object.values(counts).some(
          (count) => typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0,
        )
      )
        throw new Error('Invalid push health');
      return counts as Record<string, number>;
    },
    async cleanup() {
      await rpc('web_push_cleanup');
    },
  };
}
