import { negotiationId } from './vinted-negotiation-contracts.ts';
import { readVintedSale } from './vinted-sales.ts';

export interface VintedPreviousConversationSale {
  transactionId: string;
  sellerId: string;
}

export interface VintedConversationSaleRead {
  transactionId: string | null;
  canConfirmWithoutTransaction: boolean;
}

function record(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

/** Bestimmt nur den nötigen Leseabruf; eine fremde Transaktion wird nie freigegeben. */
export function vintedConversationSaleRead(
  input: unknown,
  accountId: string,
  observedAt: string,
  previousSale?: VintedPreviousConversationSale,
): VintedConversationSaleRead {
  const conversation = record(input);
  const unresolved = { transactionId: null, canConfirmWithoutTransaction: false };
  if (!conversation || !negotiationId(conversation['id']) || negotiationId(accountId) !== accountId)
    return unresolved;
  const previousTransactionId = negotiationId(previousSale?.transactionId);
  const knownOwnSale = previousTransactionId !== null && previousSale?.sellerId === accountId;
  const relation = record(conversation?.['transaction']);
  if (!relation)
    return {
      transactionId: null,
      canConfirmWithoutTransaction: !knownOwnSale && conversation['transaction'] == null,
    };
  const transactionId = negotiationId(relation?.['id']);
  if (!transactionId || (knownOwnSale && transactionId !== previousTransactionId))
    return unresolved;
  const sellerIds = [relation['seller_id'], record(relation['seller'])?.['id']].filter(
    (value) => value != null,
  );
  const sides = [relation['current_user_side'], relation['user_side']].filter(
    (value) => value != null,
  );
  const ownSeller = sellerIds.some((value) => negotiationId(value) === accountId);
  const foreignSeller = sellerIds.some((value) => negotiationId(value) !== accountId);
  const sellerSide = sides.includes('seller');
  const buyerSide = sides.includes('buyer');
  if (
    sellerIds.some((value) => negotiationId(value) === null) ||
    sides.some((value) => value !== 'seller' && value !== 'buyer') ||
    (ownSeller && foreignSeller) ||
    (sellerSide && buyerSide) ||
    (ownSeller && buyerSide) ||
    (foreignSeller && sellerSide)
  )
    return unresolved;
  if (foreignSeller || buyerSide)
    return { transactionId: null, canConfirmWithoutTransaction: !knownOwnSale };
  // Alte Verkäuferbelege gelten ausschließlich weiter für dieselbe aktuelle Transaktion.
  const needsTransaction =
    ownSeller ||
    sellerSide ||
    knownOwnSale ||
    readVintedSale(conversation, null, accountId, observedAt) !== null;
  return {
    transactionId: needsTransaction ? transactionId : null,
    canConfirmWithoutTransaction: false,
  };
}

/** Eine bereits gebundene Leseantwort darf Konto oder Transaktion nicht wechseln. */
export function isVintedConversationSaleTransaction(
  input: unknown,
  transactionId: string,
  accountId: string,
): boolean {
  const transaction = record(input);
  return (
    negotiationId(transaction?.['id']) === transactionId &&
    [transaction?.['seller_id'], record(transaction?.['seller'])?.['id']]
      .filter((value) => value != null)
      .every((value) => negotiationId(value) === accountId) &&
    [transaction?.['current_user_side'], transaction?.['user_side']]
      .filter((value) => value != null)
      .every((value) => value === 'seller')
  );
}
