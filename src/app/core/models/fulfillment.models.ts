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
  created_at: string;
  shipped_at?: string;
}
