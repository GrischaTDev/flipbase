import { InventoryItem } from './reflip.models';

export interface PaymentGatewayConfig {
  stripeEnabled: boolean;
  stripePublishableKey: string;
  paypalEnabled: boolean;
  paypalClientId: string;
  paypalEmail: string;
  bankTransferEnabled: boolean;
  bankIban: string;
  bankBic: string;
  bankAccountHolder: string;
  cashOnPickupEnabled: boolean;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  bannerUrl?: string;
  shippingFlatRate: number;
  freeShippingThreshold: number;
  currency: string;
  payments: PaymentGatewayConfig;
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
  paymentMethod: 'stripe_card' | 'paypal' | 'bank_transfer' | 'cash_on_pickup';
  cardDetails?: {
    holder: string;
    last4: string;
    brand: string;
  };
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
  paymentMethod: 'stripe_card' | 'paypal' | 'bank_transfer' | 'cash_on_pickup';
  paymentStatus: 'paid' | 'pending' | 'failed';
  paymentId?: string;
  status: 'pending' | 'confirmed' | 'shipped';
}
