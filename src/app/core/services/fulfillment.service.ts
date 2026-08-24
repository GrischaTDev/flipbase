import { Injectable, computed, effect, inject, signal } from '@angular/core';
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
import { Json } from '../models/supabase.types';
import { LoggerService } from './logger.service';
import { schreibeImHintergrund } from './supabase-schreiben';
import { SyncStatusService } from './sync-status.service';

const STORAGE_KEY_CARRIER_CFG = 'flipbase_carrier_config';
const STORAGE_KEY_SHIPPING_ORDERS = 'flipbase_shipping_orders';

export interface FulfillmentMutationResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
}

interface FulfillmentRpcClient {
  rpc(
    functionName: 'bundle_shipping_orders' | 'unbundle_shipping_order',
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown | null }>;
}

@Injectable({
  providedIn: 'root',
})
export class FulfillmentService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  private readonly syncStatus = inject(SyncStatusService, { optional: true });
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
  private readonly mockStore = inject(MockDataStoreService, { optional: true });
  private readonly webPushService = inject(WebPushService, { optional: true });

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
    () =>
      this.orders().filter((o) => o.status === 'ready_to_pack' || o.status === 'label_printed')
        .length,
  );

  readonly shippedCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'shipped').length,
  );

  readonly deliveredCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'delivered').length,
  );

  /**
   * Intelligente Erkennung von Mehrfachbestellungen desselben Kunden für Kombiversand.
   */
  readonly bundleCandidates = computed<BundleCandidate[]>(() => {
    const unfulfilled = this.orders().filter(
      (o) => (o.status === 'ready_to_pack' || o.status === 'label_printed') && !o.is_bundled,
    );

    const grouped = new Map<string, ShippingOrder[]>();

    for (const ord of unfulfilled) {
      const key = `${ord.customer.name.trim().toLowerCase()}_${ord.customer.postal_code.trim()}_${ord.customer.street.trim().toLowerCase()}`;
      const list = grouped.get(key) || [];
      list.push(ord);
      grouped.set(key, list);
    }

    const candidates: BundleCandidate[] = [];

    for (const [key, group] of grouped.entries()) {
      if (group.length > 1) {
        const totalItems = group.length;
        const individualShippingTotal = totalItems * 5.49;
        const bundleRate = this.availableRates[1]; // 2kg Paket
        const bundleShippingCost = bundleRate.price;
        const savings = Math.max(0, individualShippingTotal - bundleShippingCost);

        candidates.push({
          customerKey: key,
          customerName: group[0].customer.name,
          customerCity: group[0].customer.city,
          orders: group,
          itemsCount: totalItems,
          totalOrderValue: Number(group.reduce((sum, o) => sum + o.sale_price, 0).toFixed(2)),
          individualShippingCost: Number(individualShippingTotal.toFixed(2)),
          suggestedRate: bundleRate,
          bundledShippingCost: Number(bundleShippingCost.toFixed(2)),
          potentialSavings: Number(savings.toFixed(2)),
        });
      }
    }

    return candidates;
  });

  constructor() {
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

  loadDemoOrders(): void {
    const now = new Date();
    const demoOrders: ShippingOrder[] = [
      {
        id: 'ship-1',
        workspace_id: 'ws-1',
        sale_id: 'sale-1',
        order_number: 'ORD-2026-8801',
        order_date: now.toISOString(),
        platform: 'ebay' as const,
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
        carrier: 'dhl' as const,
        package_type: 'DHL Paket bis 2 kg',
        status: 'ready_to_pack' as const,
        created_at: now.toISOString(),
      },
      {
        id: 'ship-2',
        workspace_id: 'ws-1',
        sale_id: 'sale-2',
        order_number: 'ORD-2026-8802',
        order_date: now.toISOString(),
        platform: 'ebay' as const,
        item_title: 'DualSense Wireless Controller (Midnight Black)',
        item_sku: 'SKU-PS5-CTRL',
        item_condition: 'Neuwertig',
        sale_price: 55.0,
        customer: {
          name: 'Maximilian Weber',
          street: 'Hauptstraße',
          house_number: '42b',
          postal_code: '80331',
          city: 'München',
          country: 'Deutschland',
          email: 'max.weber@beispiel.de',
        },
        carrier: 'dhl' as const,
        package_type: 'DHL Warenpost',
        status: 'ready_to_pack' as const,
        created_at: now.toISOString(),
      },
    ];
    this.orders.set(demoOrders);
    this.persistOrders();
  }

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
        platform: 'ebay' as const,
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
        carrier: 'dhl' as const,
        package_type: 'DHL Paket bis 2 kg',
        status: 'ready_to_pack' as const,
        created_at: now.toISOString(),
      },
      {
        id: 'ship-2',
        workspace_id: 'ws-1',
        sale_id: 'sale-2',
        order_number: 'ORD-2026-8802',
        order_date: new Date(now.getTime() - 86400000).toISOString(),
        platform: 'ebay' as const,
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
        carrier: 'dhl' as const,
        package_type: 'DHL Paket bis 2 kg',
        tracking_number: '00340434289012345678',
        tracking_url:
          'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434289012345678',
        status: 'shipped' as const,
        created_at: new Date(now.getTime() - 86400000).toISOString(),
        shipped_at: new Date(now.getTime() - 3600000).toISOString(),
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
      // Kein Schluessel im Frontend: Traeger-Zugangsdaten gehoeren in
      // Edge Functions, nicht in eine vom Browser lesbare Tabelle.
      dhlApiKey: '',
      hermesEnabled: true,
      hermesClientId: 'HERMES-99421',
      hermesApiKey: '',
    };
  }

  async loadFromSupabase(workspaceId: string): Promise<void> {
    if (!this.supabase || this.mockStore?.isDemoMode()) return;

    try {
      const [orderRes, cfgRes] = await Promise.all([
        this.supabase.client
          .from('shipping_orders')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false }),
        this.supabase.client
          .from('carrier_configs')
          .select('*')
          .eq('workspace_id', workspaceId)
          .maybeSingle(),
      ]);

      if (orderRes.data && orderRes.data.length > 0) {
        const mapped: ShippingOrder[] = (orderRes.data as unknown[]).map((o: any) => ({
          id: o.id,
          workspace_id: o.workspace_id,
          sale_id: o.sale_id,
          order_number: o.order_number,
          order_date: o.order_date,
          platform: o.platform,
          item_title: o.item_title,
          item_sku: o.item_sku || undefined,
          item_condition: o.item_condition || undefined,
          sale_price: Number(o.sale_price || 0),
          customer: o.customer as AddressInfo,
          carrier: o.carrier as CarrierType,
          package_type: o.package_type,
          tracking_number: o.tracking_number || undefined,
          tracking_url: o.tracking_url || undefined,
          label_price: o.label_price ? Number(o.label_price) : undefined,
          carrier_transaction_id: o.carrier_transaction_id || undefined,
          status: o.status as ShippingStatus,
          created_at: o.created_at,
          shipped_at: o.shipped_at || undefined,
          delivered_at: o.delivered_at || undefined,
          is_bundled: o.is_bundled || false,
          bundled_order_ids: o.bundled_order_ids || undefined,
          bundled_item_titles: o.bundled_item_titles || undefined,
          notes: o.notes || undefined,
        }));
        this.orders.set(mapped);
        this.persistOrders();
      }

      if (cfgRes.data) {
        const cfg: CarrierConfig = {
          dhlEnabled: cfgRes.data.dhl_enabled,
          dhlEkp: cfgRes.data.dhl_ekp || '',
          dhlApiKey: cfgRes.data.dhl_api_key || '',
          hermesEnabled: cfgRes.data.hermes_enabled,
          hermesClientId: cfgRes.data.hermes_client_id || '',
          hermesApiKey: cfgRes.data.hermes_api_key || '',
        };
        this.carrierConfig.set(cfg);
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_CARRIER_CFG, JSON.stringify(cfg));
          }
        } catch {}
      }
    } catch (err) {
      this.logger.error('Verbindungsfehler beim Laden der Versanddaten:', err);
    }
  }

  updateCarrierConfig(cfg: Partial<CarrierConfig>): void {
    const updated = { ...this.carrierConfig(), ...cfg };
    this.carrierConfig.set(updated);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_CARRIER_CFG, JSON.stringify(updated));
      }
    } catch {}

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      this.supabase.client
        .from('carrier_configs')
        .upsert(
          {
            workspace_id: ws.id,
            dhl_enabled: updated.dhlEnabled,
            dhl_ekp: updated.dhlEkp,
            dhl_api_key: updated.dhlApiKey,
            hermes_enabled: updated.hermesEnabled,
            hermes_client_id: updated.hermesClientId,
            hermes_api_key: updated.hermesApiKey,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id' },
        )
        .then(({ error }) => {
          if (error) this.logger.error('Fehler beim Speichern der Carrier-Konfiguration:', error);
        });
    }
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
    const wsName = this.workspaceService?.currentWorkspace()?.name || 'Flipbase Reselling HQ';
    return {
      name: wsName,
      company: 'Flipbase E-Commerce Einzelunternehmen',
      street: 'Gewerbestraße',
      house_number: '10',
      postal_code: '10115',
      city: 'Berlin',
      country: 'Deutschland',
      email: 'versand@flipbase.de',
      phone: '+49 30 98765432',
    };
  }

  async markAsShipped(
    orderId: string,
    trackingNumber?: string,
    carrier: CarrierType = 'dhl',
  ): Promise<FulfillmentMutationResult<ShippingOrder>> {
    const vorhandeneBestellung = this.orders().find((order) => order.id === orderId);
    if (!vorhandeneBestellung) {
      return {
        data: null,
        error: this.meldePersistenzfehler(
          'Speichern der Sendungsverfolgung',
          new Error('Die Sendung wurde nicht gefunden.'),
        ),
      };
    }
    const trk = trackingNumber || `TRK-${Date.now()}`;
    const url = this.getTrackingUrl(carrier, trk);
    const shippedAt = new Date().toISOString();
    const ws = this.workspaceService?.currentWorkspace();

    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      try {
        const { error, count } = await this.supabase.client
          .from('shipping_orders')
          .update(
            {
              carrier,
              tracking_number: trk,
              tracking_url: url,
              status: 'shipped',
              shipped_at: shippedAt,
            },
            { count: 'exact' },
          )
          .eq('id', orderId)
          .eq('workspace_id', ws.id);
        if (error)
          return {
            data: null,
            error: this.meldePersistenzfehler('Speichern der Sendungsverfolgung', error),
          };
        if (count === 0)
          return {
            data: null,
            error: this.meldePersistenzfehler('Speichern der Sendungsverfolgung', {
              code: 'PGRST116',
              message: 'Die Sendung wurde nicht gefunden.',
            }),
          };
      } catch (error: unknown) {
        return {
          data: null,
          error: this.meldePersistenzfehler('Speichern der Sendungsverfolgung', error),
        };
      }
    }

    const aktualisierteBestellung: ShippingOrder = {
      ...vorhandeneBestellung,
      carrier,
      tracking_number: trk,
      tracking_url: url,
      status: 'shipped',
      shipped_at: shippedAt,
    };
    this.orders.update((prev) => prev.map((o) => (o.id === orderId ? aktualisierteBestellung : o)));
    this.persistOrders();
    return { data: aktualisierteBestellung, error: null };
  }

  /**
   * Bundles multiple orders for the same buyer into a single shipping order.
   */
  async bundleOrders(
    candidate: BundleCandidate,
    chosenRate?: CarrierRate,
  ): Promise<FulfillmentMutationResult<ShippingOrder>> {
    if (candidate.orders.length === 0) {
      return {
        data: null,
        error: this.meldePersistenzfehler(
          'Bündeln der Sendungen',
          new Error('Es wurden keine Sendungen zum Bündeln gefunden.'),
        ),
      };
    }
    const rate = chosenRate || candidate.suggestedRate;
    const orderIds = candidate.orders.map((o) => o.id);
    const itemTitles = candidate.orders.map((o) => o.item_title);
    const firstOrder = candidate.orders[0];
    const totalSalePrice = Number(
      candidate.orders.reduce((sum, o) => sum + o.sale_price, 0).toFixed(2),
    );

    const bundledOrder: ShippingOrder = {
      id: `ship-bundle-${Date.now()}`,
      workspace_id: firstOrder.workspace_id,
      sale_id: this.gemeinsameSaleId(candidate.orders),
      order_number: `BUNDLE-${candidate.orders.length}x-${firstOrder.order_number}`,
      order_date: new Date().toISOString(),
      platform: firstOrder.platform,
      item_title: `SAMMELPAKET (${candidate.orders.length} Artikel): ${itemTitles.join(' + ')}`,
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

    const ws = this.workspaceService?.currentWorkspace();
    if (this.istPersistenterModus()) {
      if (!ws || firstOrder.workspace_id !== ws.id) {
        return {
          data: null,
          error: this.meldePersistenzfehler(
            'Bündeln der Sendungen',
            new Error('Die Sendungen gehören nicht zum ausgewählten Workspace.'),
          ),
        };
      }
      try {
        const { data, error } = await this.rpcClient().rpc('bundle_shipping_orders', {
          p_workspace_id: ws.id,
          p_order_ids: orderIds,
          p_order_number: bundledOrder.order_number,
          p_order_date: bundledOrder.order_date.slice(0, 10),
          p_platform: bundledOrder.platform,
          p_item_title: bundledOrder.item_title,
          p_item_sku: bundledOrder.item_sku ?? null,
          p_item_condition: bundledOrder.item_condition ?? null,
          p_sale_price: bundledOrder.sale_price,
          p_customer: bundledOrder.customer as unknown as Json,
          p_carrier: bundledOrder.carrier,
          p_package_type: bundledOrder.package_type,
          p_bundled_item_titles: itemTitles,
          p_notes: bundledOrder.notes ?? null,
        });
        if (error) {
          return { data: null, error: this.meldePersistenzfehler('Bündeln der Sendungen', error) };
        }
        const gespeichertesBündel = this.alsShippingOrder(data);
        if (!gespeichertesBündel) {
          return {
            data: null,
            error: this.meldePersistenzfehler(
              'Bündeln der Sendungen',
              new Error('Die Datenbank hat kein gültiges Sammelpaket zurückgegeben.'),
            ),
          };
        }
        this.orders.update((prev) => [
          gespeichertesBündel,
          ...prev.filter((order) => !orderIds.includes(order.id)),
        ]);
        this.persistOrders();
        this.meldeBündelung(candidate, gespeichertesBündel);
        return { data: gespeichertesBündel, error: null };
      } catch (error: unknown) {
        return { data: null, error: this.meldePersistenzfehler('Bündeln der Sendungen', error) };
      }
    }

    this.orders.update((prev) => [bundledOrder, ...prev.filter((o) => !orderIds.includes(o.id))]);
    this.persistOrders();

    if (this.webPushService) {
      this.webPushService.sendNotification(`Sammelpaket gebündelt: ${candidate.customerName}`, {
        body: `${candidate.orders.length} Artikel zu 1 Paket zusammengefasst. Ersparnis: ${candidate.potentialSavings.toFixed(2)} €.`,
        tag: `bundle-${bundledOrder.id}`,
      });
    }

    return { data: bundledOrder, error: null };
  }

  /**
   * Unbundles a previously bundled order back to individual shipments.
   */
  async unbundleOrder(bundledOrderId: string): Promise<FulfillmentMutationResult<ShippingOrder[]>> {
    const bundled = this.orders().find((o) => o.id === bundledOrderId);
    if (!bundled || !bundled.is_bundled || !bundled.bundled_item_titles) {
      return {
        data: null,
        error: this.meldePersistenzfehler(
          'Auflösen des Sammelpakets',
          new Error('Das Sammelpaket wurde nicht gefunden.'),
        ),
      };
    }

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

    const ws = this.workspaceService?.currentWorkspace();
    if (this.istPersistenterModus()) {
      if (!ws || bundled.workspace_id !== ws.id) {
        return {
          data: null,
          error: this.meldePersistenzfehler(
            'Auflösen des Sammelpakets',
            new Error('Das Sammelpaket gehört nicht zum ausgewählten Workspace.'),
          ),
        };
      }
      try {
        const { data, error } = await this.rpcClient().rpc('unbundle_shipping_order', {
          p_workspace_id: ws.id,
          p_bundled_order_id: bundledOrderId,
        });
        if (error) {
          return {
            data: null,
            error: this.meldePersistenzfehler('Auflösen des Sammelpakets', error),
          };
        }
        const wiederhergestellteAufträge = this.alsShippingOrders(data);
        if (!wiederhergestellteAufträge || wiederhergestellteAufträge.length === 0) {
          return {
            data: null,
            error: this.meldePersistenzfehler('Auflösen des Sammelpakets', {
              code: 'PGRST116',
              message: 'Die Datenbank hat keine wiederhergestellten Sendungen zurückgegeben.',
            }),
          };
        }
        this.orders.update((prev) => [
          ...wiederhergestellteAufträge,
          ...prev.filter((order) => order.id !== bundledOrderId),
        ]);
        this.persistOrders();
        return { data: wiederhergestellteAufträge, error: null };
      } catch (error: unknown) {
        return {
          data: null,
          error: this.meldePersistenzfehler('Auflösen des Sammelpakets', error),
        };
      }
    }

    this.orders.update((prev) => [
      ...restoredOrders,
      ...prev.filter((o) => o.id !== bundledOrderId),
    ]);
    this.persistOrders();
    return { data: restoredOrders, error: null };
  }

  /**
   * Ob eine Zusteller-Schnittstelle zum Kauf von Versandmarken angebunden ist.
   *
   * Ist sie nicht. Frueher hat diese Stelle 800 ms gewartet und dann eine
   * Sendungsnummer im echten DHL-Format erfunden (`00340434…`) - ohne dass eine
   * Marke gekauft oder gedruckt wurde. Diese Nummer landete auf dem
   * Versandetikett und damit beim Kaeufer, der damit nichts verfolgen konnte.
   *
   * Der ehrliche Weg steht daneben und funktioniert: Marke beim Zusteller
   * kaufen und die echte Nummer ueber "Sendungsnummer erfassen" eintragen.
   */
  readonly zustellerAngebunden = false;

  /**
   * Kauft eine Versandmarke beim Zusteller.
   *
   * Nicht angebunden - meldet das, statt eine Nummer zu erfinden.
   */
  async purchaseShippingLabel(): Promise<{
    success: boolean;
    trackingNumber: string;
    trackingUrl: string;
    labelPrice: number;
  }> {
    throw (
      this.syncStatus?.melde(
        'Kauf der Versandmarke',
        new Error('Keine Zusteller-Schnittstelle angebunden'),
      ) ?? new Error('Keine Zusteller-Schnittstelle angebunden')
    );
  }

  private meldePersistenzfehler(vorgang: string, ursache: unknown): Error {
    if (this.syncStatus) return this.syncStatus.melde(vorgang, ursache);
    return ursache instanceof Error ? ursache : new Error(String(ursache));
  }

  private istPersistenterModus(): boolean {
    return this.supabase !== null && this.supabase !== undefined && !this.mockStore?.isDemoMode();
  }

  private rpcClient(): FulfillmentRpcClient {
    return this.supabase!.client as unknown as FulfillmentRpcClient;
  }

  private alsShippingOrder(daten: unknown): ShippingOrder | null {
    if (
      typeof daten !== 'object' ||
      daten === null ||
      !('id' in daten) ||
      typeof daten.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(daten.id)
    ) {
      return null;
    }
    return daten as ShippingOrder;
  }

  private alsShippingOrders(daten: unknown): ShippingOrder[] | null {
    if (!Array.isArray(daten)) return null;
    const aufträge = daten.map((eintrag) => this.alsShippingOrder(eintrag));
    return aufträge.every((eintrag): eintrag is ShippingOrder => eintrag !== null)
      ? aufträge
      : null;
  }

  private meldeBündelung(candidate: BundleCandidate, bündel: ShippingOrder): void {
    this.webPushService?.sendNotification(`Sammelpaket gebündelt: ${candidate.customerName}`, {
      body: `${candidate.orders.length} Artikel zu 1 Paket zusammengefasst. Ersparnis: ${candidate.potentialSavings.toFixed(2)} €.`,
      tag: `bundle-${bündel.id}`,
    });
  }

  private gemeinsameSaleId(aufträge: readonly ShippingOrder[]): string | null {
    const saleIds = new Set(aufträge.map((auftrag) => auftrag.sale_id).filter(Boolean));
    return saleIds.size === 1 && aufträge.every((auftrag) => Boolean(auftrag.sale_id))
      ? (aufträge[0].sale_id ?? null)
      : null;
  }

  markAsDelivered(orderId: string): void {
    this.updateOrderStatus(orderId, 'delivered');
  }

  updateOrderStatus(orderId: string, status: ShippingStatus): void {
    const deliveredAt = status === 'delivered' ? new Date().toISOString() : undefined;
    const shippedAt = status === 'shipped' ? new Date().toISOString() : undefined;

    this.orders.update((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status,
              shipped_at: shippedAt || o.shipped_at,
            }
          : o,
      ),
    );
    this.persistOrders();

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      const dbPayload: any = { status };
      if (shippedAt) dbPayload.shipped_at = shippedAt;
      if (deliveredAt) dbPayload.delivered_at = deliveredAt;

      schreibeImHintergrund(
        this.supabase.client.from('shipping_orders').update(dbPayload).eq('id', orderId),
        'Aktualisieren des Versandauftrags',
        this.syncStatus,
      );
    }
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
