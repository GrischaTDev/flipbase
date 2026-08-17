export type CarrierType = 'dhl' | 'hermes' | 'dpd' | 'ups' | 'pickup';
export type ShippingStatus = 'ready_to_pack' | 'label_printed' | 'shipped' | 'delivered';

export interface AddressInfo {
  name: string;
  company?: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface CarrierRate {
  id: string;
  carrier: CarrierType;
  name: string;
  description: string;
  price: number;
  weightLimitKg: number;
  dimensions: string;
  isTrackingIncluded: boolean;
  isInsuranceIncluded: boolean;
}

export interface CarrierConfig {
  dhlEnabled: boolean;
  dhlEkp: string; // DHL Kundennummer (10- oder 14-stellig)
  dhlApiKey: string;
  hermesEnabled: boolean;
  hermesClientId: string;
  hermesApiKey: string;
}

export interface ShippingOrder {
  id: string;
  workspace_id: string;
  sale_id: string;
  order_number: string;
  order_date: string;
  platform: string;
  item_title: string;
  item_sku?: string;
  item_condition?: string;
  sale_price: number;
  customer: AddressInfo;
  carrier: CarrierType;
  package_type: string; // e.g. 'DHL Paket 2kg', 'DHL Warenpost', 'Hermes S-Paket'
  tracking_number?: string;
  tracking_url?: string;
  status: ShippingStatus;
  notes?: string;
  label_price?: number;
  carrier_transaction_id?: string;
  created_at: string;
  shipped_at?: string;
  is_bundled?: boolean;
  bundled_order_ids?: string[];
  bundled_item_titles?: string[];
}

export interface BundleCandidate {
  customerKey: string;
  customerName: string;
  customerCity: string;
  orders: ShippingOrder[];
  itemsCount: number;
  totalOrderValue: number;
  individualShippingCost: number;
  suggestedRate: CarrierRate;
  bundledShippingCost: number;
  potentialSavings: number;
}
