import type {
  NegotiationDiscount,
  NegotiationMessageEvent,
  MarketplaceNegotiationEvent,
  VintedNegotiationConfig,
} from './marketplace-negotiation-contracts.d.ts';

export const NEGOTIATION_MESSAGE_EVENTS: readonly NegotiationMessageEvent[] = [
  'accepted',
  'counter',
  'final',
  'after_final',
  'after_acceptance',
  'buyer_accepted',
  'purchased',
];
export const MAX_NEGOTIATION_PRICE_CENTS = 100_000_000;

export function createDefaultNegotiationConfig(): VintedNegotiationConfig {
  return {
    discountType: 'percentage',
    discountValue: 10,
    priceBands: [],
    stages: [50, 80, 100],
    delaySeconds: 0,
    sendOrder: 'offer_first',
    purchaseEnabled: false,
    messages: {
      accepted: [],
      counter: [],
      final: [],
      after_final: [],
      after_acceptance: [],
      buyer_accepted: [],
      purchased: [],
    },
  };
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}

function hasExactKeys(candidate: Record<string, unknown>, expected: readonly string[]): boolean {
  const fields = Object.keys(candidate);
  return fields.length === expected.length && fields.every((field) => expected.includes(field));
}

function isDelay(candidate: unknown): candidate is number {
  return (
    typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate >= 0 &&
    candidate <= 604_800
  );
}

function isDiscount(candidate: Record<string, unknown>): boolean {
  const discount = candidate['discountValue'];
  if (typeof discount !== 'number' || !Number.isFinite(discount) || discount <= 0) return false;
  if (candidate['discountType'] === 'percentage')
    return discount <= 50 && Math.abs(discount * 100 - Math.round(discount * 100)) < 1e-7;
  // Feste Nachlässe sind Eurobeträge; nur Cent-genaue Eingaben sind zulässig.
  return (
    candidate['discountType'] === 'amount' &&
    discount <= 500_000 &&
    Math.abs(discount * 100 - Math.round(discount * 100)) < 1e-7
  );
}

export function isNegotiationConfig(candidate: unknown): candidate is VintedNegotiationConfig {
  if (
    !isRecord(candidate) ||
    !hasExactKeys(candidate, [
      'discountType',
      'discountValue',
      'priceBands',
      'stages',
      'delaySeconds',
      'sendOrder',
      'purchaseEnabled',
      'messages',
    ]) ||
    !isDiscount(candidate)
  )
    return false;
  if (
    !isDelay(candidate['delaySeconds']) ||
    !['offer_first', 'message_first'].includes(String(candidate['sendOrder'])) ||
    typeof candidate['purchaseEnabled'] !== 'boolean'
  )
    return false;
  const bands = candidate['priceBands'];
  if (!Array.isArray(bands) || bands.length > 20) return false;
  let previousLimit = 0;
  for (let index = 0; index < bands.length; index++) {
    const band: unknown = bands[index];
    if (
      !isRecord(band) ||
      !hasExactKeys(band, ['upToCents', 'discountType', 'discountValue']) ||
      !isDiscount(band)
    )
      return false;
    const limit = band['upToCents'];
    if (limit === null) {
      if (index !== bands.length - 1) return false;
    } else {
      if (
        typeof limit !== 'number' ||
        !Number.isSafeInteger(limit) ||
        limit <= previousLimit ||
        limit > MAX_NEGOTIATION_PRICE_CENTS
      )
        return false;
      previousLimit = limit;
    }
  }
  const stages = candidate['stages'];
  if (!Array.isArray(stages) || stages.length < 1 || stages.length > 10 || stages.at(-1) !== 100)
    return false;
  let previousStage = 0;
  for (const stage of stages) {
    if (
      typeof stage !== 'number' ||
      !Number.isInteger(stage) ||
      stage <= previousStage ||
      stage > 100
    )
      return false;
    previousStage = stage;
  }
  const messages = candidate['messages'];
  if (!isRecord(messages) || !hasExactKeys(messages, NEGOTIATION_MESSAGE_EVENTS)) return false;
  for (const event of NEGOTIATION_MESSAGE_EVENTS) {
    const steps = messages[event];
    if (!Array.isArray(steps) || steps.length > 5) return false;
    for (const step of steps) {
      if (
        !isRecord(step) ||
        !hasExactKeys(step, ['templates', 'delaySeconds']) ||
        !isDelay(step['delaySeconds'])
      )
        return false;
      const templates = step['templates'];
      if (
        !Array.isArray(templates) ||
        templates.length < 1 ||
        templates.length > 10 ||
        templates.some(
          (template: unknown) =>
            typeof template !== 'string' ||
            template.trim().length === 0 ||
            [...template].length > 2000 ||
            [...template].some((character) => {
              const code = character.charCodeAt(0);
              return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31);
            }),
        )
      )
        return false;
    }
  }
  return true;
}

export function parseNegotiationConfig(candidate: unknown): VintedNegotiationConfig {
  if (!isNegotiationConfig(candidate)) throw new Error('Ungültige Verhandlungseinstellung');
  return candidate;
}

export function isNegotiationEvent(candidate: unknown): candidate is MarketplaceNegotiationEvent {
  if (
    !isRecord(candidate) ||
    candidate['confirmed'] !== true ||
    !['buyer_accepted', 'purchased'].includes(String(candidate['type'])) ||
    typeof candidate['id'] !== 'string' ||
    !/^[1-9][0-9]{0,31}$/.test(candidate['id']) ||
    typeof candidate['transactionId'] !== 'string' ||
    !/^[1-9][0-9]{0,31}$/.test(candidate['transactionId'])
  )
    return false;
  const fields = ['id', 'type', 'transactionId', 'confirmed'];
  if (hasExactKeys(candidate, fields)) return true;
  if (
    !hasExactKeys(candidate, [...fields, 'originalPriceCents', 'priceCents', 'currency']) ||
    candidate['currency'] !== 'EUR'
  )
    return false;
  const originalPriceCents = candidate['originalPriceCents'];
  const priceCents = candidate['priceCents'];
  return (
    typeof originalPriceCents === 'number' &&
    Number.isSafeInteger(originalPriceCents) &&
    originalPriceCents >= 1 &&
    originalPriceCents <= MAX_NEGOTIATION_PRICE_CENTS &&
    typeof priceCents === 'number' &&
    Number.isSafeInteger(priceCents) &&
    priceCents >= 1 &&
    priceCents <= originalPriceCents
  );
}

export function calculateNegotiationPrices(
  originalPriceCents: number,
  config: VintedNegotiationConfig,
) {
  parseNegotiationConfig(config);
  if (
    !Number.isSafeInteger(originalPriceCents) ||
    originalPriceCents < 1 ||
    originalPriceCents > MAX_NEGOTIATION_PRICE_CENTS
  )
    throw new Error('Ungültiger Artikelpreis');
  const discount: NegotiationDiscount =
    config.priceBands.find(
      (band) => band.upToCents === null || originalPriceCents <= band.upToCents,
    ) ?? config;
  const discountCents =
    discount.discountType === 'amount'
      ? Math.round(discount.discountValue * 100)
      : Math.round((originalPriceCents * discount.discountValue) / 100);
  const minimumPriceCents = originalPriceCents - discountCents;
  if (
    discountCents < 1 ||
    minimumPriceCents < 1 ||
    minimumPriceCents < Math.ceil(originalPriceCents / 2)
  )
    throw new Error('Nachlass liegt außerhalb der Preisgrenze');
  return {
    minimumPriceCents,
    stagePriceCents: config.stages.map(
      (stage) => originalPriceCents - Math.round((discountCents * stage) / 100),
    ),
  };
}

export function decideNegotiation(
  originalPriceCents: number,
  offeredPriceCents: number,
  completedStages: number,
  accepted: boolean,
  config: VintedNegotiationConfig,
) {
  const prices = calculateNegotiationPrices(originalPriceCents, config);
  if (
    !Number.isSafeInteger(offeredPriceCents) ||
    offeredPriceCents < 1 ||
    offeredPriceCents > originalPriceCents ||
    !Number.isInteger(completedStages) ||
    completedStages < 0 ||
    completedStages > config.stages.length
  )
    throw new Error('Ungültiges Käuferangebot');
  if (accepted) return { action: null, event: 'after_acceptance' as const, priceCents: null };
  if (offeredPriceCents >= prices.minimumPriceCents)
    return { action: 'accept' as const, event: 'accepted' as const, priceCents: null };
  if (completedStages === config.stages.length)
    return { action: null, event: 'after_final' as const, priceCents: null };
  const priceCents = prices.stagePriceCents[completedStages];
  if (priceCents === undefined || priceCents <= offeredPriceCents)
    throw new Error('Ungültige Gegenangebotsstufe');
  return {
    action: 'counter' as const,
    event: completedStages + 1 === config.stages.length ? ('final' as const) : ('counter' as const),
    priceCents,
  };
}

export function renderNegotiationTemplate(
  template: string,
  originalPriceCents: number,
  priceCents: number,
  article: string,
): string {
  const formatPrice = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €';
  const text = template
    .replaceAll('{original_price}', formatPrice(originalPriceCents))
    .replaceAll('{price}', formatPrice(priceCents))
    .replaceAll('{article}', article);
  if ([...text].length > 2000 || text.trim().length === 0)
    throw new Error('Ungültige Nachrichtenvorlage');
  return text;
}
