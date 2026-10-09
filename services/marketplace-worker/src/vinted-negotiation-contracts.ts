import type {
  MarketplaceNegotiationCommand,
  MarketplaceNegotiationOffer,
  MarketplaceNegotiationResult,
  MarketplaceNegotiationEvent,
} from '../../../supabase/functions/_shared/marketplace-negotiation-contracts.d.ts';

export function negotiationRecord(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}
export function negotiationId(input: unknown): string | null {
  const candidate =
    typeof input === 'number' && Number.isSafeInteger(input) ? String(input) : input;
  return typeof candidate === 'string' && /^[1-9][0-9]{0,31}$/.test(candidate) ? candidate : null;
}
export function negotiationCents(input: unknown): number | null {
  const candidate = negotiationRecord(input)['amount'] ?? input;
  if (typeof candidate !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(candidate)) return null;
  const cents = Math.round(Number(candidate) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 100_000_000 ? cents : null;
}
export function negotiationProviderTime(input: unknown, observedAt: string): string | null {
  const candidate =
    typeof input === 'string' && /^[0-9]{10,13}$/.test(input) ? Number(input) : input;
  const epoch =
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
      ? candidate < 10_000_000_000
        ? candidate * 1000
        : candidate
      : typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(candidate)
        ? Date.parse(candidate)
        : NaN;
  if (!Number.isFinite(epoch) || epoch <= 0 || epoch > Date.parse(observedAt) + 60_000) return null;
  if (typeof candidate === 'string') {
    const year = Number(candidate.slice(0, 4)),
      month = Number(candidate.slice(5, 7)),
      day = Number(candidate.slice(8, 10)),
      calendar = new Date(Date.UTC(year, month - 1, day));
    if (
      calendar.getUTCFullYear() !== year ||
      calendar.getUTCMonth() !== month - 1 ||
      calendar.getUTCDate() !== day
    )
      return null;
  }
  return new Date(epoch).toISOString();
}
function exact(input: unknown, keys: string[]): boolean {
  const candidate = negotiationRecord(input);
  return (
    Object.keys(candidate).length === keys.length &&
    keys.every((key) => Object.hasOwn(candidate, key))
  );
}
function cents(input: unknown): input is number {
  return (
    typeof input === 'number' && Number.isSafeInteger(input) && input > 0 && input <= 100_000_000
  );
}
export function isVintedNegotiationOffer(input: unknown): input is MarketplaceNegotiationOffer {
  const candidate = negotiationRecord(input);
  return (
    exact(input, [
      'offerId',
      'transactionId',
      'itemId',
      'buyerId',
      'sellerId',
      'originalPriceCents',
      'offeredPriceCents',
      'currency',
      'status',
    ]) &&
    ['offerId', 'transactionId', 'itemId', 'buyerId', 'sellerId'].every(
      (key) => typeof candidate[key] === 'string' && !!negotiationId(candidate[key]),
    ) &&
    candidate['buyerId'] !== candidate['sellerId'] &&
    candidate['status'] === 'pending' &&
    candidate['currency'] === 'EUR' &&
    cents(candidate['originalPriceCents']) &&
    cents(candidate['offeredPriceCents']) &&
    candidate['offeredPriceCents'] <= candidate['originalPriceCents']
  );
}
export function isVintedNegotiationCommand(input: unknown): input is MarketplaceNegotiationCommand {
  const candidate = negotiationRecord(input);
  if (candidate['kind'] === 'message')
    return (
      exact(input, ['kind', 'externalConversationId', 'text']) &&
      typeof candidate['externalConversationId'] === 'string' &&
      !!negotiationId(candidate['externalConversationId']) &&
      typeof candidate['text'] === 'string' &&
      !!candidate['text'].trim() &&
      candidate['text'].length <= 2000 &&
      ![...candidate['text']].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13;
      })
    );
  if (
    !exact(input, [
      'kind',
      'action',
      'externalConversationId',
      'transactionId',
      'itemId',
      'buyerId',
      'offerId',
      'originalPriceCents',
      'offeredPriceCents',
      'priceCents',
      'currency',
    ]) ||
    candidate['kind'] !== 'offer' ||
    !['accept', 'decline', 'counter'].includes(String(candidate['action'])) ||
    candidate['currency'] !== 'EUR' ||
    !['externalConversationId', 'transactionId', 'itemId', 'buyerId', 'offerId'].every(
      (key) => typeof candidate[key] === 'string' && !!negotiationId(candidate[key]),
    ) ||
    !cents(candidate['originalPriceCents']) ||
    !cents(candidate['offeredPriceCents']) ||
    candidate['offeredPriceCents'] > candidate['originalPriceCents']
  )
    return false;
  return candidate['action'] === 'counter'
    ? cents(candidate['priceCents']) &&
        candidate['priceCents'] > candidate['offeredPriceCents'] &&
        candidate['priceCents'] <= candidate['originalPriceCents'] &&
        candidate['priceCents'] >= Math.ceil(candidate['originalPriceCents'] / 2)
    : candidate['priceCents'] === null;
}
export interface ConfirmedNegotiationOffer {
  readonly command: Extract<MarketplaceNegotiationCommand, { kind: 'offer' }>;
  readonly externalId: string;
}
export function isConfirmedNegotiationOffer(input: unknown): input is ConfirmedNegotiationOffer {
  const candidate = negotiationRecord(input);
  return (
    exact(input, ['command', 'externalId']) &&
    isVintedNegotiationCommand(candidate['command']) &&
    candidate['command'].kind === 'offer' &&
    ['counter', 'accept'].includes(candidate['command'].action) &&
    typeof candidate['externalId'] === 'string' &&
    !!negotiationId(candidate['externalId'])
  );
}
export function isVintedNegotiationResult(input: unknown): input is MarketplaceNegotiationResult {
  const candidate = negotiationRecord(input);
  return (
    Object.keys(candidate).every((key) => ['outcome', 'externalId', 'errorCode'].includes(key)) &&
    ['sent', 'failed', 'outcome_unknown', 'skipped'].includes(String(candidate['outcome'])) &&
    (candidate['outcome'] === 'sent'
      ? typeof candidate['externalId'] === 'string' && !!negotiationId(candidate['externalId'])
      : candidate['externalId'] === undefined) &&
    (candidate['errorCode'] === undefined ||
      (typeof candidate['errorCode'] === 'string' && /^[a-z_]{1,80}$/.test(candidate['errorCode'])))
  );
}
export function isVintedNegotiationEvent(input: unknown): input is MarketplaceNegotiationEvent {
  const event = negotiationRecord(input);
  if (
    event['confirmed'] !== true ||
    !['buyer_accepted', 'purchased'].includes(String(event['type'])) ||
    typeof event['id'] !== 'string' ||
    !negotiationId(event['id']) ||
    typeof event['transactionId'] !== 'string' ||
    !negotiationId(event['transactionId'])
  )
    return false;
  return (
    exact(event, ['id', 'type', 'transactionId', 'confirmed']) ||
    (exact(event, [
      'id',
      'type',
      'transactionId',
      'confirmed',
      'originalPriceCents',
      'priceCents',
      'currency',
    ]) &&
      event['currency'] === 'EUR' &&
      cents(event['originalPriceCents']) &&
      cents(event['priceCents']) &&
      event['priceCents'] <= event['originalPriceCents'])
  );
}

/** Only provider identifiers, actor, currency and current single-item state establish an offer. */
export function readVintedNegotiationOffer(
  messageInput: unknown,
  conversationInput: unknown,
  accountId: string,
): MarketplaceNegotiationOffer | null {
  const message = negotiationRecord(messageInput),
    entity = negotiationRecord(message['entity']),
    conversation = negotiationRecord(conversationInput),
    transaction = negotiationRecord(conversation['transaction']),
    item = negotiationRecord(conversation['item']);
  const sellerId =
    negotiationId(transaction['seller_id']) ??
    (transaction['current_user_side'] === 'seller' ? accountId : null);
  const buyerId =
    negotiationId(transaction['buyer_id']) ??
    (transaction['current_user_side'] === 'seller'
      ? negotiationId(negotiationRecord(conversation['opposite_user'])['id'])
      : null);
  const itemId = negotiationId(
    conversation['item_id'] ??
      item['id'] ??
      transaction['item_id'] ??
      (Array.isArray(transaction['item_ids']) && transaction['item_ids'].length === 1
        ? transaction['item_ids'][0]
        : null),
  );
  const offerId = negotiationId(entity['offer_request_id']),
    transactionId = negotiationId(entity['transaction_id']);
  const originalPriceCents = negotiationCents(entity['original_price']),
    offeredPriceCents = negotiationCents(entity['price']);
  const currency = entity['currency'] ?? negotiationRecord(entity['price'])['currency_code'];
  if (
    message['entity_type'] !== 'offer_request_message' ||
    entity['status'] !== 10 ||
    entity['current'] !== true ||
    sellerId !== accountId ||
    (transaction['current_user_side'] !== undefined &&
      transaction['current_user_side'] !== 'seller') ||
    buyerId === accountId ||
    buyerId !== negotiationId(entity['user_id']) ||
    buyerId !== negotiationId(negotiationRecord(conversation['opposite_user'])['id']) ||
    transactionId !== negotiationId(transaction['id']) ||
    transaction['item_count'] !== 1 ||
    !Array.isArray(transaction['item_ids']) ||
    transaction['item_ids'].length !== 1 ||
    !offerId ||
    !transactionId ||
    !itemId ||
    !buyerId ||
    !sellerId ||
    !originalPriceCents ||
    !offeredPriceCents ||
    currency !== 'EUR' ||
    conversation['is_bundle'] === true ||
    transaction['is_bundle'] === true ||
    (transaction['item_count'] !== undefined && transaction['item_count'] !== 1) ||
    (Array.isArray(transaction['item_ids']) &&
      (transaction['item_ids'].length !== 1 ||
        negotiationId(transaction['item_ids'][0]) !== itemId))
  )
    return null;
  const offer = {
    offerId,
    transactionId,
    itemId,
    buyerId,
    sellerId,
    originalPriceCents,
    offeredPriceCents,
    currency: 'EUR' as const,
    status: 'pending' as const,
  };
  return isVintedNegotiationOffer(offer) ? offer : null;
}

/** A debit timestamp establishes payment, unlike checkout, offer acceptance or a translated status. */
export function readVintedNegotiationPurchase(
  transactionInput: unknown,
  conversationInput: unknown,
  accountId: string,
  observedAt: string,
): { event: MarketplaceNegotiationEvent; occurredAt: string } | null {
  const transaction = negotiationRecord(transactionInput),
    conversation = negotiationRecord(conversationInput),
    relation = negotiationRecord(conversation['transaction']),
    order = negotiationRecord(transaction['order']);
  const transactionId = negotiationId(transaction['id']),
    itemId = negotiationId(
      conversation['item_id'] ??
        negotiationRecord(conversation['item'])['id'] ??
        relation['item_id'] ??
        (Array.isArray(relation['item_ids']) && relation['item_ids'].length === 1
          ? relation['item_ids'][0]
          : null),
    );
  const occurredAt =
    typeof transaction['debit_processed_at'] === 'string'
      ? negotiationProviderTime(transaction['debit_processed_at'], observedAt)
      : null;
  if (
    !transactionId ||
    transactionId !== negotiationId(relation['id']) ||
    transaction['user_side'] !== 'seller' ||
    negotiationId(negotiationRecord(transaction['seller'])['id']) !== accountId ||
    (relation['seller_id'] !== undefined && negotiationId(relation['seller_id']) !== accountId) ||
    (relation['current_user_side'] !== undefined && relation['current_user_side'] !== 'seller') ||
    !itemId ||
    !Array.isArray(order['item_ids']) ||
    order['item_ids'].length !== 1 ||
    negotiationId(order['item_ids'][0]) !== itemId ||
    transaction['items_count'] !== 1 ||
    conversation['is_bundle'] === true ||
    typeof occurredAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(occurredAt) ||
    !Number.isFinite(Date.parse(occurredAt)) ||
    Date.parse(occurredAt) > Date.parse(observedAt) + 60_000
  )
    return null;
  const original = negotiationRecord(conversation['item'])['price'],
    offered = negotiationRecord(transaction['offer'])['price'];
  const originalPriceCents = negotiationCents(original),
    priceCents = negotiationCents(offered);
  const prices =
    originalPriceCents &&
    priceCents &&
    priceCents <= originalPriceCents &&
    negotiationRecord(original)['currency_code'] === 'EUR' &&
    negotiationRecord(offered)['currency_code'] === 'EUR'
      ? { originalPriceCents, priceCents, currency: 'EUR' as const }
      : {};
  return {
    event: {
      id: negotiationId(transaction['purchase_id']) ?? transactionId,
      type: 'purchased',
      transactionId,
      confirmed: true,
      ...prices,
    },
    occurredAt: new Date(occurredAt).toISOString(),
  };
}
