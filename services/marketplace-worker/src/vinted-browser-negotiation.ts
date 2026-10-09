import type { Page } from 'playwright';
import type {
  MarketplaceNegotiationCommand,
  MarketplaceNegotiationOffer,
  MarketplaceNegotiationResult,
} from '../../../supabase/functions/_shared/marketplace-negotiation-contracts.d.ts';
import {
  negotiationRecord as record,
  negotiationId as identifier,
  negotiationCents,
  readVintedNegotiationOffer,
  isVintedNegotiationCommand,
  isVintedNegotiationOffer,
  isConfirmedNegotiationOffer,
  type ConfirmedNegotiationOffer,
} from './vinted-negotiation-contracts.ts';
import { readVintedCsrfToken, sendVintedMessage } from './vinted-browser-messages.ts';

export interface NegotiationProviderAdapter {
  read(path: string): Promise<unknown>;
  write(path: string, method: 'PUT' | 'POST', body?: Record<string, unknown>): Promise<unknown>;
  authorize(): Promise<void>;
  sendMessage(
    command: Extract<MarketplaceNegotiationCommand, { kind: 'message' }>,
    authorize: () => Promise<void>,
  ): Promise<MarketplaceNegotiationResult>;
}
class NegotiationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export async function executeVintedNegotiation(
  adapter: NegotiationProviderAdapter,
  accountId: string,
  command: MarketplaceNegotiationCommand,
  sourceOffer: MarketplaceNegotiationOffer | null,
  confirmedOffer: ConfirmedNegotiationOffer | null,
): Promise<MarketplaceNegotiationResult> {
  if (
    !identifier(accountId) ||
    !isVintedNegotiationCommand(command) ||
    (sourceOffer !== null && !isVintedNegotiationOffer(sourceOffer)) ||
    (confirmedOffer !== null && !isConfirmedNegotiationOffer(confirmedOffer)) ||
    (sourceOffer && confirmedOffer) ||
    (command.kind === 'offer' && (sourceOffer || confirmedOffer)) ||
    (confirmedOffer &&
      command.externalConversationId !== confirmedOffer.command.externalConversationId)
  )
    return { outcome: 'failed', errorCode: 'invalid_command' };
  let attempted = false;
  async function identity() {
    await adapter.authorize();
    if (
      identifier(record(record(await adapter.read('/api/v2/users/current'))['user'])['id']) !==
      accountId
    )
      throw new NegotiationError('identity_changed');
  }
  async function context() {
    await identity();
    const conversation = record(
      record(await adapter.read(`/api/v2/conversations/${command.externalConversationId}`))[
        'conversation'
      ],
    );
    if (
      identifier(conversation['id']) !== command.externalConversationId ||
      !Array.isArray(conversation['messages'])
    )
      throw new NegotiationError('conversation_unconfirmed');
    const offerCommand = command.kind === 'offer' ? command : confirmedOffer?.command;
    const expected = offerCommand ?? sourceOffer;
    if (!expected) return conversation;
    const transaction = record(conversation['transaction']),
      item = record(conversation['item']);
    const itemIds = [
      conversation['item_id'],
      item['id'],
      transaction['item_id'],
      ...(Array.isArray(transaction['item_ids']) ? transaction['item_ids'] : []),
    ].flatMap((candidate) => {
      const id = identifier(candidate);
      return id ? [id] : [];
    });
    if (
      identifier(transaction['id']) !== expected.transactionId ||
      (identifier(transaction['seller_id']) ??
        (transaction['current_user_side'] === 'seller' ? accountId : null)) !== accountId ||
      (transaction['current_user_side'] !== undefined &&
        transaction['current_user_side'] !== 'seller') ||
      (identifier(transaction['buyer_id']) ??
        (transaction['current_user_side'] === 'seller'
          ? identifier(record(conversation['opposite_user'])['id'])
          : null)) !== expected.buyerId ||
      identifier(record(conversation['opposite_user'])['id']) !== expected.buyerId ||
      expected.buyerId === accountId ||
      transaction['item_count'] !== 1 ||
      !Array.isArray(transaction['item_ids']) ||
      transaction['item_ids'].length !== 1 ||
      !itemIds.length ||
      itemIds.some((id) => id !== expected.itemId) ||
      conversation['is_bundle'] === true ||
      transaction['is_bundle'] === true ||
      (transaction['item_count'] !== undefined && transaction['item_count'] !== 1) ||
      (Array.isArray(transaction['item_ids']) &&
        (transaction['item_ids'].length !== 1 ||
          identifier(transaction['item_ids'][0]) !== expected.itemId))
    )
      throw new NegotiationError('transaction_changed');
    let publication: Record<string, unknown> | undefined;
    for (let pageNumber = 1; pageNumber <= 25; pageNumber++) {
      const wardrobe = record(
        await adapter.read(`/api/v2/wardrobe/${accountId}/items?page=${pageNumber}&per_page=20`),
      );
      if (
        !Array.isArray(wardrobe['items']) ||
        wardrobe['items'].length > 20 ||
        !Number.isSafeInteger(record(wardrobe['pagination'])['total_pages'])
      )
        throw new NegotiationError('item_unconfirmed');
      publication = wardrobe['items']
        .map(record)
        .find((item) => identifier(item['id']) === expected.itemId);
      if (publication || pageNumber >= Number(record(wardrobe['pagination'])['total_pages'])) break;
    }
    if (
      !publication ||
      publication['is_closed'] !== false ||
      (publication['is_reserved'] === true && confirmedOffer?.command.action !== 'accept')
    )
      throw new NegotiationError('inactive_item');
    if (
      negotiationCents(publication['price']) !== expected.originalPriceCents ||
      record(publication['price'])['currency_code'] !== 'EUR'
    )
      throw new NegotiationError('price_changed');
    const messages = conversation['messages'];
    if (confirmedOffer) {
      const own = messages.map(record).filter((message) => {
        const entity = record(message['entity']);
        return (
          message['entity_type'] ===
            (confirmedOffer.command.action === 'counter'
              ? 'offer_message'
              : 'offer_request_message') &&
          identifier(
            entity[confirmedOffer.command.action === 'counter' ? 'id' : 'offer_request_id'],
          ) === confirmedOffer.externalId
        );
      });
      if (own.length !== 1) throw new NegotiationError('offer_changed');
      const entity = record(own[0]?.['entity']);
      if (
        (confirmedOffer.command.action === 'accept' &&
          (identifier(entity['transaction_id']) !== expected.transactionId ||
            entity['status'] !== 20)) ||
        entity['current'] !== true ||
        identifier(entity['user_id']) !==
          (confirmedOffer.command.action === 'counter' ? accountId : expected.buyerId) ||
        negotiationCents(entity['price']) !==
          (confirmedOffer.command.action === 'counter'
            ? confirmedOffer.command.priceCents
            : expected.offeredPriceCents) ||
        (entity['currency'] ?? record(entity['price'])['currency_code']) !== 'EUR'
      )
        throw new NegotiationError('offer_changed');
    } else {
      const expectedOffer: MarketplaceNegotiationOffer = sourceOffer ?? {
        offerId: expected.offerId,
        transactionId: expected.transactionId,
        itemId: expected.itemId,
        buyerId: expected.buyerId,
        sellerId: accountId,
        originalPriceCents: expected.originalPriceCents,
        offeredPriceCents: expected.offeredPriceCents,
        currency: 'EUR',
        status: 'pending',
      };
      const matches = messages.flatMap((message) => {
        const offer = readVintedNegotiationOffer(message, conversation, accountId);
        return offer ? [offer] : [];
      });
      if (
        matches.length !== 1 ||
        Object.entries(expectedOffer).some(([key, value]) => record(matches[0])[key] !== value)
      )
        throw new NegotiationError('offer_changed');
    }
    return conversation;
  }
  try {
    await context();
    if (command.kind === 'message')
      return await adapter.sendMessage(command, async () => {
        await context();
        await adapter.authorize();
      });
    // Re-read provider state and identity immediately before the write, then recheck the lease.
    await context();
    await identity();
    await adapter.authorize();
    attempted = true;
    const response = record(
      await adapter.write(
        `/api/v2/transactions/${command.transactionId}/${command.action === 'counter' ? 'offers' : `offer_requests/${command.offerId}/${command.action === 'accept' ? 'accept' : 'reject'}`}`,
        command.action === 'counter' ? 'POST' : 'PUT',
        command.action === 'counter' && command.priceCents !== null
          ? { offer: { price: (command.priceCents / 100).toFixed(2), currency: 'EUR' } }
          : undefined,
      ),
    );
    if (response['code'] === 99 || response['message_code'] === 'validation_error')
      return { outcome: 'failed', errorCode: 'provider_rejected' };
    if (command.action === 'counter') {
      const externalId = identifier(record(response['offer'])['id']);
      return externalId && !response['code'] && !response['errors'] && !response['message_code']
        ? { outcome: 'sent', externalId }
        : { outcome: 'outcome_unknown', errorCode: 'offer_unconfirmed' };
    }
    await identity();
    const after = record(
      record(await adapter.read(`/api/v2/conversations/${command.externalConversationId}`))[
        'conversation'
      ],
    );
    const transaction = record(after['transaction']);
    const matches = Array.isArray(after['messages'])
      ? after['messages']
          .map(record)
          .filter(
            (message) =>
              identifier(record(message['entity'])['offer_request_id']) === command.offerId,
          )
      : [];
    const entity = record(matches[0]?.['entity']);
    return identifier(after['id']) === command.externalConversationId &&
      identifier(transaction['id']) === command.transactionId &&
      (identifier(transaction['seller_id']) ??
        (transaction['current_user_side'] === 'seller' ? accountId : null)) === accountId &&
      matches.length === 1 &&
      entity['status'] === (command.action === 'accept' ? 20 : 30) &&
      identifier(entity['transaction_id']) === command.transactionId &&
      identifier(entity['user_id']) === command.buyerId &&
      (entity['currency'] ?? record(entity['price'])['currency_code']) === 'EUR' &&
      negotiationCents(entity['price']) === command.offeredPriceCents
      ? { outcome: 'sent', externalId: command.offerId }
      : { outcome: 'outcome_unknown', errorCode: 'offer_unconfirmed' };
  } catch (error) {
    return {
      outcome: attempted ? 'outcome_unknown' : 'skipped',
      errorCode: error instanceof NegotiationError ? error.code : 'provider_unavailable',
    };
  }
}

export async function sendVintedNegotiation(
  page: Page,
  accountId: string,
  command: MarketplaceNegotiationCommand,
  sourceOffer: MarketplaceNegotiationOffer | null,
  confirmedOffer: ConfirmedNegotiationOffer | null,
  authorize: () => Promise<void>,
): Promise<MarketplaceNegotiationResult> {
  async function request(
    path: string,
    method: 'GET' | 'PUT' | 'POST',
    body?: Record<string, unknown>,
  ) {
    await authorize();
    if (new URL(page.url()).origin !== 'https://www.vinted.de')
      throw new NegotiationError('login_required');
    const token = method === 'GET' ? null : await readVintedCsrfToken(page);
    if (method !== 'GET' && !token) throw new NegotiationError('login_required');
    const response = await page.evaluate(
      async ({ path, method, body, token }) => {
        if (location.origin !== 'https://www.vinted.de') return { status: 401, payload: null };
        const response = await fetch(path, {
          method,
          credentials: 'include',
          redirect: 'error',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            ...(token ? { 'X-CSRF-Token': token } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(10000),
        });
        return {
          status: response.status,
          payload: response.headers.get('content-type')?.includes('application/json')
            ? await response.json().catch(() => null)
            : null,
        };
      },
      { path, method, body, token },
    );
    if (response.status < 200 || response.status >= 300 || response.payload === null)
      throw new NegotiationError(
        response.status === 401
          ? 'login_required'
          : response.status === 403
            ? 'challenge_required'
            : response.status === 429
              ? 'rate_limited'
              : 'provider_unavailable',
      );
    return response.payload as unknown;
  }
  return executeVintedNegotiation(
    {
      authorize,
      read: (path) => request(path, 'GET'),
      write: (path, method, body) => request(path, method, body),
      sendMessage: async (message, check) => {
        const result = await sendVintedMessage(
          page,
          accountId,
          {
            externalConversationId: message.externalConversationId,
            text: message.text,
            attachment: null,
          },
          check,
        );
        return {
          outcome: result.outcome,
          ...(result.externalMessageId ? { externalId: result.externalMessageId } : {}),
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        };
      },
    },
    accountId,
    command,
    sourceOffer,
    confirmedOffer,
  );
}
