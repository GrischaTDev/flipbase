import { Purchase, Supplier } from '../../../core/models/flipbase.models';

export type PurchaseSellerType = 'private' | 'business';

/**
 * Herkunftsangaben eines Einkaufs. Genau diese Felder darf der Nachtrag auch nach
 * dem Abschluss ändern; die Datenbank prüft dieselbe Liste.
 */
export interface PurchaseSellerDetails {
  source_id: string | null;
  supplier_id: string | null;
  seller_type: PurchaseSellerType | null;
  seller_name: string | null;
  seller_marketplace_username: string | null;
  seller_street: string | null;
  seller_address_extra: string | null;
  seller_postal_code: string | null;
  seller_city: string | null;
  seller_country_code: string | null;
  external_order_id: string | null;
  supplier_reference: string | null;
  original_url: string | null;
}

export type PurchaseSellerSnapshot = Pick<
  PurchaseSellerDetails,
  | 'seller_type'
  | 'seller_name'
  | 'seller_street'
  | 'seller_address_extra'
  | 'seller_postal_code'
  | 'seller_city'
  | 'seller_country_code'
>;

const SNAPSHOT_FIELDS = [
  'seller_type',
  'seller_name',
  'seller_marketplace_username',
  'seller_street',
  'seller_address_extra',
  'seller_postal_code',
  'seller_city',
  'seller_country_code',
  'external_order_id',
] as const;

export const SELLER_TYPE_LABELS: Readonly<Record<PurchaseSellerType, string>> = {
  private: 'Privatperson',
  business: 'Unternehmen',
};

export function purchaseSellerLabel(
  purchase: Pick<Purchase, 'seller_name' | 'seller_marketplace_username' | 'supplier'>,
): string {
  return (
    purchase.seller_name ||
    purchase.seller_marketplace_username ||
    purchase.supplier?.name ||
    'Nicht angegeben'
  );
}

export function hasPurchaseSellerSnapshot(purchase: Partial<Purchase>): boolean {
  return SNAPSHOT_FIELDS.some((field) => Boolean(purchase[field]));
}

export function sellerDetailsFromPurchase(purchase: Purchase): PurchaseSellerDetails {
  return {
    source_id: purchase.source_id ?? null,
    supplier_id: purchase.supplier_id ?? null,
    seller_type: purchase.seller_type ?? null,
    seller_name: purchase.seller_name ?? null,
    seller_marketplace_username: purchase.seller_marketplace_username ?? null,
    seller_street: purchase.seller_street ?? null,
    seller_address_extra: purchase.seller_address_extra ?? null,
    seller_postal_code: purchase.seller_postal_code ?? null,
    seller_city: purchase.seller_city ?? null,
    seller_country_code: purchase.seller_country_code ?? null,
    external_order_id: purchase.external_order_id ?? null,
    supplier_reference: purchase.supplier_reference ?? null,
    original_url: purchase.original_url ?? null,
  };
}

/**
 * Bewusste Übernahme aus einem gespeicherten Verkäufer. Kontaktdaten wie E-Mail
 * oder Telefon gehören nicht zum Einkauf und werden nicht kopiert.
 */
export function sellerSnapshotFromSupplier(supplier: Supplier): PurchaseSellerSnapshot {
  return {
    seller_type: supplier.seller_type ?? null,
    seller_name: supplier.name || null,
    seller_street: supplier.street ?? null,
    seller_address_extra: supplier.address_extra ?? null,
    seller_postal_code: supplier.postal_code ?? null,
    seller_city: supplier.city ?? null,
    seller_country_code: supplier.country_code ?? null,
  };
}

/** Gleiche Regeln wie `normalize_purchase_seller_details` in der Datenbank. */
export function normalizePurchaseSellerDetails(
  details: PurchaseSellerDetails,
): PurchaseSellerDetails {
  const text = (value: string | null): string | null => value?.trim() || null;
  return {
    source_id: text(details.source_id),
    supplier_id: text(details.supplier_id),
    seller_type: details.seller_type ?? null,
    seller_name: text(details.seller_name),
    seller_marketplace_username: text(details.seller_marketplace_username),
    seller_street: text(details.seller_street),
    seller_address_extra: text(details.seller_address_extra),
    seller_postal_code: text(details.seller_postal_code),
    seller_city: text(details.seller_city),
    seller_country_code: text(details.seller_country_code)?.toUpperCase() ?? null,
    external_order_id: text(details.external_order_id),
    supplier_reference: text(details.supplier_reference),
    original_url: text(details.original_url),
  };
}
