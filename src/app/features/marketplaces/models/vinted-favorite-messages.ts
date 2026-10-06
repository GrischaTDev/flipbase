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
      (event['errorCode'] !== null && typeof event['errorCode'] !== 'string')
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
