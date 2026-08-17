import { Injectable, computed, inject, signal } from '@angular/core';
import { InventoryService } from './inventory.service';
import { SalesService } from './sales.service';
import { WorkspaceService } from './workspace.service';
import { InventoryItem } from '../models/reflip.models';
import {
  CartItem,
  CheckoutCustomerInfo,
  PaymentGatewayConfig,
  StoreOrder,
  StoreSettings,
} from '../models/store.models';

const STORAGE_KEY_SETTINGS = 'reflip_store_settings';
const STORAGE_KEY_CART = 'reflip_store_cart';
const STORAGE_KEY_ORDERS = 'reflip_store_orders';

@Injectable({
  providedIn: 'root',
})
export class StoreService {
  private readonly inventoryService: InventoryService | null = null;
  private readonly salesService: SalesService | null = null;
  private readonly workspaceService: WorkspaceService | null = null;

  readonly storeSettings = signal<StoreSettings>({
    storeName: 'ReFlip Store & Second Hand Outlet',
    tagline: 'Geprüfte Gebrauchtware, Elektronik & Schnäppchen mit Käuferschutz',
    shippingFlatRate: 4.99,
    freeShippingThreshold: 50.0,
    currency: 'EUR',
    payments: {
      stripeEnabled: true,
      stripePublishableKey: 'pk_test_reflip_live_sample_key_123',
      paypalEnabled: true,
      paypalClientId: 'sb-reflip-merchant-sample-client-id',
      paypalEmail: 'pay@reflip-outlet.de',
      bankTransferEnabled: true,
      bankIban: 'DE45 5001 0517 5555 6666 77',
      bankBic: 'HELA DE FF 500',
      bankAccountHolder: 'ReFlip Reselling GmbH & Co. KG',
      cashOnPickupEnabled: true,
    },
    imprint: {
      owner: 'ReFlip Reselling',
      street: 'Musterstraße 12',
      city: '10115 Berlin',
      email: 'service@reflip-store.de',
      phone: '+49 (0) 30 12345678',
      vatId: 'DE 123456789 (Differenzbesteuert gem. § 25a UStG)',
    },
    noticeText: 'Endpreise inkl. MwSt. (Differenzbesteuerung gem. § 25a UStG bei Gebrauchtwaren)',
  });

  readonly cart = signal<CartItem[]>([]);
  readonly isCartOpen = signal<boolean>(false);
  readonly orders = signal<StoreOrder[]>([]);

  // Computed public store inventory: active non-sold items
  readonly publicProducts = computed<InventoryItem[]>(() => {
    if (!this.inventoryService) return [];
    return this.inventoryService
      .items()
      .filter((i) => i.status !== 'sold' && i.status !== 'returned' && i.status !== 'archived');
  });

  readonly cartItemCount = computed(() => {
    return this.cart().reduce((sum, i) => sum + i.quantity, 0);
  });

  readonly cartSubtotal = computed(() => {
    return this.cart().reduce((sum, i) => {
      const price = i.item.expected_value ?? i.item.allocated_purchase_cost * 1.5;
      return sum + price * i.quantity;
    }, 0);
  });

  readonly cartShippingCost = computed(() => {
    const subtotal = this.cartSubtotal();
    const settings = this.storeSettings();
    if (subtotal === 0) return 0;
    if (subtotal >= settings.freeShippingThreshold) return 0;
    return settings.shippingFlatRate;
  });

  readonly cartTotal = computed(() => {
    return this.cartSubtotal() + this.cartShippingCost();
  });

  constructor() {
    try {
      this.inventoryService = inject(InventoryService, { optional: true });
      this.salesService = inject(SalesService, { optional: true });
      this.workspaceService = inject(WorkspaceService, { optional: true });
    } catch {
      this.inventoryService = null;
      this.salesService = null;
      this.workspaceService = null;
    }
    this.loadPersistedStoreData();
  }

  private loadPersistedStoreData(): void {
    try {
      if (typeof window === 'undefined') return;
      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        this.storeSettings.set({
          ...this.storeSettings(),
          ...parsed,
          payments: { ...this.storeSettings().payments, ...(parsed.payments || {}) },
        });
      }

      const savedCart = localStorage.getItem(STORAGE_KEY_CART);
      if (savedCart) {
        this.cart.set(JSON.parse(savedCart));
      }

      const savedOrders = localStorage.getItem(STORAGE_KEY_ORDERS);
      if (savedOrders) {
        this.orders.set(JSON.parse(savedOrders));
      }
    } catch (e) {
      console.warn('Could not read store data from localStorage', e);
    }
  }

  updateStoreSettings(settings: Partial<StoreSettings>): void {
    const updated = { ...this.storeSettings(), ...settings };
    this.storeSettings.set(updated);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
      }
    } catch {}
  }

  updatePaymentsConfig(payments: Partial<PaymentGatewayConfig>): void {
    const current = this.storeSettings();
    const updated: StoreSettings = {
      ...current,
      payments: { ...current.payments, ...payments },
    };
    this.storeSettings.set(updated);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
      }
    } catch {}
  }

  addToCart(item: InventoryItem, quantity: number = 1): void {
    const current = this.cart();
    const existingIndex = current.findIndex((c) => c.item.id === item.id);

    if (existingIndex > -1) {
      const updated = [...current];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + quantity,
      };
      this.cart.set(updated);
    } else {
      this.cart.set([...current, { item, quantity }]);
    }

    this.persistCart();
    this.isCartOpen.set(true);
  }

  removeFromCart(itemId: string): void {
    this.cart.set(this.cart().filter((c) => c.item.id !== itemId));
    this.persistCart();
  }

  updateQuantity(itemId: string, delta: number): void {
    const current = this.cart();
    const itemIndex = current.findIndex((c) => c.item.id === itemId);
    if (itemIndex === -1) return;

    const newQty = current[itemIndex].quantity + delta;
    if (newQty <= 0) {
      this.removeFromCart(itemId);
    } else {
      const updated = [...current];
      updated[itemIndex] = { ...updated[itemIndex], quantity: newQty };
      this.cart.set(updated);
      this.persistCart();
    }
  }

  clearCart(): void {
    this.cart.set([]);
    this.persistCart();
  }

  private persistCart(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(this.cart()));
      }
    } catch {}
  }

  private persistOrders(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(this.orders()));
      }
    } catch {}
  }

  openCart(): void {
    this.isCartOpen.set(true);
  }

  closeCart(): void {
    this.isCartOpen.set(false);
  }

  /**
   * Simulates processing a Stripe credit card transaction.
   */
  async processStripePayment(
    amount: number,
    cardDetails: { holder: string; last4: string; brand: string }
  ): Promise<{ success: boolean; transactionId: string }> {
    // Simulated async secure payment gateway roundtrip
    await new Promise((res) => setTimeout(res, 50));
    return {
      success: true,
      transactionId: 'ch_stripe_' + Math.random().toString(36).substring(2, 11),
    };
  }

  /**
   * Simulates PayPal Express instant payment confirmation.
   */
  async processPayPalPayment(
    amount: number
  ): Promise<{ success: boolean; transactionId: string }> {
    await new Promise((res) => setTimeout(res, 50));
    return {
      success: true,
      transactionId: 'PAYID-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
    };
  }

  /**
   * Places an order, completes payment and automatically books sale in ReFlip OS!
   */
  async placeOrder(customer: CheckoutCustomerInfo): Promise<StoreOrder> {
    const currentCart = this.cart();
    const orderNumber = 'RF-' + Math.floor(100000 + Math.random() * 900000);
    const subtotal = this.cartSubtotal();
    const shippingCost = customer.shippingMethod === 'pickup' ? 0 : this.cartShippingCost();
    const total = subtotal + shippingCost;

    let paymentStatus: 'paid' | 'pending' | 'failed' = 'pending';
    let paymentId: string | undefined;

    if (customer.paymentMethod === 'stripe_card') {
      const stripeRes = await this.processStripePayment(
        total,
        customer.cardDetails || { holder: 'Customer', last4: '4242', brand: 'Visa' }
      );
      paymentStatus = stripeRes.success ? 'paid' : 'failed';
      paymentId = stripeRes.transactionId;
    } else if (customer.paymentMethod === 'paypal') {
      const ppRes = await this.processPayPalPayment(total);
      paymentStatus = ppRes.success ? 'paid' : 'failed';
      paymentId = ppRes.transactionId;
    } else {
      // bank_transfer / cash_on_pickup
      paymentStatus = 'pending';
      paymentId = 'REF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    const newOrder: StoreOrder = {
      id: 'order-' + Math.random().toString(36).substring(2, 9),
      orderNumber,
      createdAt: new Date().toISOString(),
      customer,
      items: [...currentCart],
      subtotal,
      shippingCost,
      total,
      paymentMethod: customer.paymentMethod,
      paymentStatus,
      paymentId,
      status: paymentStatus === 'paid' ? 'confirmed' : 'pending',
    };

    // 1. Save order to state
    this.orders.update((prev) => [newOrder, ...prev]);
    this.persistOrders();

    // 2. Automatically synchronize ReFlip inventory: Mark items as sold and book sales!
    for (const cartItem of currentCart) {
      const price = cartItem.item.expected_value ?? cartItem.item.allocated_purchase_cost * 1.5;

      // Update inventory item status
      if (this.inventoryService) {
        await this.inventoryService.updateItem(cartItem.item.id, {
          status: 'sold',
        });
      }

      // Calculate realistic gateway fee
      let paymentFee = 0;
      if (customer.paymentMethod === 'stripe_card') {
        paymentFee = Number((price * 0.014 + 0.25).toFixed(2));
      } else if (customer.paymentMethod === 'paypal') {
        paymentFee = Number((price * 0.0249 + 0.35).toFixed(2));
      }

      // Create sales entry in ReFlip with § 25a accounting
      if (this.salesService) {
        await this.salesService.createSale({
          inventory_item_id: cartItem.item.id,
          sale_date: new Date().toISOString().split('T')[0],
          platform: 'custom_store',
          sale_price: price,
          platform_fee: 0, // 0% platform fee on own shop!
          shipping_cost: customer.shippingMethod === 'pickup' ? 0 : 4.5,
          other_costs: paymentFee,
          external_order_id: orderNumber,
          buyer_notes: `Kunde: ${customer.firstName} ${customer.lastName}, Zahlungsart: ${customer.paymentMethod} (${paymentStatus})`,
        });
      }
    }

    // 3. Clear cart
    this.clearCart();
    this.isCartOpen.set(false);

    return newOrder;
  }
}
