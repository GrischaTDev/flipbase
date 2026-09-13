import { InventoryItem } from './flipbase.models';

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

/** Einheitliche Referenz für Mengenprodukte und nachverfolgte Einzelstücke im Shop. */
export interface SellableItemRef {
  readonly kind: 'catalog_product' | 'inventory_item';
  readonly id: string;
  readonly title: string;
  readonly workspaceId?: string;
  readonly description?: string | null;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
  readonly urlHandle?: string | null;
  readonly thumbnailPath?: string | null;
  readonly ean?: string | null;
  readonly conditionNotes?: string | null;
  readonly availableQuantity: number;
  readonly unitPrice?: number;
  readonly brand?: string | null;
  readonly model?: string | null;
  readonly category?: string | null;
  readonly sku?: string | null;
  readonly condition?: InventoryItem['condition'];
  readonly media?: InventoryItem['media'];
  readonly created_at?: string;
}

export interface SellableCartItem {
  item: SellableItemRef;
  quantity: number;
  unitPrice: number;
}

/** Kompatibilität für vor dem Mengenartikelmodell gespeicherte Warenkörbe. */
export interface LegacyCartItem {
  item: InventoryItem;
  quantity: number;
  unitPrice?: number;
}

export type CartItem = SellableCartItem | LegacyCartItem;

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

/** Stabile Kennungen für alle Wiederholungen derselben Checkout-Aktion. */
export interface CheckoutAttempt {
  readonly orderId: string;
  readonly orderNumber: string;
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

export interface StoreOrderProblem {
  readonly message: string;
  readonly error: Error;
}

export type StoreOrderOutcome =
  | {
      readonly status: 'success';
      readonly order: StoreOrder;
      readonly error: null;
      readonly problems: readonly [];
    }
  | {
      readonly status: 'partial';
      readonly order: StoreOrder;
      readonly error: null;
      readonly problems: readonly StoreOrderProblem[];
    }
  | {
      readonly status: 'failed';
      readonly order: null;
      readonly error: Error;
      readonly problems: readonly [];
    };
