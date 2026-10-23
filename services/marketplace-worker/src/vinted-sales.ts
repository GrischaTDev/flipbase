import {
  negotiationId as id,
  negotiationProviderTime as time,
} from './vinted-negotiation-contracts.ts';

type SaleState = 'sold' | 'shipped' | 'completed' | 'cancelled' | 'relisted';
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const stateLabels: Record<SaleState, string> = {
  sold: 'Verkauft',
  shipped: 'Versendet',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
  relisted: 'Storniert · wieder eingestellt',
};

/** Ausschließlich gebundene Anbietertransaktionen und Systemereignisse, niemals freie Chattexte. */
export function readVintedSale(
  conversationInput: unknown,
  transactionInput: unknown,
  accountId: string,
  observedAt: string,
  previousSale?: { transactionId: string; sellerId: string },
) {
  const conversation = record(conversationInput),
    transaction = record(transactionInput);
  const relation = record(conversation['transaction']),
    order = record(transaction['order']);
  const transactionId = id(relation['id']),
    conversationId = id(conversation['id']);
  if (
    !transactionId ||
    !conversationId ||
    (transaction['id'] !== undefined && id(transaction['id']) !== transactionId)
  )
    return null;
  const sellerIds = [
    relation['seller_id'],
    record(relation['seller'])['id'],
    transaction['seller_id'],
    record(transaction['seller'])['id'],
  ].filter((value) => value != null);
  const sides = [
    relation['current_user_side'],
    relation['user_side'],
    transaction['current_user_side'],
    transaction['user_side'],
  ].filter((value) => value != null);
  if (
    sellerIds.some((value) => id(value) !== accountId) ||
    sides.some((value) => value !== 'seller')
  )
    return null;

  const events: { state: SaleState; at: string; sellerProof: boolean }[] = [];
  for (const raw of Array.isArray(conversation['messages']) ? conversation['messages'] : []) {
    const message = record(raw),
      entity = record(message['entity']);
    if (
      !['status_message', 'action_message', 'payment_message'].includes(
        String(message['entity_type']),
      )
    )
      continue;
    const at = time(message['created_at_ts'], observedAt);
    if (!at) continue;
    const title = text(entity['title']) ?? text(entity['body']) ?? '';
    const group = message['event_group'],
      type = message['event_type'];
    let state: SaleState | null = null;
    const sold =
      group === 'sale' &&
      ['success', 'success_preparing_shipment'].includes(String(type)) &&
      /^Verkauft(?:$|[! (])/u.test(title);
    if (sold) state = 'sold';
    else if (group === 'cancelation') state = type === 'reuploaded' ? 'relisted' : 'cancelled';
    else if (
      group === 'shipment' &&
      type === 'shipment_completed' &&
      [
        'Der Käufer hat die Bestellung storniert.',
        'Die Transaktion wurde abgebrochen',
        'Du hast die Transaktion abgebrochen',
      ].includes(title)
    )
      state = 'cancelled';
    if (state) events.push({ state, at, sellerProof: sold });
  }
  const previouslyConfirmed =
    previousSale?.transactionId === transactionId && previousSale.sellerId === accountId;
  const sellerProven =
    previouslyConfirmed ||
    sellerIds.length > 0 ||
    sides.length > 0 ||
    events.some((event) => event.sellerProof);
  if (!sellerProven) return null;
  const paymentAt = time(transaction['debit_processed_at'], observedAt);
  const status = text(transaction['status_title']);
  const ordered = id(order['id']) !== null;
  const providerState =
    status === 'Versendet'
      ? 'shipped'
      : ['Transaktion erfolgreich beendet.', 'Zahlung abgeschlossen!'].includes(status ?? '')
        ? 'completed'
        : null;
  if (
    !previouslyConfirmed &&
    !events.some((event) => event.state === 'sold') &&
    !paymentAt &&
    !(
      ordered &&
      (providerState ||
        events.some((event) => event.state === 'cancelled' || event.state === 'relisted'))
    )
  )
    return null;
  if (previouslyConfirmed && !events.length && !providerState && !paymentAt) return null;
  const stateAt = time(transaction['status_updated_at'], observedAt);
  if (providerState && ordered)
    events.push({
      state: providerState,
      at: stateAt ?? paymentAt ?? '1970-01-01T00:00:00.000Z',
      sellerProof: false,
    });
  // Bei Zeitgleichheit gewinnt der endgültigere Zustand, unabhängig von der Reihenfolge der Nachrichten.
  const priority: Record<SaleState, number> = {
    sold: 0,
    shipped: 1,
    completed: 2,
    cancelled: 3,
    relisted: 4,
  };
  events.sort(
    (left, right) =>
      left.at.localeCompare(right.at) || priority[left.state] - priority[right.state],
  );
  const newestFirst = [...events].reverse();
  const latest =
    newestFirst.find((event) => event.state === 'relisted') ??
    newestFirst.find((event) => event.state === 'cancelled') ??
    newestFirst[0];
  const state: SaleState = latest?.state ?? 'sold';
  const soldAt = events.find((event) => event.state === 'sold')?.at ?? paymentAt;
  const rawIds = order['item_ids'] ?? transaction['item_ids'] ?? relation['item_ids'];
  const ids = Array.isArray(rawIds)
    ? [...new Set(rawIds.flatMap((value) => (id(value) ? [id(value)!] : [])))]
    : [];
  const title =
    text(transaction['item_title']) ??
    text(conversation['item_title']) ??
    text(record(conversation['item'])['title']) ??
    'Verkauf';
  const countLabel = title.match(/^(\d+) Artikel$/u);
  const count =
    transaction['items_count'] ??
    transaction['item_count'] ??
    relation['items_count'] ??
    relation['item_count'] ??
    (countLabel ? Number(countLabel[1]) : null);
  const isBundle =
    relation['is_bundle'] === true ||
    transaction['is_bundle'] === true ||
    ids.length > 1 ||
    (typeof count === 'number' && count > 1);
  const itemCount =
    typeof count === 'number' && Number.isSafeInteger(count) && count > 0 && count <= 100
      ? count
      : ids.length > 1
        ? ids.length
        : isBundle
          ? null
          : 1;
  const singleId = id(
    conversation['item_id'] ??
      record(conversation['item'])['id'] ??
      transaction['item_id'] ??
      relation['item_id'],
  );
  const itemIds = ids.length ? ids : !isBundle && itemCount === 1 && singleId ? [singleId] : [];
  const price = record(record(transaction['offer'])['price']);
  const amount =
    typeof price['amount'] === 'number' || typeof price['amount'] === 'string'
      ? Number(price['amount'])
      : NaN;
  const currency =
    typeof price['currency_code'] === 'string' && /^[A-Z]{3}$/u.test(price['currency_code'])
      ? price['currency_code']
      : 'EUR';
  return {
    externalId: transactionId,
    sortAt: latest?.at ?? soldAt ?? '1970-01-01T00:00:00.000Z',
    body: {
      title,
      saleState: state,
      saleStateAt: latest?.at ?? paymentAt,
      sellerId: accountId,
      externalConversationId: conversationId,
      itemIds,
      itemCount,
      isBundle,
      occurredAt: soldAt,
      status: stateLabels[state],
      price: Number.isFinite(amount) && amount >= 0 ? amount : null,
      currency,
      shipmentStatus: text(record(transaction['shipment'])['status_title']),
      imageUrl:
        text(record(relation['item_photo'])['url']) ??
        text(record(conversation['item_photo'])['url']),
    },
  };
}
