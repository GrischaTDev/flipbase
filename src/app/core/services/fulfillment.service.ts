import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { MockDataStoreService } from './mock-data-store.service';
import {
  AddressInfo,
  BundleCandidate,
  CarrierConfig,
  CarrierRate,
  CarrierType,
  ShippingOrder,
  ShippingStatus,
} from '../models/fulfillment.models';
import { WebPushService } from './web-push.service';

const STORAGE_KEY_CARRIER_CFG = 'reflip_carrier_config';
const STORAGE_KEY_SHIPPING_ORDERS = 'reflip_shipping_orders';

@Injectable({
  providedIn: 'root',
})
export class FulfillmentService {
  private readonly supabase: SupabaseService | null = null;
  private readonly workspaceService: WorkspaceService | null = null;
  private readonly mockStore: MockDataStoreService | null = null;
  private readonly webPushService: WebPushService | null = null;

  constructor() {
    try {
      this.supabase = inject(SupabaseService, { optional: true });
      this.workspaceService = inject(WorkspaceService, { optional: true });
      this.mockStore = inject(MockDataStoreService, { optional: true });
      this.webPushService = inject(WebPushService, { optional: true });
    } catch {
      this.supabase = null;
      this.workspaceService = null;
      this.mockStore = null;
      this.webPushService = null;
    }
  }

  readonly availableRates: CarrierRate[] = [
    {
      id: 'dhl-warenpost',
      carrier: 'dhl',
      name: 'DHL Warenpost (Tracking)',
      description: 'Ideal für Kleidung, TCG-Karten, Kleinteile. Bis 35×25×5 cm',
      price: 2.95,
      weightLimitKg: 1,
      dimensions: '35 × 25 × 5 cm',
      isTrackingIncluded: true,
      isInsuranceIncluded: false,
    },
    {
      id: 'dhl-paket-2kg',
      carrier: 'dhl',
      name: 'DHL Paket bis 2 kg',
      description: 'Ideal für Schuhe, Konsolen, Kleingeräte. Bis 60×30×15 cm',
      price: 5.49,
      weightLimitKg: 2,
      dimensions: '60 × 30 × 15 cm',
      isTrackingIncluded: true,
      isInsuranceIncluded: true,
    },
    {
      id: 'dhl-paket-5kg',
      carrier: 'dhl',
      name: 'DHL Paket bis 5 kg',
      description: 'Standard für größere Pakete & Konvolute. Bis 120×60×60 cm',
      price: 6.99,
      weightLimitKg: 5,
      dimensions: '120 × 60 × 60 cm',
      isTrackingIncluded: true,
      isInsuranceIncluded: true,
    },
    {
      id: 'hermes-s',
      carrier: 'hermes',
      name: 'Hermes S-Paket (Haustürzustellung)',
      description: 'Günstiger Paketversand mit Haftung bis 500 €',
      price: 4.95,
      weightLimitKg: 25,
      dimensions: 'Längste + kürzeste Seite bis 50 cm',
      isTrackingIncluded: true,
      isInsuranceIncluded: true,
    },
    {
      id: 'hermes-m',
      carrier: 'hermes',
      name: 'Hermes M-Paket',
      description: 'Mittelgroße Pakete bis 80 cm Gurtmaß',
      price: 6.75,
      weightLimitKg: 25,
      dimensions: 'Längste + kürzeste Seite bis 80 cm',
      isTrackingIncluded: true,
      isInsuranceIncluded: true,
    },
  ];

  readonly carrierConfig = signal<CarrierConfig>(this.loadCarrierConfig());

  readonly orders = signal<ShippingOrder[]>(this.loadPersistedOrders());

  readonly selectedOrderForLabel = signal<ShippingOrder | null>(null);
  readonly selectedOrderForSlip = signal<ShippingOrder | null>(null);
  readonly selectedOrderForPurchase = signal<ShippingOrder | null>(null);
  readonly selectedBundleCandidate = signal<BundleCandidate | null>(null);

  readonly readyToPackCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'ready_to_pack' || o.status === 'label_printed').length
  );

  readonly shippedCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'shipped').length
  );

  readonly deliveredCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'delivered').length
  );

  /**
   * Intelligente Erkennung von Mehrfachbestellungen desselben Kunden für Kombiversand.
   */
  readonly bundleCandidates = computed<BundleCandidate[]>(() => {
    const unfulfilled = this.orders().filter(
      (o) => (o.status === 'ready_to_pack' || o.status === 'label_printed') && !o.is_bundled
    );

    const grouped = new Map<string, ShippingOrder[]>();

    for (const ord of unfulfilled) {
      // Create canonical customer identity key based on name + postal code + street
      const key = `${ord.customer.name.trim().toLowerCase()}_${ord.customer.postal_code.trim()}_${ord.customer.street.trim().toLowerCase()}`;
      const list = grouped.get(key) || [];
      list.push(ord);
      grouped.set(key, list);
    }

    const candidates: BundleCandidate[] = [];

    for (const [key, list] of grouped.entries()) {
      if (list.length > 1) {
        const first = list[0];
        const totalValue = Number(list.reduce((sum, o) => sum + o.sale_price, 0).toFixed(2));

        const individualShippingCost = Number(
          list.reduce((sum, o) => {
            const matchedRate = this.availableRates.find((r) => r.name === o.package_type) || this.availableRates[1];
            return sum + matchedRate.price;
          }, 0).toFixed(2)
        );

        let suggestedRate = this.availableRates[1]; // default 2kg
        if (list.length >= 3 || totalValue > 250) {
          suggestedRate = this.availableRates[2]; // 5kg for multi items
        }

        const bundledShippingCost = suggestedRate.price;
        const potentialSavings = Number(Math.max(0, individualShippingCost - bundledShippingCost).toFixed(2));

        candidates.push({
          customerKey: key,
          customerName: first.customer.name,
          customerCity: `${first.customer.postal_code} ${first.customer.city}`,
          orders: list,
          itemsCount: list.length,
          totalOrderValue: totalValue,
          individualShippingCost,
          suggestedRate,
          bundledShippingCost,
          potentialSavings,
        });
      }
    }

    return candidates;
  });

  private loadPersistedOrders(): ShippingOrder[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY_SHIPPING_ORDERS);
        if (stored) return JSON.parse(stored);
      }
    } catch {}

    const now = new Date();
    return [
      {
        id: 'ship-1',
        workspace_id: 'ws-1',
        sale_id: 'sale-1',
        order_number: 'ORD-2026-8801',
        order_date: now.toISOString(),
        platform: 'kleinanzeigen',
        item_title: 'Sony PlayStation 5 Digital Edition (CFI-1116B)',
        item_sku: 'SKU-PS5-DIG',
        item_condition: 'Sehr gut',
        sale_price: 360.0,
        customer: {
          name: 'Maximilian Weber',
          street: 'Hauptstraße',
          house_number: '42b',
          postal_code: '80331',
          city: 'München',
          country: 'Deutschland',
          email: 'max.weber@beispiel.de',
        },
        carrier: 'dhl',
        package_type: 'DHL Paket bis 2 kg',
        status: 'ready_to_pack',
        created_at: now.toISOString(),
      },
      {
        id: 'ship-bundle-extra',
        workspace_id: 'ws-1',
        sale_id: 'sale-bundle-extra',
        order_number: 'ORD-2026-8805',
        order_date: now.toISOString(),
        platform: 'kleinanzeigen',
        item_title: 'Sony DualSense Wireless Controller Midnight Black',
        item_sku: 'SKU-PS5-CTRL',
        item_condition: 'Wie neu',
        sale_price: 49.0,
        customer: {
          name: 'Maximilian Weber',
          street: 'Hauptstraße',
          house_number: '42b',
          postal_code: '80331',
          city: 'München',
          country: 'Deutschland',
          email: 'max.weber@beispiel.de',
        },
        carrier: 'dhl',
        package_type: 'DHL Paket bis 2 kg',
        status: 'ready_to_pack',
        created_at: now.toISOString(),
      },
      {
        id: 'ship-2',
        workspace_id: 'ws-1',
        sale_id: 'sale-2',
        order_number: 'ORD-2026-8802',
        order_date: new Date(now.getTime() - 86400000).toISOString(),
        platform: 'ebay',
        item_title: 'Bosch Professional Akku-Bohrschrauber GSR 18V-55',
        item_sku: 'SKU-BOSCH-18V',
        item_condition: 'Wie neu',
        sale_price: 75.0,
        customer: {
          name: 'Laura Becker',
          street: 'Kaiserstraße',
          house_number: '17',
          postal_code: '60311',
          city: 'Frankfurt am Main',
          country: 'Deutschland',
          email: 'laura.becker@beispiel.de',
        },
        carrier: 'dhl',
        package_type: 'DHL Paket bis 2 kg',
        tracking_number: '00340434289012345678',
        tracking_url:
          'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434289012345678',
        status: 'shipped',
        created_at: new Date(now.getTime() - 86400000).toISOString(),
        shipped_at: new Date(now.getTime() - 3600000).toISOString(),
      },
      {
        id: 'ship-3',
        workspace_id: 'ws-1',
        sale_id: 'sale-3',
        order_number: 'ORD-2026-8803',
        order_date: new Date(now.getTime() - 172800000).toISOString(),
        platform: 'vinted',
        item_title: 'Vintage Alpha Industries Bomberjacke (Schwarz, L)',
        item_sku: 'SKU-VNT-JACK',
        item_condition: 'Sehr gut',
        sale_price: 65.0,
        customer: {
          name: 'Sophie Wagner',
          street: 'Bergmannstraße',
          house_number: '88',
          postal_code: '10961',
          city: 'Berlin',
          country: 'Deutschland',
          email: 'sophie.wagner@beispiel.de',
        },
        carrier: 'hermes',
        package_type: 'Hermes S-Paket',
        tracking_number: '02345678901234',
        tracking_url:
          'https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsdetails/?trackingNumber=02345678901234',
        status: 'delivered',
        created_at: new Date(now.getTime() - 172800000).toISOString(),
        shipped_at: new Date(now.getTime() - 86400000).toISOString(),
      },
    ];
  }

  private persistOrders(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_SHIPPING_ORDERS, JSON.stringify(this.orders()));
      }
    } catch {}
  }

  private loadCarrierConfig(): CarrierConfig {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY_CARRIER_CFG);
        if (stored) return JSON.parse(stored);
      }
    } catch {}

    return {
      dhlEnabled: true,
      dhlEkp: '5001234567',
      dhlApiKey: 'dhl_sandbox_key_live_2026_demo',
      hermesEnabled: true,
      hermesClientId: 'HERMES-99421',
      hermesApiKey: 'hermes_sec_auth_991823_demo',
    };
  }

  updateCarrierConfig(cfg: Partial<CarrierConfig>): void {
    const updated = { ...this.carrierConfig(), ...cfg };
    this.carrierConfig.set(updated);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_CARRIER_CFG, JSON.stringify(updated));
      }
    } catch {}
  }

  getTrackingUrl(carrier: CarrierType, trackingNumber: string): string {
    if (carrier === 'dhl') {
      return `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${trackingNumber}`;
    }
    if (carrier === 'hermes') {
      return `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsdetails/?trackingNumber=${trackingNumber}`;
    }
    return `https://www.paketverfolgung.de/?id=${trackingNumber}`;
  }

  getSenderAddress(): AddressInfo {
    const wsName = this.workspaceService?.currentWorkspace()?.name || 'ReFlip Reselling HQ';
    return {
      name: wsName,
      company: 'ReFlip E-Commerce Einzelunternehmen',
      street: 'Gewerbestraße',
      house_number: '10',
      postal_code: '10115',
      city: 'Berlin',
      country: 'Deutschland',
      email: 'versand@reflip.de',
      phone: '+49 30 98765432',
    };
  }

  markAsShipped(orderId: string, trackingNumber?: string, carrier: CarrierType = 'dhl'): void {
    const trk = trackingNumber || `TRK-${Date.now()}`;
    const url = this.getTrackingUrl(carrier, trk);

    this.orders.update((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              carrier,
              tracking_number: trk,
              tracking_url: url,
              status: 'shipped' as ShippingStatus,
              shipped_at: new Date().toISOString(),
            }
          : o
      )
    );
    this.persistOrders();
  }

  /**
   * Bundles multiple orders for the same buyer into a single shipping order.
   */
  async bundleOrders(candidate: BundleCandidate, chosenRate?: CarrierRate): Promise<ShippingOrder> {
    const rate = chosenRate || candidate.suggestedRate;
    const orderIds = candidate.orders.map((o) => o.id);
    const itemTitles = candidate.orders.map((o) => o.item_title);
    const firstOrder = candidate.orders[0];
    const totalSalePrice = Number(candidate.orders.reduce((sum, o) => sum + o.sale_price, 0).toFixed(2));

    const bundledOrder: ShippingOrder = {
      id: `ship-bundle-${Date.now()}`,
      workspace_id: firstOrder.workspace_id,
      sale_id: firstOrder.sale_id,
      order_number: `BUNDLE-${candidate.orders.length}x-${firstOrder.order_number}`,
      order_date: new Date().toISOString(),
      platform: firstOrder.platform,
      item_title: `📦 SAMMELPAKET (${candidate.orders.length} Artikel): ${itemTitles.join(' + ')}`,
      item_sku: 'BUNDLE-SKU',
      item_condition: 'Gemischt',
      sale_price: totalSalePrice,
      customer: firstOrder.customer,
      carrier: rate.carrier,
      package_type: rate.name,
      status: 'ready_to_pack',
      created_at: new Date().toISOString(),
      is_bundled: true,
      bundled_order_ids: orderIds,
      bundled_item_titles: itemTitles,
      notes: `Kombiversand für ${candidate.customerName}. Portovorteil: ${candidate.potentialSavings.toFixed(2)} €`,
    };

    // Remove individual unbundled orders and replace with the bundled order
    this.orders.update((prev) => [bundledOrder, ...prev.filter((o) => !orderIds.includes(o.id))]);
    this.persistOrders();

    if (this.webPushService) {
      this.webPushService.sendNotification(`📦 Sammelpaket gebündelt: ${candidate.customerName}`, {
        body: `${candidate.orders.length} Artikel zu 1 Paket zusammengefasst. Ersparnis: ${candidate.potentialSavings.toFixed(2)} €.`,
        tag: `bundle-${bundledOrder.id}`,
      });
    }

    return bundledOrder;
  }

  /**
   * Unbundles a previously bundled order back to individual shipments.
   */
  async unbundleOrder(bundledOrderId: string): Promise<void> {
    const bundled = this.orders().find((o) => o.id === bundledOrderId);
    if (!bundled || !bundled.is_bundled || !bundled.bundled_item_titles) return;

    const restoredOrders: ShippingOrder[] = bundled.bundled_item_titles.map((title, idx) => ({
      id: `ship-restored-${Date.now()}-${idx}`,
      workspace_id: bundled.workspace_id,
      sale_id: bundled.sale_id,
      order_number: `ORD-RESTORED-${idx + 1}`,
      order_date: new Date().toISOString(),
      platform: bundled.platform,
      item_title: title,
      sale_price: Number((bundled.sale_price / bundled.bundled_item_titles!.length).toFixed(2)),
      customer: bundled.customer,
      carrier: 'dhl',
      package_type: 'DHL Paket bis 2 kg',
      status: 'ready_to_pack',
      created_at: new Date().toISOString(),
    }));

    this.orders.update((prev) => [
      ...restoredOrders,
      ...prev.filter((o) => o.id !== bundledOrderId),
    ]);
    this.persistOrders();
  }

  /**
   * Simulates purchasing a live shipping label via Carrier API (DHL/Hermes).
   */
  async purchaseShippingLabel(
    orderOrId: ShippingOrder | string,
    rateOrId: CarrierRate | string
  ): Promise<{ success: boolean; trackingNumber: string; trackingUrl: string; labelPrice: number }> {
    let order: ShippingOrder | undefined;
    if (typeof orderOrId === 'string') {
      order = this.orders().find((o) => o.id === orderOrId);
    } else {
      order = orderOrId;
    }

    let rate: CarrierRate | undefined;
    if (typeof rateOrId === 'string') {
      rate = this.availableRates.find((r) => r.id === rateOrId);
    } else {
      rate = rateOrId;
    }

    if (!order) order = this.orders()[0];
    if (!rate) rate = this.availableRates[1];

    await new Promise((res) => setTimeout(res, 800));

    let trackingNumber = '';
    let trackingUrl = '';

    if (rate.carrier === 'dhl') {
      trackingNumber = `00340434${Math.floor(100000000000 + Math.random() * 900000000000)}`;
      trackingUrl = `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${trackingNumber}`;
    } else if (rate.carrier === 'hermes') {
      trackingNumber = `02${Math.floor(100000000000 + Math.random() * 900000000000)}`;
      trackingUrl = `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsdetails/?trackingNumber=${trackingNumber}`;
    } else {
      trackingNumber = `TRK-${Math.floor(10000000 + Math.random() * 90000000)}`;
      trackingUrl = `https://www.paketverfolgung.de/?id=${trackingNumber}`;
    }

    const transactionId = `TXN-${rate.carrier.toUpperCase()}-${Date.now()}`;

    this.orders.update((prev) =>
      prev.map((o) =>
        o.id === order!.id
          ? {
              ...o,
              carrier: rate!.carrier,
              package_type: rate!.name,
              status: 'label_printed' as ShippingStatus,
              tracking_number: trackingNumber,
              tracking_url: trackingUrl,
              label_price: rate!.price,
              carrier_transaction_id: transactionId,
            }
          : o
      )
    );

    this.persistOrders();

    if (this.webPushService) {
      this.webPushService.sendNotification(`📦 Versandlabel gekauft (${rate.carrier.toUpperCase()})`, {
        body: `${rate.name} für ${order.customer.name} gebucht. Sendungsnummer: ${trackingNumber}`,
        tag: `label-purchase-${order.id}`,
      });
    }

    return {
      success: true,
      trackingNumber,
      trackingUrl,
      labelPrice: rate.price,
    };
  }

  markAsDelivered(orderId: string): void {
    this.updateOrderStatus(orderId, 'delivered');
  }

  updateOrderStatus(orderId: string, status: ShippingStatus): void {
    this.orders.update((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status,
              shipped_at: status === 'shipped' ? new Date().toISOString() : o.shipped_at,
            }
          : o
      )
    );
    this.persistOrders();
  }

  openLabelModal(order: ShippingOrder): void {
    this.selectedOrderForLabel.set(order);
  }

  closeLabelModal(): void {
    this.selectedOrderForLabel.set(null);
  }

  openPackingSlipModal(order: ShippingOrder): void {
    this.selectedOrderForSlip.set(order);
  }

  closePackingSlipModal(): void {
    this.selectedOrderForSlip.set(null);
  }

  openPurchaseModal(order: ShippingOrder): void {
    this.selectedOrderForPurchase.set(order);
  }

  closePurchaseModal(): void {
    this.selectedOrderForPurchase.set(null);
  }
}
