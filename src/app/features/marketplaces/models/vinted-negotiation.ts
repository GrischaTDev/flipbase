import type { AccountScope } from './marketplace.models';
import { MarketplaceResponseError } from './marketplace-response';
import { isNegotiationConfig } from '../../../../../supabase/functions/_shared/negotiation-config';
import type { VintedNegotiationConfig } from '../../../../../supabase/functions/_shared/marketplace-negotiation-contracts';
export {
  createDefaultNegotiationConfig,
  calculateNegotiationPrices,
  isNegotiationConfig,
} from '../../../../../supabase/functions/_shared/negotiation-config';
export type {
  VintedNegotiationConfig,
  NegotiationMessageEvent,
  NegotiationMessageStep,
} from '../../../../../supabase/functions/_shared/marketplace-negotiation-contracts';

export const negotiationStateLabels = {
  queued: 'Vorgemerkt',
  claimed: 'Übernommen',
  sending: 'Wird ausgeführt',
  sent: 'Bestätigt ausgeführt',
  failed: 'Fehlgeschlagen',
  outcome_unknown: 'Ausgang unklar – auf Vinted prüfen',
  skipped: 'Ausgelassen',
  cancelled: 'Abgebrochen',
} as const;
export type NegotiationState = keyof typeof negotiationStateLabels;
export type NegotiationAction = 'accept' | 'decline' | 'counter';
export interface NegotiationReceipt {
  readonly id: string;
  readonly state: NegotiationState;
}
export interface NegotiationHistory extends NegotiationReceipt {
  readonly action: NegotiationAction | 'message';
  readonly errorCode: string | null;
  readonly createdAt: string;
}
export interface NegotiationSettings extends AccountScope {
  readonly enabled: boolean;
  readonly active: boolean;
  readonly version: number;
  readonly config: VintedNegotiationConfig;
  readonly events: readonly NegotiationHistory[];
}
function record(candidate: unknown): Record<string, unknown> {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
    throw new MarketplaceResponseError();
  return candidate as Record<string, unknown>;
}
export function parseNegotiationReceipt(candidate: unknown): NegotiationReceipt {
  const receipt = record(candidate);
  const state = receipt['state'];
  if (
    receipt['ok'] !== true ||
    typeof receipt['id'] !== 'string' ||
    typeof state !== 'string' ||
    !Object.hasOwn(negotiationStateLabels, state)
  )
    throw new MarketplaceResponseError();
  return { id: receipt['id'], state: state as NegotiationState };
}
export function parseNegotiationSettings(
  candidate: unknown,
  scope: AccountScope,
): NegotiationSettings {
  const settings = record(candidate);
  if (
    settings['ok'] !== true ||
    typeof settings['enabled'] !== 'boolean' ||
    typeof settings['active'] !== 'boolean' ||
    typeof settings['version'] !== 'number' ||
    !Number.isSafeInteger(settings['version']) ||
    settings['version'] < 0 ||
    !isNegotiationConfig(settings['config']) ||
    !Array.isArray(settings['events']) ||
    settings['events'].length > 50
  )
    throw new MarketplaceResponseError();
  const events = settings['events'].map((candidate): NegotiationHistory => {
    const event = record(candidate);
    const receipt = parseNegotiationReceipt({ ...event, ok: true });
    const action = event['action'];
    if (
      (action !== 'accept' &&
        action !== 'decline' &&
        action !== 'counter' &&
        action !== 'message') ||
      typeof event['createdAt'] !== 'string' ||
      !Number.isFinite(Date.parse(event['createdAt'])) ||
      (event['errorCode'] !== null && typeof event['errorCode'] !== 'string')
    )
      throw new MarketplaceResponseError();
    return { ...receipt, action, createdAt: event['createdAt'], errorCode: event['errorCode'] };
  });
  return {
    ...scope,
    enabled: settings['enabled'],
    active: settings['active'],
    version: settings['version'],
    config: settings['config'],
    events,
  };
}
export function validateCounterPrice(
  price: number | null,
  original: number,
  offered: number,
): number | null {
  if (
    price === null ||
    !Number.isFinite(price) ||
    Math.abs(price * 100 - Math.round(price * 100)) > 1e-7
  )
    return null;
  const cents = Math.round(price * 100);
  return cents > offered && cents <= original && cents >= Math.ceil(original / 2) ? cents : null;
}
