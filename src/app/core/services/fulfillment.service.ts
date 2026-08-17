import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { MockDataStoreService } from './mock-data-store.service';
import { AddressInfo, CarrierType, ShippingOrder, ShippingStatus } from '../models/fulfillment.models';

@Injectable({
  providedIn: 'root',
})
export class FulfillmentService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
  private readonly mockStore = inject(MockDataStoreService, { optional: true });

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
      tracking_url: 'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434289012345678',
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
      tracking_url: 'https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsdetails/?trackingNumber=02345678901234',
      status: 'delivered',
      created_at: new Date(Date.now() - 172800000).toISOString(),
      shipped_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ]);

  readonly selectedOrderForLabel = signal<ShippingOrder | null>(null);
  readonly selectedOrderForSlip = signal<ShippingOrder | null>(null);

  readonly readyToPackCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'ready_to_pack' || o.status === 'label_printed').length
  );

  readonly shippedCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'shipped').length
  );

  readonly deliveredCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'delivered').length
  );

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

  markAsPrinted(orderId: string): void {
    this.orders.update((list) =>
      list.map((o) => (o.id === orderId && o.status === 'ready_to_pack' ? { ...o, status: 'label_printed' as ShippingStatus } : o))
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
