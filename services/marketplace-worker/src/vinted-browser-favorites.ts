import type { Page } from 'playwright';
import type {
  MarketplaceFavoriteMessageCommand,
  MarketplaceFavoriteMessageResult,
  MarketplaceFavoriteOfferCommand,
  MarketplaceFavoriteOfferResult,
} from '../../../supabase/functions/_shared/marketplace-message-contracts.d.ts';
import { sendVintedMessage, readVintedCsrfToken } from './vinted-browser-messages.ts';
export interface VintedFavoriteEvent {
  readonly externalId: string;
  readonly actorId: string;
  readonly itemId: string;
  readonly eventAt: string;
}
export async function readVintedFavoriteEvents(
  page: Page,
  accountId: string,
  authorize: () => Promise<void>,
): Promise<VintedFavoriteEvent[]> {
  const source = requestsFor(page, accountId, authorize);
  await source.identify();
  const events = new Map<string, VintedFavoriteEvent>();
  for (let pageNumber = 1; pageNumber <= 2; pageNumber++) {
    const response = await source.request(
      `/web/api/notifications/notifications?page=${pageNumber}&per_page=100&mark_as_read=false`,
    );
    const notifications = response['notifications'];
    if (!Array.isArray(notifications) || notifications.length > 100)
      throw new FavoriteRequestError('invalid_response');
    for (const input of notifications) {
      const notification = record(input);
      if (notification['entry_type'] !== 20) continue;
      const link = typeof notification['link'] === 'string' ? notification['link'] : '';
      const actorId = identifier(
          link.match(/(?:[?&])(?:offering_id|user_id)=([1-9][0-9]{0,31})(?:&|$)/)?.[1],
        ),
        itemId = identifier(notification['subject_id']);
      if (!actorId || !itemId || !/\/(?:want_it|messaging)(?:\/|\?|$)/.test(link)) continue;
      const externalId = notification['id'],
        updatedAt = notification['updated_at'];
      if (
        typeof externalId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(externalId) ||
        typeof updatedAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T/.test(updatedAt) ||
        !Number.isFinite(Date.parse(updatedAt)) ||
        Date.parse(updatedAt) > Date.now() + 60000
      )
        throw new FavoriteRequestError('invalid_response');
      if (actorId !== accountId) {
        const event = { externalId, actorId, itemId, eventAt: new Date(updatedAt).toISOString() };
        const previous = events.get(externalId);
        if (previous && JSON.stringify(previous) !== JSON.stringify(event))
          throw new FavoriteRequestError('invalid_response');
        events.set(externalId, event);
      }
    }
    if (
      notifications.length < 100 ||
      Number(record(response['pagination'])['total_pages']) <= pageNumber
    )
      break;
  }
  await source.identify();
  return [...events.values()].sort((left, right) => left.eventAt.localeCompare(right.eventAt));
}

function record(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}
function identifier(input: unknown): string | null {
  const candidate =
    typeof input === 'number' && Number.isSafeInteger(input) ? String(input) : input;
  return typeof candidate === 'string' && /^[1-9][0-9]{0,31}$/.test(candidate) ? candidate : null;
}
class FavoriteRequestError extends Error {
  readonly code: string;
  readonly rejected: boolean;
  constructor(code: string, rejected = false) {
    super(code);
    this.code = code;
    this.rejected = rejected;
  }
}
function validCommand(accountId: string, command: MarketplaceFavoriteMessageCommand): boolean {
  return (
    !!identifier(accountId) &&
    !!identifier(command.recipientId) &&
    !!identifier(command.itemId) &&
    command.recipientId !== accountId &&
    typeof command.text === 'string' &&
    command.text.trim().length > 0 &&
    command.text.length <= 2000 &&
    ![...command.text].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    })
  );
}
function requestsFor(page: Page, accountId: string, authorize: () => Promise<void>) {
  async function assertAuthorized() {
    try {
      await authorize();
    } catch {
      throw new FavoriteRequestError('authorization_expired');
    }
    try {
      if (new URL(page.url()).origin === 'https://www.vinted.de') return;
    } catch {
      /* Eine unbestätigte Browserseite besitzt keine Versandfreigabe. */
    }
    throw new FavoriteRequestError('login_required');
  }
  async function csrf() {
    await assertAuthorized();
    const token = await readVintedCsrfToken(page);
    if (typeof token !== 'string' || !token.trim() || token.length > 512 || /[\r\n]/.test(token))
      throw new FavoriteRequestError('login_required');
    return token;
  }
  async function request(path: string, body?: Record<string, unknown>, token?: string) {
    await assertAuthorized();
    let response;
    try {
      response = await page.evaluate(
        async ({ path, body, token }) => {
          if (location.origin !== 'https://www.vinted.de')
            return { status: 401, json: false, payload: null };
          const result = await fetch(path, {
            method: body ? 'POST' : 'GET',
            credentials: 'include',
            redirect: 'error',
            cache: 'no-store',
            headers: {
              Accept: 'application/json',
              ...(body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': token ?? '' } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(12000),
          });
          const json = result.headers.get('content-type')?.includes('application/json') ?? false;
          return { status: result.status, json, payload: json ? await result.json() : null };
        },
        { path, body, token },
      );
    } catch {
      throw new FavoriteRequestError('provider_unavailable');
    }
    if (response.status < 200 || response.status >= 300)
      throw new FavoriteRequestError(
        response.status === 401 ? 'login_required' : 'provider_rejected',
        response.status >= 400 && response.status < 500 && response.status !== 408,
      );
    if (!response.json) throw new FavoriteRequestError('invalid_response');
    return record(response.payload);
  }
  async function identify() {
    if (identifier(record((await request('/api/v2/users/current'))['user'])['id']) !== accountId)
      throw new FavoriteRequestError('identity_changed');
  }
  async function item(itemId: string) {
    for (let number = 1; number <= 25; number++) {
      const response = await request(
        `/api/v2/wardrobe/${accountId}/items?page=${number}&per_page=20`,
      );
      const items = response['items'];
      const totalPages = record(response['pagination'])['total_pages'];
      if (
        !Array.isArray(items) ||
        items.length > 20 ||
        !Number.isSafeInteger(totalPages) ||
        Number(totalPages) < number
      )
        throw new FavoriteRequestError('invalid_response');
      const found = items.map(record).find((candidate) => identifier(candidate['id']) === itemId);
      if (found) return found;
      if (number >= Number(totalPages)) return null;
    }
    throw new FavoriteRequestError('source_partial');
  }
  async function hasConversation(recipientId: string) {
    for (let number = 1; number <= 25; number++) {
      const response = await request(`/api/v2/inbox?page=${number}&per_page=20`);
      const conversations = response['conversations'];
      const totalPages = record(response['pagination'])['total_pages'];
      if (
        !Array.isArray(conversations) ||
        conversations.length > 20 ||
        !Number.isSafeInteger(totalPages) ||
        Number(totalPages) < number
      )
        throw new FavoriteRequestError('invalid_response');
      if (
        conversations.some(
          (candidate) =>
            identifier(record(record(candidate)['opposite_user'])['id']) === recipientId,
        )
      )
        return true;
      if (number >= Number(totalPages)) return false;
    }
    throw new FavoriteRequestError('source_partial');
  }
  return { csrf, request, identify, item, hasConversation };
}
export async function sendVintedFavoriteMessage(
  page: Page,
  accountId: string,
  command: MarketplaceFavoriteMessageCommand,
  authorize: () => Promise<void>,
): Promise<MarketplaceFavoriteMessageResult> {
  if (!validCommand(accountId, command)) return { outcome: 'failed', errorCode: 'invalid_command' };
  const requests = requestsFor(page, accountId, authorize);
  let attempted = false;
  try {
    const token = await requests.csrf();
    await requests.identify();
    const item = await requests.item(command.itemId);
    if (!item || item['is_closed'] !== false || item['is_reserved'] === true)
      return { outcome: 'skipped', errorCode: 'inactive_item' };
    if (await requests.hasConversation(command.recipientId))
      return { outcome: 'skipped', errorCode: 'existing_conversation' };
    await requests.identify();
    attempted = true;
    const created = await requests.request(
      '/api/v2/conversations',
      {
        initiator: 'seller_enters_notification',
        item_id: command.itemId,
        opposite_user_id: command.recipientId,
      },
      token,
    );
    const conversationId = identifier(record(created['conversation'])['id']);
    if (!conversationId) throw new FavoriteRequestError('conversation_unconfirmed');
    const conversation = record(
      (await requests.request(`/api/v2/conversations/${conversationId}`))['conversation'],
    );
    if (
      identifier(conversation['id']) !== conversationId ||
      identifier(record(conversation['opposite_user'])['id']) !== command.recipientId ||
      !Array.isArray(conversation['messages'])
    )
      throw new FavoriteRequestError('conversation_unconfirmed');
    const relatedItems = [
      conversation['item_id'],
      record(conversation['item'])['id'],
      record(conversation['transaction'])['item_id'],
    ].flatMap((candidate) => {
      const id = identifier(candidate);
      return id ? [id] : [];
    });
    if (!relatedItems.length || relatedItems.some((id) => id !== command.itemId))
      throw new FavoriteRequestError('conversation_unconfirmed');
    if (conversation['messages'].length)
      return { outcome: 'skipped', errorCode: 'existing_conversation' };
    const result = await sendVintedMessage(
      page,
      accountId,
      { externalConversationId: conversationId, text: command.text, attachment: null },
      authorize,
    );
    if (result.outcome !== 'sent') return result;
    const transactionId = identifier(record(conversation['transaction'])['id']);
    return { ...result, conversationId, ...(transactionId ? { transactionId } : {}) };
  } catch (error) {
    return {
      outcome:
        attempted && !(error instanceof FavoriteRequestError && error.rejected)
          ? 'outcome_unknown'
          : 'failed',
      errorCode: error instanceof FavoriteRequestError ? error.code : 'provider_unavailable',
    };
  }
}
export function favoriteOfferPriceCents(
  originalPriceCents: number,
  offer: MarketplaceFavoriteOfferCommand['offer'],
): number | null {
  if (
    !Number.isSafeInteger(originalPriceCents) ||
    originalPriceCents < 1 ||
    originalPriceCents > 100_000_000 ||
    !offer ||
    Object.keys(offer).some((key) => !['type', 'value'].includes(key)) ||
    !['amount', 'percentage'].includes(offer.type) ||
    !Number.isFinite(offer.value) ||
    offer.value <= 0 ||
    Math.abs(offer.value * 100 - Math.round(offer.value * 100)) > 0.000001 ||
    (offer.type === 'percentage' ? offer.value < 1 || offer.value > 50 : offer.value > 1_000_000)
  )
    return null;
  const discount = Math.round(offer.value * 100);
  const price =
    offer.type === 'amount'
      ? originalPriceCents - discount
      : Math.round((originalPriceCents * (10000 - discount)) / 10000);
  return price > 0 && price < originalPriceCents && price >= Math.ceil(originalPriceCents / 2)
    ? price
    : null;
}
export async function sendVintedFavoriteOffer(
  page: Page,
  accountId: string,
  command: MarketplaceFavoriteOfferCommand,
  authorize: () => Promise<void>,
  confirmPrice: (original: number, offered: number) => Promise<boolean>,
): Promise<MarketplaceFavoriteOfferResult> {
  if (
    !validCommand(accountId, command) ||
    !identifier(command.conversationId) ||
    !identifier(command.transactionId) ||
    !identifier(command.externalMessageId)
  )
    return { outcome: 'failed', errorCode: 'invalid_command' };
  const requests = requestsFor(page, accountId, authorize);
  let attempted = false;
  try {
    const token = await requests.csrf();
    await requests.identify();
    const item = await requests.item(command.itemId);
    if (!item || item['is_closed'] !== false || item['is_reserved'] === true)
      return { outcome: 'skipped', errorCode: 'inactive_item' };
    const price = record(item['price']);
    if (
      price['currency_code'] !== 'EUR' ||
      !/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?$/.test(String(price['amount']))
    )
      return { outcome: 'skipped', errorCode: 'invalid_price' };
    const originalPriceCents = Math.round(Number(price['amount']) * 100);
    const offeredPriceCents = favoriteOfferPriceCents(originalPriceCents, command.offer);
    if (offeredPriceCents === null) return { outcome: 'skipped', errorCode: 'invalid_price' };
    const conversation = record(
      (await requests.request(`/api/v2/conversations/${command.conversationId}`))['conversation'],
    );
    const transaction = record(conversation['transaction']);
    const itemIds = [
      conversation['item_id'],
      record(conversation['item'])['id'],
      transaction['item_id'],
    ].flatMap((candidate) => {
      const id = identifier(candidate);
      return id ? [id] : [];
    });
    const messages = conversation['messages'];
    if (
      identifier(conversation['id']) !== command.conversationId ||
      identifier(record(conversation['opposite_user'])['id']) !== command.recipientId ||
      identifier(transaction['id']) !== command.transactionId ||
      !itemIds.length ||
      itemIds.some((id) => id !== command.itemId) ||
      !Array.isArray(messages) ||
      !messages.some((raw) => {
        const message = record(raw);
        const entity = record(message['entity']);
        return (
          (identifier(message['id']) ?? identifier(entity['id'])) === command.externalMessageId &&
          identifier(entity['user_id']) === accountId &&
          entity['body'] === command.text
        );
      })
    )
      return { outcome: 'skipped', errorCode: 'conversation_unconfirmed' };
    if (!(await confirmPrice(originalPriceCents, offeredPriceCents)))
      return { outcome: 'skipped', errorCode: 'price_unconfirmed' };
    await requests.identify();
    attempted = true;
    const result = await requests.request(
      `/api/v2/transactions/${command.transactionId}/offers`,
      { offer: { currency: 'EUR', price: (offeredPriceCents / 100).toFixed(2) } },
      token,
    );
    const offerId = identifier(record(result['offer'])['id']);
    if (result['code'] === 99 || result['message_code'] === 'validation_error')
      return { outcome: 'failed', errorCode: 'provider_rejected' };
    return offerId && !result['code'] && !result['errors'] && !result['message_code']
      ? { outcome: 'sent', externalOfferId: offerId }
      : { outcome: 'outcome_unknown', errorCode: 'offer_unconfirmed' };
  } catch (error) {
    return {
      outcome:
        attempted && !(error instanceof FavoriteRequestError && error.rejected)
          ? 'outcome_unknown'
          : 'failed',
      errorCode: error instanceof FavoriteRequestError ? error.code : 'provider_unavailable',
    };
  }
}
