import { InventoryItem } from './reflip.models';

export interface StoreSettings {
  storeName: string;
  tagline: string;
  bannerUrl?: string;
  shippingFlatRate: number;
  freeShippingThreshold: number;
  currency: string;
  imprint: {
    owner: string;
    street: string;
    city: string;
    email: string;
    phone?: string;
    vatId?: string;
  };
  noticeText?: string;
}

export interface CartItem {
  item: InventoryItem;
  quantity: number;
}

export interface CheckoutCustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  country: string;
  shippingMethod: 'dhl_standard' | 'hermes_standard' | 'pickup';
  paymentMethod: 'paypal' | 'bank_transfer' | 'cash_on_pickup';
  notes?: string;
}

export interface StoreOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  customer: CheckoutCustomerInfo;
  items: CartItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  status: 'pending' | 'confirmed' | 'shipped';
}
