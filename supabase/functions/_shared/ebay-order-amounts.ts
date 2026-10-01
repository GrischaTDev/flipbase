import type { EbayMoney } from './ebay-order-import-contracts.ts';

// numeric(12,2) ist der bestehende Verkaufsvertrag.
export const MAX_EBAY_CENTS = 999_999_999_999;
export function isEbayCents(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_EBAY_CENTS
  );
}
export function parseEbayMoney(value: unknown): EbayMoney | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row['value'] !== 'string' ||
    !/^\d+(?:\.\d{1,2})?$/.test(row['value']) ||
    typeof row['currency'] !== 'string' ||
    !/^[A-Z]{3}$/.test(row['currency'])
  )
    return null;
  const [whole, fraction = ''] = row['value'].split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return isEbayCents(cents) ? { currency: row['currency'], cents } : null;
}
export function splitEbayLineAmount(
  cents: number,
  quantity: number,
): readonly { quantity: number; unitCents: number }[] {
  if (
    !isEbayCents(cents) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 2_147_483_647 ||
    cents < quantity
  )
    throw new Error('invalid_line_amount');
  const base = Math.floor(cents / quantity);
  const remainder = cents % quantity;
  return remainder === 0
    ? [{ quantity, unitCents: base }]
    : [
        { quantity: quantity - remainder, unitCents: base },
        { quantity: remainder, unitCents: base + 1 },
      ];
}
