import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { InventoryService } from './inventory.service';
import { WorkspaceService } from './workspace.service';
import { WebPushService } from './web-push.service';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { InventoryItem } from '../models/flipbase.models';
import { Json } from '../models/supabase.types';
import { LoggerService } from './logger.service';
import { SyncStatusService } from './sync-status.service';
import {
  CartItem,
  CheckoutAttempt,
  CheckoutCustomerInfo,
  PaymentGatewayConfig,
  StoreOrder,
  StoreOrderOutcome,
  StoreSettings,
} from '../models/store.models';

const STORAGE_KEY_SETTINGS = 'flipbase_store_settings';
const STORAGE_KEY_CART = 'flipbase_store_cart';
const STORAGE_KEY_ORDERS = 'flipbase_store_orders';

function createDefaultStoreSettings(): StoreSettings {
  return {
    storeName: 'Flipbase Store & Second Hand Outlet',
    tagline: 'Geprüfte Gebrauchtware, Elektronik & Schnäppchen mit Käuferschutz',
    shippingFlatRate: 4.99,
    freeShippingThreshold: 50.0,
    currency: 'EUR',
    payments: {
      stripeEnabled: true,
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
  };
}

export interface StoreConfigMutationResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
  readonly reportedBySyncStatus: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class StoreService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  private readonly syncStatus = inject(SyncStatusService, { optional: true });
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly mockStore = inject(MockDataStoreService, { optional: true });
  private readonly inventoryService = inject(InventoryService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
  private readonly webPushService = inject(WebPushService, { optional: true });

  readonly storeSettings = signal<StoreSettings>(createDefaultStoreSettings());
  readonly loadedWorkspaceId = signal<string | null>(null);
  private loadVersion = 0;

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
        void this.loadFromSupabase(ws?.id ?? '');
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
    const requestedWorkspaceId = workspaceId.trim();
    const loadVersion = (this.loadVersion ?? 0) + 1;
    this.loadVersion = loadVersion;
    if (!requestedWorkspaceId) {
      this.resetWorkspaceData();
      return;
    }
    if (!this.isCurrentWorkspace(requestedWorkspaceId)) return;
    if (!this.supabase || this.mockStore?.isDemoMode()) {
      this.loadedWorkspaceId.set(requestedWorkspaceId);
      return;
    }
    this.resetWorkspaceData();

    try {
      const [settingsRes, ordersRes] = await Promise.all([
        this.supabase.client
          .from('store_settings')
          .select('*')
          .eq('workspace_id', requestedWorkspaceId)
          .maybeSingle(),
        this.supabase.client
          .from('store_orders')
          .select(
            `
            *,
            items:store_order_items(*)
          `,
          )
          .eq('workspace_id', requestedWorkspaceId)
          .order('created_at', { ascending: false }),
      ]);

      if (!this.isCurrentLoad(requestedWorkspaceId, loadVersion)) return;
      if (settingsRes.error || ordersRes.error) {
        throw settingsRes.error ?? ordersRes.error;
      }

      if (settingsRes.data) {
        const d = settingsRes.data;
        const defaults = createDefaultStoreSettings();
        const loadedSettings: StoreSettings = {
          storeName: d.store_name,
          tagline: d.tagline || '',
          shippingFlatRate: Number(d.shipping_flat_rate || 4.99),
          freeShippingThreshold: Number(d.free_shipping_threshold || 50.0),
          currency: d.currency || 'EUR',
          payments: (d.payments as unknown as PaymentGatewayConfig) || defaults.payments,
          imprint: (d.imprint as any) || defaults.imprint,
          noticeText: d.notice_text || defaults.noticeText,
        };
        this.storeSettings.set(loadedSettings);
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(loadedSettings));
          }
        } catch {}
      }

      const mappedOrders: StoreOrder[] = ((ordersRes.data ?? []) as unknown[]).map((o: any) => ({
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
      this.loadedWorkspaceId.set(requestedWorkspaceId);
    } catch (err) {
      if (this.isCurrentLoad(requestedWorkspaceId, loadVersion)) {
        this.logger.error('Verbindungsfehler beim Laden der Store-Daten:', err);
      }
    }
  }

  private resetWorkspaceData(): void {
    this.storeSettings.set(createDefaultStoreSettings());
    this.orders.set([]);
    this.loadedWorkspaceId.set(null);
  }

  private isCurrentWorkspace(workspaceId: string): boolean {
    return !this.workspaceService || this.workspaceService.currentWorkspace()?.id === workspaceId;
  }

  private isCurrentLoad(workspaceId: string, loadVersion: number): boolean {
    return this.loadVersion === loadVersion && this.isCurrentWorkspace(workspaceId);
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

  async updatePaymentsConfig(
    payments: Partial<PaymentGatewayConfig>,
  ): Promise<StoreConfigMutationResult<PaymentGatewayConfig>> {
    const workspaceId = this.workspaceService?.currentWorkspace()?.id ?? null;
    const updatedPayments = { ...this.storeSettings().payments, ...payments };
    const updatedSettings = { ...this.storeSettings(), payments: updatedPayments };
    const persistent = Boolean(this.supabase && !this.mockStore?.isDemoMode());

    if (persistent && !workspaceId)
      return this.storeConfigFehler(new Error('Kein aktiver Workspace.'));
    if (persistent) {
      try {
        const { data, error } = await this.supabase!.client.from('store_settings')
          .upsert(
            {
              workspace_id: workspaceId!,
              store_name: updatedSettings.storeName,
              tagline: updatedSettings.tagline,
              shipping_flat_rate: updatedSettings.shippingFlatRate,
              free_shipping_threshold: updatedSettings.freeShippingThreshold,
              currency: updatedSettings.currency,
              payments: updatedPayments as unknown as Json,
              imprint: updatedSettings.imprint as unknown as Json,
              notice_text: updatedSettings.noticeText,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'workspace_id' },
          )
          .select('payments')
          .single();
        if (error || !data) {
          return this.storeConfigFehler(
            error ?? new Error('Die Datenbank hat keine Shop-Einstellungen zurückgegeben.'),
          );
        }
      } catch (error: unknown) {
        return this.storeConfigFehler(error);
      }
      if (!this.isCurrentWorkspace(workspaceId!)) {
        return {
          data: null,
          error: new Error('Der Workspace wurde während des Speicherns gewechselt.'),
          reportedBySyncStatus: false,
        };
      }
    }

    this.storeSettings.set(updatedSettings);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updatedSettings));
      }
    } catch {}
    return { data: updatedPayments, error: null, reportedBySyncStatus: false };
  }

  private storeConfigFehler(ursache: unknown): StoreConfigMutationResult<PaymentGatewayConfig> {
    const error =
      this.syncStatus?.melde('Speichern der Zahlungsmethoden', ursache) ??
      (ursache instanceof Error ? ursache : new Error(String(ursache)));
    return {
      data: null,
      error,
      reportedBySyncStatus: this.syncStatus?.istZentralGemeldet(error) ?? false,
    };
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

  async placeOrder(
    customer: CheckoutCustomerInfo,
    attempt: CheckoutAttempt,
  ): Promise<StoreOrderOutcome> {
    const currentCart = this.cart();
    if (currentCart.length === 0) {
      return {
        status: 'failed',
        order: null,
        error: new Error('Der Warenkorb ist leer.'),
        problems: [],
      };
    }

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
      id: attempt.orderId,
      orderNumber: attempt.orderNumber,
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

    const ws = this.workspaceService?.currentWorkspace();
    let bestaetigteBestellung = newOrder;
    if (this.supabase && !this.mockStore?.isDemoMode()) {
      if (!ws) return this.fehlgeschlageneBestellung(new Error('Kein aktiver Workspace.'));

      try {
        const { data, error } = await this.supabase.client.rpc('place_store_order', {
          p_workspace_id: ws.id,
          p_order_id: newOrder.id,
          p_order_number: newOrder.orderNumber,
          p_customer: newOrder.customer as unknown as Json,
          p_subtotal: newOrder.subtotal,
          p_shipping_cost: newOrder.shippingCost,
          p_total: newOrder.total,
          p_payment_method: newOrder.paymentMethod,
          p_payment_status: newOrder.paymentStatus,
          // PostgreSQL erlaubt hier NULL; der Generator bildet Funktionsargumente
          // jedoch generell ohne Null-Union ab.
          p_payment_id: (newOrder.paymentId ?? null) as unknown as string,
          p_status: newOrder.status,
          p_sale_date: newOrder.createdAt.slice(0, 10),
          p_buyer_notes: `Kunde: ${customer.firstName} ${customer.lastName}, Zahlungsart: ${customer.paymentMethod} (${paymentStatus})`,
          p_items: currentCart.map((cartItem) => {
            const price =
              cartItem.item.expected_value ?? cartItem.item.allocated_purchase_cost * 1.5;
            const paymentFee =
              customer.paymentMethod === 'stripe_card'
                ? Number((price * 0.014 + 0.25).toFixed(2))
                : customer.paymentMethod === 'paypal'
                  ? Number((price * 0.0249 + 0.35).toFixed(2))
                  : 0;
            return {
              inventory_item_id: cartItem.item.id,
              item_title: cartItem.item.title,
              quantity: cartItem.quantity,
              price,
              payment_fee: paymentFee,
            };
          }) as unknown as Json,
        });

        if (error || !data) {
          return this.fehlgeschlageneBestellung(
            error ?? new Error('Die Datenbank hat keine Bestellung zurückgegeben.'),
          );
        }

        bestaetigteBestellung = {
          ...newOrder,
          id: data.id,
          orderNumber: data.order_number,
          createdAt: data.created_at,
          paymentStatus: data.payment_status as StoreOrder['paymentStatus'],
          status: data.status as StoreOrder['status'],
        };
      } catch (error: unknown) {
        return this.fehlgeschlageneBestellung(error);
      }
    }

    this.orders.update((orders) => {
      const ohneDuplikat = orders.filter((order) => order.id !== bestaetigteBestellung.id);
      return [bestaetigteBestellung, ...ohneDuplikat];
    });
    this.persistOrders();
    this.clearCart();
    this.isCartOpen.set(false);

    try {
      this.webPushService?.triggerShopOrderNotification(
        bestaetigteBestellung.orderNumber,
        `${customer.firstName} ${customer.lastName}`,
        bestaetigteBestellung.total,
      );
    } catch (error: unknown) {
      const problem = error instanceof Error ? error : new Error(String(error));
      return {
        status: 'partial',
        order: bestaetigteBestellung,
        error: null,
        problems: [{ message: 'Interne Benachrichtigung fehlgeschlagen.', error: problem }],
      };
    }

    return {
      status: 'success',
      order: bestaetigteBestellung,
      error: null,
      problems: [],
    };
  }

  private fehlgeschlageneBestellung(ursache: unknown): StoreOrderOutcome {
    const error =
      ursache instanceof Error && this.syncStatus?.istZentralGemeldet(ursache)
        ? ursache
        : (this.syncStatus?.melde('Speichern der Bestellung', ursache) ??
          (ursache instanceof Error ? ursache : new Error(String(ursache))));
    return { status: 'failed', order: null, error, problems: [] };
  }
}
