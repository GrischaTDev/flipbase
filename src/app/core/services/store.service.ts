import { Injectable, computed, inject, signal } from '@angular/core';
import { InventoryService } from './inventory.service';
import { SalesService } from './sales.service';
import { WorkspaceService } from './workspace.service';
import { InventoryItem } from '../models/reflip.models';
import { CartItem, CheckoutCustomerInfo, StoreOrder, StoreSettings } from '../models/store.models';

@Injectable({
  providedIn: 'root',
})
export class StoreService {
  private readonly inventoryService = inject(InventoryService);
  private readonly salesService = inject(SalesService);
  private readonly workspaceService = inject(WorkspaceService);

  readonly storeSettings = signal<StoreSettings>({
    storeName: 'ReFlip Store & Second Hand Outlet',
    tagline: 'Geprüfte Gebrauchtware, Elektronik & Schnäppchen mit Käuferschutz',
    shippingFlatRate: 4.99,
    freeShippingThreshold: 50.0,
    currency: 'EUR',
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
  }

  private loadPersistedStoreData(): void {
    try {
      const savedSettings = localStorage.getItem('reflip_store_settings');
      if (savedSettings) {
        this.storeSettings.set({ ...this.storeSettings(), ...JSON.parse(savedSettings) });
      }

      const savedCart = localStorage.getItem('reflip_store_cart');
      if (savedCart) {
        this.cart.set(JSON.parse(savedCart));
      }

      const savedOrders = localStorage.getItem('reflip_store_orders');
      if (savedOrders) {
        this.orders.set(JSON.parse(savedOrders));
      }
    } catch {
      // ignore
    }
  }

  private persistCart(): void {
    try {
      localStorage.setItem('reflip_store_cart', JSON.stringify(this.cart()));
    } catch {
      // ignore
    }
  }

  private persistOrders(): void {
    try {
      localStorage.setItem('reflip_store_orders', JSON.stringify(this.orders()));
    } catch {
      // ignore
    }
  }

  addToCart(item: InventoryItem): void {
    this.cart.update((current) => {
      const existing = current.find((c) => c.item.id === item.id);
      if (existing) {
        return current.map((c) => (c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...current, { item, quantity: 1 }];
    });
    this.persistCart();
    this.isCartOpen.set(true);
  }

  removeFromCart(itemId: string): void {
    this.cart.update((current) => current.filter((c) => c.item.id !== itemId));
    this.persistCart();
  }

  updateQuantity(itemId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeFromCart(itemId);
      return;
    }
    this.cart.update((current) =>
      current.map((c) => (c.item.id === itemId ? { ...c, quantity } : c))
    );
    this.persistCart();
  }

  clearCart(): void {
    this.cart.set([]);
    this.persistCart();
  }

  openCart(): void {
    this.isCartOpen.set(true);
  }

  closeCart(): void {
    this.isCartOpen.set(false);
  }

  /**
   * Places an order and automatically synchronizes inventory & sales in ReFlip OS!
   */
  async placeOrder(customer: CheckoutCustomerInfo): Promise<StoreOrder> {
    const currentCart = this.cart();
    const orderNumber = 'RF-' + Math.floor(100000 + Math.random() * 900000);
    const subtotal = this.cartSubtotal();
    const shippingCost = customer.shippingMethod === 'pickup' ? 0 : this.cartShippingCost();
    const total = subtotal + shippingCost;

    const newOrder: StoreOrder = {
      id: 'order-' + Math.random().toString(36).substring(2, 9),
      orderNumber,
      createdAt: new Date().toISOString(),
      customer,
      items: [...currentCart],
      subtotal,
      shippingCost,
      total,
      status: 'pending',
    };

    // 1. Save order to state
    this.orders.update((prev) => [newOrder, ...prev]);
    this.persistOrders();

    // 2. Automatically synchronize ReFlip inventory: Mark items as sold and book sales!
    for (const cartItem of currentCart) {
      const price = cartItem.item.expected_value ?? cartItem.item.allocated_purchase_cost * 1.5;
      
      // Update inventory item status
      await this.inventoryService.updateItem(cartItem.item.id, {
        status: 'sold',
      });

      // Create sales entry in ReFlip
      await this.salesService.createSale({
        inventory_item_id: cartItem.item.id,
        sale_date: new Date().toISOString().split('T')[0],
        platform: 'custom_store',
        sale_price: price,
        platform_fee: 0, // 0% platform fee on own store!
        shipping_cost: customer.shippingMethod === 'pickup' ? 0 : 4.5,
        other_costs: customer.paymentMethod === 'paypal' ? Number((price * 0.0249 + 0.35).toFixed(2)) : 0,
        external_order_id: orderNumber,
        buyer_notes: `Kunde: ${customer.firstName} ${customer.lastName}, Zahlungsart: ${customer.paymentMethod}`,
      });
    }

    // 3. Clear cart
    this.clearCart();
    this.isCartOpen.set(false);

    return newOrder;
  }
}
