import type { AccountScope } from './marketplace.models';
import type {
  EbayCategoryDetails,
  EbayListingCheck,
  EbayListingSettings,
} from '../../../../../supabase/functions/_shared/ebay-listing-creation-contracts';

export function creationRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Ungültige eBay-Antwort.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Ungültige eBay-Antwort.');
  return value;
}
export function creationScope(value: unknown, scope: AccountScope) {
  const result = creationRecord(value);
  if (result['workspaceId'] !== scope.workspaceId || result['connectionId'] !== scope.connectionId)
    throw new Error('Die eBay-Kontoverbindung hat sich geändert.');
  return result;
}
function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error('Ungültige eBay-Liste.');
  return value;
}
export function parseEbayOptions(
  value: unknown,
): readonly { readonly id: string; readonly name: string }[] {
  return list(value).map((value) => {
    const row = creationRecord(value);
    return { id: text(row['id']), name: text(row['name']) };
  });
}
export function parseEbayListingSettings(value: unknown, scope: AccountScope): EbayListingSettings {
  const result = creationScope(value, scope);
  return {
    payment: parseEbayOptions(result['payment']),
    fulfillment: parseEbayOptions(result['fulfillment']),
    returns: parseEbayOptions(result['returns']),
  };
}
export function parseEbayCategoryDetails(value: unknown, scope: AccountScope): EbayCategoryDetails {
  const result = creationScope(value, scope);
  return {
    conditions: parseEbayOptions(result['conditions']),
    aspects: list(result['aspects']).map((value) => {
      const row = creationRecord(value);
      if (
        typeof row['required'] !== 'boolean' ||
        typeof row['multiple'] !== 'boolean' ||
        typeof row['selectionOnly'] !== 'boolean'
      )
        throw new Error('Ungültige eBay-Merkmale.');
      return {
        name: text(row['name']),
        required: row['required'],
        multiple: row['multiple'],
        selectionOnly: row['selectionOnly'],
        values: list(row['values']).map(text),
      };
    }),
  };
}
export function parseEbayListingCheck(
  value: unknown,
  scope: AccountScope,
): EbayListingCheck & { readonly reviewHash: string } {
  const result = creationScope(value, scope);
  if (typeof result['valid'] !== 'boolean' || !/^[a-f0-9]{64}$/.test(String(result['reviewHash'])))
    throw new Error('Ungültige eBay-Prüfung.');
  const listingId = result['listingId'] === null ? null : text(result['listingId']);
  if (listingId !== null && !/^\d{1,20}$/.test(listingId))
    throw new Error('Ungültiges eBay-Inserat.');
  return {
    valid: result['valid'],
    listingId,
    reviewHash: String(result['reviewHash']),
    issues: list(result['issues']).map(text),
    warnings: list(result['warnings']).map(text),
    fees: list(result['fees']).map((value) => {
      const fee = creationRecord(value);
      if (typeof fee['amount'] !== 'number' || !Number.isFinite(fee['amount']) || fee['amount'] < 0)
        throw new Error('Ungültige eBay-Gebühren.');
      return { name: text(fee['name']), amount: fee['amount'], currency: text(fee['currency']) };
    }),
  };
}
