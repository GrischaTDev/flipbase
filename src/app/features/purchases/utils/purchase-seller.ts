import { Purchase, Supplier } from '../../../core/models/flipbase.models';
import {
  PurchaseSellerDetails,
  PurchaseSellerType,
} from '../../../core/models/purchase-seller.models';
import { SelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { buildGermanCountryOptions } from './country-options';

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
  'seller_street',
  'seller_address_extra',
  'seller_postal_code',
  'seller_city',
  'seller_country_code',
] as const;

export const SELLER_TYPE_LABELS: Readonly<Record<PurchaseSellerType, string>> = {
  private: 'Privatperson',
  business: 'Unternehmen',
};

export function purchaseSellerLabel(purchase: Pick<Purchase, 'seller_name' | 'supplier'>): string {
  return purchase.seller_name || purchase.supplier?.name || 'Nicht angegeben';
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

/** „Unbekannt“ bleibt leer und wird nie stillschweigend zu „Privatperson“. */
export const PURCHASE_SELLER_TYPE_OPTIONS: readonly SelectOption<PurchaseSellerType | null>[] = [
  { value: null, label: 'Unbekannt' },
  { value: 'private', label: SELLER_TYPE_LABELS.private },
  { value: 'business', label: SELLER_TYPE_LABELS.business },
];

export function purchaseSellerCountryOptions(): readonly SelectOption<string | null>[] {
  return [
    { value: null, label: 'Nicht angegeben' },
    ...buildGermanCountryOptions().map((country) => ({ value: country.code, label: country.name })),
  ];
}

export interface PurchaseSellerDetailRow {
  readonly label: string;
  readonly value: string;
}

/** Nur tatsächlich erfasste Angaben erscheinen; leere Felder werden nicht aufgefüllt. */
export function purchaseSellerDetailRows(purchase: Purchase): readonly PurchaseSellerDetailRow[] {
  const rows: (PurchaseSellerDetailRow | null)[] = [
    purchase.source?.name ? { label: 'Quelle', value: purchase.source.name } : null,
    purchase.supplier_reference
      ? { label: 'Referenznummer', value: purchase.supplier_reference }
      : null,
  ];
  return rows.filter((row): row is PurchaseSellerDetailRow => row !== null);
}
