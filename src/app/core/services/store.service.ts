import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { InventoryService } from './inventory.service';
import { SalesService } from './sales.service';
import { WorkspaceService } from './workspace.service';
import { WebPushService } from './web-push.service';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { InventoryItem } from '../models/flipbase.models';
import { Json } from '../models/supabase.types';
import { LoggerService } from './logger.service';
import {
  CartItem,
  CheckoutCustomerInfo,
  PaymentGatewayConfig,
  StoreOrder,
  StoreSettings,
} from '../models/store.models';

const STORAGE_KEY_SETTINGS = 'flipbase_store_settings';
const STORAGE_KEY_CART = 'flipbase_store_cart';
const STORAGE_KEY_ORDERS = 'flipbase_store_orders';

@Injectable({
  providedIn: 'root',
})
export class StoreService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly mockStore = inject(MockDataStoreService, { optional: true });
  private readonly inventoryService = inject(InventoryService, { optional: true });
  private readonly salesService = inject(SalesService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
  private readonly webPushService = inject(WebPushService, { optional: true });

  readonly storeSettings = signal<StoreSettings>({
    storeName: 'Flipbase Store & Second Hand Outlet',
    tagline: 'Geprüfte Gebrauchtware, Elektronik & Schnäppchen mit Käuferschutz',
    shippingFlatRate: 4.99,
    freeShippingThreshold: 50.0,
    currency: 'EUR',
    payments: {
      stripeEnabled: true,
      // Der veroeffentlichbare Stripe-Schluessel darf im Frontend stehen.
      // Der geheime Schluessel niemals - der gehoert in eine Edge Function.
      stripePublishableKey: '',
      paypalEnabled: true,
      paypalClientId: '',
      paypalEmail: 'pay@flipbase-outlet.de',
      bankTransferEnabled: true,
      bankIban: 'DE45 5001 0517 5555 6666 77',
      bankBic: 'HELA DE FF 500',
      bankAccountHolder: 'Flipbase Reselling GmbH & Co. KG',
      cashOnPickupEnabled: true,
    },
    imprint: {
      owner: 'Flipbase Reselling',
      street: 'Musterstraße 12',
      city: '10115 Berlin',
      email: 'service@flipbase-store.de',
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
    this.loadPersistedStoreData();
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService?.currentWorkspace();
        if (ws) {
          this.loadFromSupabase(ws.id);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
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
      this.logger.error('Fehler beim Laden gespeicherter Shop-Daten:', e);
    }
  }

  async loadFromSupabase(workspaceId: string): Promise<void> {
    if (!this.supabase || this.mockStore?.isDemoMode()) return;

    try {
      const [settingsRes, ordersRes] = await Promise.all([
        this.supabase.client
          .from('store_settings')
          .select('*')
          .eq('workspace_id', workspaceId)
          .maybeSingle(),
        this.supabase.client
          .from('store_orders')
          .select(
            `
            *,
            items:store_order_items(*)
          `,
          )
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false }),
      ]);

      if (settingsRes.data) {
        const d = settingsRes.data;
        const loadedSettings: StoreSettings = {
          storeName: d.store_name,
          tagline: d.tagline || '',
          shippingFlatRate: Number(d.shipping_flat_rate || 4.99),
          freeShippingThreshold: Number(d.free_shipping_threshold || 50.0),
          currency: d.currency || 'EUR',
          payments:
            (d.payments as unknown as PaymentGatewayConfig) || this.storeSettings().payments,
          imprint: (d.imprint as any) || this.storeSettings().imprint,
          noticeText: d.notice_text || this.storeSettings().noticeText,
        };
        this.storeSettings.set(loadedSettings);
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(loadedSettings));
          }
        } catch {}
      }

      if (ordersRes.data && ordersRes.data.length > 0) {
        const mappedOrders: StoreOrder[] = (ordersRes.data as unknown[]).map((o: any) => ({
          id: o.id,
          orderNumber: o.order_number,
          createdAt: o.created_at,
          customer: o.customer as CheckoutCustomerInfo,
          items: ((o.items || []) as unknown[]).map((it: any) => ({
            item: {
              id: it.inventory_item_id || '',
              workspace_id: o.workspace_id,
              title: it.item_title,
              condition: 'Gebraucht',
              status: 'sold',
              allocated_purchase_cost: Number(it.price || 0),
            } as unknown as InventoryItem,
            quantity: it.quantity,
          })),
          subtotal: Number(o.subtotal || 0),
          shippingCost: Number(o.shipping_cost || 0),
          total: Number(o.total || 0),
          paymentMethod: o.payment_method,
          paymentStatus: o.payment_status,
          paymentId: o.payment_id || undefined,
          status: o.status,
        }));
        this.orders.set(mappedOrders);
        this.persistOrders();
      }
    } catch (err) {
      this.logger.error('Verbindungsfehler beim Laden der Store-Daten:', err);
    }
  }

  updateSettings(settings: Partial<StoreSettings>): void {
    const updated = {
      ...this.storeSettings(),
      ...settings,
      payments: { ...this.storeSettings().payments, ...(settings.payments || {}) },
    };
    this.storeSettings.set(updated);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
      }
    } catch {}

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      this.supabase.client
        .from('store_settings')
        .upsert(
          {
            workspace_id: ws.id,
            store_name: updated.storeName,
            tagline: updated.tagline,
            shipping_flat_rate: updated.shippingFlatRate,
            free_shipping_threshold: updated.freeShippingThreshold,
            currency: updated.currency,
            payments: updated.payments as unknown as Json,
            imprint: updated.imprint as unknown as Json,
            notice_text: updated.noticeText,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id' },
        )
        .then(({ error }) => {
          if (error) this.logger.error('Fehler beim Speichern der Shop-Einstellungen:', error);
        });
    }
  }

  updatePaymentsConfig(payments: Partial<PaymentGatewayConfig>): void {
    this.updateSettings({
      payments: { ...this.storeSettings().payments, ...payments },
    });
  }

  addToCart(item: InventoryItem, quantity = 1): void {
    const current = this.cart();
    const existing = current.find((i) => i.item.id === item.id);

    if (existing) {
      this.cart.update((items) =>
        items.map((i) => (i.item.id === item.id ? { ...i, quantity: i.quantity + quantity } : i)),
      );
    } else {
      this.cart.update((items) => [...items, { item, quantity }]);
    }
    this.persistCart();
  }

  updateQuantity(itemId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeFromCart(itemId);
      return;
    }
    this.cart.update((items) => items.map((i) => (i.item.id === itemId ? { ...i, quantity } : i)));
    this.persistCart();
  }

  removeFromCart(itemId: string): void {
    this.cart.update((items) => items.filter((i) => i.item.id !== itemId));
    this.persistCart();
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

  async processStripePayment(
    _amount: number,
    _cardDetails: { holder: string; last4: string; brand: string },
  ): Promise<{ success: boolean; transactionId: string }> {
    await new Promise((res) => setTimeout(res, 50));
    return {
      success: true,
      transactionId: 'ch_stripe_' + Math.random().toString(36).substring(2, 11),
    };
  }

  async processPayPalPayment(
    _amount: number,
  ): Promise<{ success: boolean; transactionId: string }> {
    await new Promise((res) => setTimeout(res, 50));
    return {
      success: true,
      transactionId: 'PAYID-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
    };
  }

  async placeOrder(customer: CheckoutCustomerInfo): Promise<StoreOrder> {
    const currentCart = this.cart();
    const orderNumber = 'RF-' + Math.floor(100000 + Math.random() * 900000);
    const subtotal = this.cartSubtotal();
    const shippingCost = customer.shippingMethod === 'pickup' ? 0 : this.cartShippingCost();
    const total = subtotal + shippingCost;

    let paymentStatus: 'paid' | 'pending' | 'failed';
    let paymentId: string | undefined;

    if (customer.paymentMethod === 'stripe_card') {
      const stripeRes = await this.processStripePayment(
        total,
        customer.cardDetails || { holder: 'Customer', last4: '4242', brand: 'Visa' },
      );
      paymentStatus = stripeRes.success ? 'paid' : 'failed';
      paymentId = stripeRes.transactionId;
    } else if (customer.paymentMethod === 'paypal') {
      const ppRes = await this.processPayPalPayment(total);
      paymentStatus = ppRes.success ? 'paid' : 'failed';
      paymentId = ppRes.transactionId;
    } else {
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

    // 2. Persist to Supabase
    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      this.supabase.client
        .from('store_orders')
        .insert({
          workspace_id: ws.id,
          order_number: newOrder.orderNumber,
          customer: newOrder.customer as unknown as Json,
          subtotal: newOrder.subtotal,
          shipping_cost: newOrder.shippingCost,
          total: newOrder.total,
          payment_method: newOrder.paymentMethod,
          payment_status: newOrder.paymentStatus,
          payment_id: newOrder.paymentId,
          status: newOrder.status,
        })
        .select()
        .single()
        .then(({ data: dbOrder }) => {
          if (dbOrder) {
            const itemInserts = currentCart.map((c) => ({
              store_order_id: dbOrder.id,
              inventory_item_id:
                c.item.id.startsWith('item-') && !c.item.id.includes('demo') ? c.item.id : null,
              item_title: c.item.title,
              quantity: c.quantity,
              price: c.item.expected_value ?? c.item.allocated_purchase_cost * 1.5,
            }));
            this.supabase?.client.from('store_order_items').insert(itemInserts);
          }
        });
    }

    // 3. Automatically synchronize Flipbase inventory
    for (const cartItem of currentCart) {
      const price = cartItem.item.expected_value ?? cartItem.item.allocated_purchase_cost * 1.5;

      if (this.inventoryService) {
        await this.inventoryService.updateItem(cartItem.item.id, {
          status: 'sold',
        });
      }

      let paymentFee = 0;
      if (customer.paymentMethod === 'stripe_card') {
        paymentFee = Number((price * 0.014 + 0.25).toFixed(2));
      } else if (customer.paymentMethod === 'paypal') {
        paymentFee = Number((price * 0.0249 + 0.35).toFixed(2));
      }

      if (this.salesService) {
        await this.salesService.createSale({
          inventory_item_id: cartItem.item.id,
          sale_date: new Date().toISOString().split('T')[0],
          platform: 'custom_store',
          sale_price: price,
          platform_fee: 0,
          shipping_cost: customer.shippingMethod === 'pickup' ? 0 : 4.5,
          other_costs: paymentFee,
          external_order_id: orderNumber,
          buyer_notes: `Kunde: ${customer.firstName} ${customer.lastName}, Zahlungsart: ${customer.paymentMethod} (${paymentStatus})`,
        });
      }
    }

    // 4. Clear cart
    this.clearCart();
    this.isCartOpen.set(false);

    // 5. Trigger Web Push Notification
    if (this.webPushService) {
      this.webPushService.triggerShopOrderNotification(
        orderNumber,
        `${customer.firstName} ${customer.lastName}`,
        total,
      );
    }

    return newOrder;
  }
}
