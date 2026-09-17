import { Purchase, Supplier } from '../../../core/models/flipbase.models';
import {
  PurchaseSellerDetails,
  PurchaseSellerType,
} from '../../../core/models/purchase-seller.models';

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
