import type { AccountScope } from './marketplace.models';
import { MarketplaceResponseError } from './marketplace-response';

export interface FavoriteMessageRule {
  readonly name: string;
  readonly startHour: number | null;
  readonly endHour: number | null;
  readonly days: readonly number[];
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
  readonly templates: readonly string[];
}
export interface FavoriteMessageConfig {
  readonly templates: readonly string[];
  readonly rules: readonly FavoriteMessageRule[];
  readonly delayMinutes: number;
  readonly timezone: 'Europe/Berlin';
  readonly offer?: FavoriteOfferConfig | null;
}
export interface FavoriteOfferConfig {
  readonly type: 'amount' | 'percentage';
  readonly value: number;
}
export type FavoriteOfferState =
  | 'not_requested'
  | 'pending'
  | 'claimed'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'outcome_unknown'
  | 'skipped';
export const favoriteOfferStateLabels: Record<FavoriteOfferState, string> = {
  not_requested: 'Ohne Angebot',
  pending: 'Angebot ausstehend',
  claimed: 'Angebot übernommen',
  sending: 'Angebot wird gesendet',
  sent: 'Angebot gesendet',
  failed: 'Angebot fehlgeschlagen',
  outcome_unknown: 'Angebotsversand unklar – auf Vinted prüfen',
  skipped: 'Angebot ausgelassen',
};
export function validateFavoriteOffer(offer: unknown): offer is FavoriteOfferConfig {
  if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return false;
  const checked = offer as Record<string, unknown>;
  const amount = checked['value'];
  return (
    Object.keys(checked).length === 2 &&
    (checked['type'] === 'amount' || checked['type'] === 'percentage') &&
    typeof amount === 'number' &&
    Number.isFinite(amount) &&
    amount > 0 &&
    Math.abs(Math.round(amount * 100) - amount * 100) < 0.000001 &&
    (checked['type'] === 'percentage' ? amount >= 1 && amount <= 50 : amount <= 1_000_000)
  );
}
export function favoriteOfferPriceCents(
  originalPriceCents: number,
  offer: FavoriteOfferConfig,
): number | null {
  if (
    !validateFavoriteOffer(offer) ||
    !Number.isSafeInteger(originalPriceCents) ||
    originalPriceCents <= 0 ||
    originalPriceCents > 100_000_000
  )
    return null;
  const discount = Math.round(offer.value * 100);
  const proposedPrice =
    offer.type === 'amount'
      ? originalPriceCents - discount
      : Math.round((originalPriceCents * (10000 - discount)) / 10000);
  return proposedPrice > 0 &&
    proposedPrice < originalPriceCents &&
    proposedPrice >= Math.ceil(originalPriceCents / 2)
    ? proposedPrice
    : null;
}
export type FavoriteMessageState =
  | 'queued'
  | 'claimed'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'outcome_unknown'
  | 'skipped'
  | 'cancelled';
export interface FavoriteMessageEvent {
  readonly id: string;
  readonly title: string;
  readonly eventAt: string;
  readonly state: FavoriteMessageState;
  readonly text: string | null;
  readonly errorCode: string | null;
  readonly offerState?: FavoriteOfferState;
  readonly offerPriceCents?: number | null;
  readonly offerErrorCode?: string | null;
}
export interface FavoriteMessageSettings extends AccountScope {
  readonly enabled: boolean;
  readonly active: boolean;
  readonly config: FavoriteMessageConfig | null;
  readonly version: number;
  readonly lastCheckedAt: string | null;
  readonly events: readonly FavoriteMessageEvent[];
}
export const favoriteMessageStateLabels: Record<FavoriteMessageState, string> = {
  queued: 'Geplant',
  claimed: 'Übernommen',
  sending: 'Wird gesendet',
  sent: 'Gesendet',
  failed: 'Fehlgeschlagen',
  outcome_unknown: 'Versand unklar · auf Vinted prüfen',
  skipped: 'Übersprungen',
  cancelled: 'Abgebrochen',
};
export function validateFavoriteMessageConfig(config: FavoriteMessageConfig): boolean {
  const textsValid = (templates: readonly string[]) =>
    templates.length >= 1 &&
    templates.length <= 10 &&
    templates.every(
      (template) =>
        typeof template === 'string' &&
        !!template.trim() &&
        template.length <= 2000 &&
        [...template].every(
          (character) => character.charCodeAt(0) >= 32 || ['\t', '\n', '\r'].includes(character),
        ),
    );
  const priceValid = (price: number | null) =>
    price === null || (Number.isFinite(price) && price >= 0 && price <= 1_000_000);
  const hourValid = (hour: number | null) =>
    hour !== null && Number.isInteger(hour) && hour >= 0 && hour <= 23;
  return (
    (config.offer === undefined || config.offer === null || validateFavoriteOffer(config.offer)) &&
    config.timezone === 'Europe/Berlin' &&
    Number.isInteger(config.delayMinutes) &&
    config.delayMinutes >= 0 &&
    config.delayMinutes <= 10080 &&
    textsValid(config.templates) &&
    config.rules.length <= 20 &&
    config.rules.every(
      (rule) =>
        typeof rule.name === 'string' &&
        !!rule.name.trim() &&
        rule.name.length <= 80 &&
        textsValid(rule.templates) &&
        rule.days.length <= 7 &&
        rule.days.every((day) => Number.isInteger(day) && day >= 1 && day <= 7) &&
        ((rule.startHour === null && rule.endHour === null) ||
          (hourValid(rule.startHour) &&
            hourValid(rule.endHour) &&
            rule.startHour !== rule.endHour)) &&
        priceValid(rule.minPrice) &&
        priceValid(rule.maxPrice) &&
        (rule.minPrice === null || rule.maxPrice === null || rule.minPrice <= rule.maxPrice),
    )
  );
}
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new MarketplaceResponseError();
  return input as Record<string, unknown>;
}
export function parseFavoriteMessageSettings(
  input: unknown,
  scope: AccountScope,
): FavoriteMessageSettings {
  const response = record(input);
  if (
    response['workspaceId'] !== scope.workspaceId ||
    response['connectionId'] !== scope.connectionId ||
    typeof response['enabled'] !== 'boolean' ||
    typeof response['active'] !== 'boolean' ||
    !Number.isSafeInteger(response['version']) ||
    Number(response['version']) < 0 ||
    !Array.isArray(response['events']) ||
    response['events'].length > 30
  )
    throw new MarketplaceResponseError();
  const dateValid = (date: unknown) =>
    typeof date === 'string' && /^\d{4}-\d\d-\d\dT/.test(date) && Number.isFinite(Date.parse(date));
  if (response['lastCheckedAt'] !== null && !dateValid(response['lastCheckedAt']))
    throw new MarketplaceResponseError();
  let config: FavoriteMessageConfig | null = null;
  if (response['config'] !== null) {
    const stored = record(response['config']);
    if (!Array.isArray(stored['templates']) || !Array.isArray(stored['rules']))
      throw new MarketplaceResponseError();
    for (const rule of stored['rules']) {
      const checked = record(rule);
      if (!Array.isArray(checked['templates']) || !Array.isArray(checked['days']))
        throw new MarketplaceResponseError();
    }
    config = stored as unknown as FavoriteMessageConfig;
    if (!validateFavoriteMessageConfig(config)) throw new MarketplaceResponseError();
  }
  const events = response['events'].map((entry): FavoriteMessageEvent => {
    const event = record(entry);
    if (
      typeof event['id'] !== 'string' ||
      typeof event['title'] !== 'string' ||
      !dateValid(event['eventAt']) ||
      typeof event['state'] !== 'string' ||
      !Object.hasOwn(favoriteMessageStateLabels, event['state']) ||
      (event['text'] !== null && typeof event['text'] !== 'string') ||
      (event['errorCode'] !== null && typeof event['errorCode'] !== 'string') ||
      (event['offerState'] !== undefined &&
        (typeof event['offerState'] !== 'string' ||
          !Object.hasOwn(favoriteOfferStateLabels, event['offerState']))) ||
      (event['offerPriceCents'] !== undefined &&
        event['offerPriceCents'] !== null &&
        (!Number.isSafeInteger(event['offerPriceCents']) ||
          Number(event['offerPriceCents']) <= 0)) ||
      (event['offerErrorCode'] !== undefined &&
        event['offerErrorCode'] !== null &&
        typeof event['offerErrorCode'] !== 'string')
    )
      throw new MarketplaceResponseError();
    return event as unknown as FavoriteMessageEvent;
  });
  return {
    ...scope,
    enabled: response['enabled'],
    active: response['active'],
    version: Number(response['version']),
    lastCheckedAt: response['lastCheckedAt'] as string | null,
    config,
    events,
  };
}
