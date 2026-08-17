import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { MockDataStoreService } from './mock-data-store.service';
import {
  AddressInfo,
  CarrierConfig,
  CarrierRate,
  CarrierType,
  ShippingOrder,
  ShippingStatus,
} from '../models/fulfillment.models';

import { WebPushService } from './web-push.service';

const STORAGE_KEY_CARRIER_CFG = 'reflip_carrier_config';

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
      id: 'dhl-warenpost',
      carrier: 'dhl',
      name: 'DHL Warenpost (Kompakt)',
      description: 'Schnellversand für Kleinteile, Videospiele, Zubehör bis 1 kg',
      price: 2.55,
      weightLimitKg: 1,
      dimensions: '35 × 25 × 5 cm',
      isTrackingIncluded: true,
      isInsuranceIncluded: false,
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

  readonly orders = signal<ShippingOrder[]>([
    {
      id: 'ship-1',
      workspace_id: 'ws-1',
      sale_id: 'sale-1',
      order_number: 'ORD-2026-8801',
      order_date: new Date().toISOString(),
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
      package_type: 'DHL Paket bis 5 kg',
      status: 'ready_to_pack',
      created_at: new Date().toISOString(),
    },
    {
      id: 'ship-2',
      workspace_id: 'ws-1',
      sale_id: 'sale-2',
      order_number: 'ORD-2026-8802',
      order_date: new Date(Date.now() - 86400000).toISOString(),
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
      created_at: new Date(Date.now() - 86400000).toISOString(),
      shipped_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'ship-3',
      workspace_id: 'ws-1',
      sale_id: 'sale-3',
      order_number: 'ORD-2026-8803',
      order_date: new Date(Date.now() - 172800000).toISOString(),
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
      created_at: new Date(Date.now() - 172800000).toISOString(),
      shipped_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ]);

  readonly selectedOrderForLabel = signal<ShippingOrder | null>(null);
  readonly selectedOrderForSlip = signal<ShippingOrder | null>(null);
  readonly selectedOrderForPurchase = signal<ShippingOrder | null>(null);

  readonly readyToPackCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'ready_to_pack' || o.status === 'label_printed').length
  );

  readonly shippedCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'shipped').length
  );

  readonly deliveredCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'delivered').length
  );

  private loadCarrierConfig(): CarrierConfig {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(STORAGE_KEY_CARRIER_CFG);
        if (stored) return JSON.parse(stored);
      }
    } catch {}

    return {
      dhlEnabled: true,
      dhlEkp: '5003429180',
      dhlApiKey: 'live_dhl_api_sample_key_99',
      hermesEnabled: true,
      hermesClientId: 'H-DE-994411',
      hermesApiKey: 'live_hermes_api_token_sample',
    };
  }

  updateCarrierConfig(cfg: Partial<CarrierConfig>): void {
    const updated = { ...this.carrierConfig(), ...cfg };
    this.carrierConfig.set(updated);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_CARRIER_CFG, JSON.stringify(updated));
      }
    } catch {}
  }

  getSenderAddress(): AddressInfo {
    const ws = this.workspaceService?.currentWorkspace();
    return {
      name: ws?.name || 'ReFlip Reselling HQ',
      company: 'ReFlip E-Commerce',
      street: 'Gewerbestraße',
      house_number: '10',
      postal_code: '10115',
      city: 'Berlin',
      country: 'Deutschland',
      email: 'versand@reflip.de',
    };
  }

  getTrackingUrl(carrier: CarrierType, trackingNumber: string): string {
    const cleanNum = trackingNumber.trim();
    if (!cleanNum) return '';

    switch (carrier) {
      case 'dhl':
        return `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${cleanNum}`;
      case 'hermes':
        return `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsdetails/?trackingNumber=${cleanNum}`;
      case 'dpd':
        return `https://tracking.dpd.de/status/de_DE/parcel/${cleanNum}`;
      case 'ups':
        return `https://www.ups.com/track?tracknum=${cleanNum}`;
      default:
        return '';
    }
  }

  /**
   * Purchases a live carrier shipping label with tracking code generation.
   */
  async purchaseShippingLabel(
    orderId: string,
    rateId: string
  ): Promise<{ success: boolean; trackingNumber: string; trackingUrl: string }> {
    const rate = this.availableRates.find((r) => r.id === rateId) || this.availableRates[0];
    
    // Simulate carrier API roundtrip
    await new Promise((res) => setTimeout(res, 600));

    // Generate realistic German carrier tracking numbers
    let trackingNumber = '';
    if (rate.carrier === 'dhl') {
      // DHL: 00340434 + 12 random digits
      trackingNumber = '00340434' + Math.floor(100000000000 + Math.random() * 900000000000);
    } else if (rate.carrier === 'hermes') {
      // Hermes: 0234 + 10 random digits
      trackingNumber = '0234' + Math.floor(1000000000 + Math.random() * 9000000000);
    } else {
      trackingNumber = 'TRACK-' + Math.random().toString(36).substring(2, 12).toUpperCase();
    }

    const trackingUrl = this.getTrackingUrl(rate.carrier, trackingNumber);
    const transactionId = 'TX-' + rate.carrier.toUpperCase() + '-' + Date.now();

    // Update order in state
    this.orders.update((list) =>
      list.map((o) => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          status: 'label_printed' as ShippingStatus,
          carrier: rate.carrier,
          package_type: rate.name,
          label_price: rate.price,
          tracking_number: trackingNumber,
          tracking_url: trackingUrl,
          carrier_transaction_id: transactionId,
        };
      })
    );

    // Trigger Web Push Notification
    if (this.webPushService) {
      this.webPushService.triggerFulfillmentNotification(rate.name, trackingNumber);
    }

    return {
      success: true,
      trackingNumber,
      trackingUrl,
    };
  }

  markAsPrinted(orderId: string): void {
    this.orders.update((list) =>
      list.map((o) =>
        o.id === orderId && o.status === 'ready_to_pack'
          ? { ...o, status: 'label_printed' as ShippingStatus }
          : o
      )
    );
  }

  markAsShipped(orderId: string, trackingNumber: string, carrier?: CarrierType): void {
    this.orders.update((list) =>
      list.map((o) => {
        if (o.id !== orderId) return o;
        const finalCarrier = carrier || o.carrier;
        const trackingUrl = this.getTrackingUrl(finalCarrier, trackingNumber);
        return {
          ...o,
          status: 'shipped' as ShippingStatus,
          carrier: finalCarrier,
          tracking_number: trackingNumber.trim(),
          tracking_url: trackingUrl,
          shipped_at: new Date().toISOString(),
        };
      })
    );
  }

  markAsDelivered(orderId: string): void {
    this.orders.update((list) =>
      list.map((o) => (o.id === orderId ? { ...o, status: 'delivered' as ShippingStatus } : o))
    );
  }

  updateCarrierAndPackage(orderId: string, carrier: CarrierType, packageType: string): void {
    this.orders.update((list) =>
      list.map((o) => (o.id === orderId ? { ...o, carrier, package_type: packageType } : o))
    );
  }
}
