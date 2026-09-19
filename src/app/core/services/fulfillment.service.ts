import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
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
import { SyncStatusService } from './sync-status.service';
import { Tables } from '../models/supabase.types';

function createDefaultCarrierConfig(): CarrierConfig {
  return {
    dhlEnabled: false,
    dhlEkp: '',
    dhlApiKey: '',
    hermesEnabled: false,
    hermesClientId: '',
    hermesApiKey: '',
    senderName: '',
    senderCompany: '',
    senderStreet: '',
    senderHouseNumber: '',
    senderPostalCode: '',
    senderCity: '',
    senderCountry: '',
    senderEmail: '',
    senderPhone: '',
  };
}

export interface FulfillmentMutationResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
}

export interface FulfillmentStatusMutationResult extends FulfillmentMutationResult<ShippingOrder> {
  readonly reportedBySyncStatus: boolean;
}

export interface CarrierConfigMutationResult extends FulfillmentMutationResult<CarrierConfig> {
  readonly reportedBySyncStatus: boolean;
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

  readonly carrierConfig = signal<CarrierConfig>(createDefaultCarrierConfig());
  readonly loadedWorkspaceId = signal<string | null>(null);
  readonly loadError = signal<Error | null>(null);
  private loadVersion = 0;
  readonly orders = signal<ShippingOrder[]>([]);

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
        void this.loadFromSupabase(ws?.id ?? '');
      });
    } catch {
      // nur Testumgebung ohne Scheduler
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
    if (!this.supabase) {
      this.loadedWorkspaceId.set(requestedWorkspaceId);
      return;
    }
    this.resetWorkspaceData();
    this.loadError.set(null);

    try {
      const [orderRes, cfgRes] = await Promise.all([
        this.supabase.client
          .from('shipping_orders')
          .select('*')
          .eq('workspace_id', requestedWorkspaceId)
          .order('created_at', { ascending: false }),
        this.supabase.client
          .from('carrier_configs')
          .select('*')
          .eq('workspace_id', requestedWorkspaceId)
          .maybeSingle(),
      ]);

      if (!this.isCurrentLoad(requestedWorkspaceId, loadVersion)) return;
      if (orderRes.error || cfgRes.error) throw orderRes.error ?? cfgRes.error;

      const mapped: ShippingOrder[] = ((orderRes.data ?? []) as Tables<'shipping_orders'>[]).map(
        (o) => ({
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
          customer: o.customer as unknown as AddressInfo,
          carrier: o.carrier as CarrierType,
          package_type: o.package_type,
          tracking_number: o.tracking_number || undefined,
          tracking_url: o.tracking_url || undefined,
          label_price: o.label_price ? Number(o.label_price) : undefined,
          carrier_transaction_id: o.carrier_transaction_id || undefined,
          status: o.status as ShippingStatus,
          created_at: o.created_at,
          shipped_at: o.shipped_at || undefined,
          is_bundled: o.is_bundled || false,
          bundled_order_ids: o.bundled_order_ids || undefined,
          bundled_item_titles: o.bundled_item_titles || undefined,
          notes: o.notes || undefined,
        }),
      );
      this.orders.set(mapped);

      if (cfgRes.data) {
        const cfg: CarrierConfig = {
          dhlEnabled: cfgRes.data.dhl_enabled,
          dhlEkp: cfgRes.data.dhl_ekp || '',
          dhlApiKey: cfgRes.data.dhl_api_key || '',
          hermesEnabled: cfgRes.data.hermes_enabled,
          hermesClientId: cfgRes.data.hermes_client_id || '',
          hermesApiKey: cfgRes.data.hermes_api_key || '',
          senderName: cfgRes.data.sender_name || '',
          senderCompany: cfgRes.data.sender_company || '',
          senderStreet: cfgRes.data.sender_street || '',
          senderHouseNumber: cfgRes.data.sender_house_number || '',
          senderPostalCode: cfgRes.data.sender_postal_code || '',
          senderCity: cfgRes.data.sender_city || '',
          senderCountry: cfgRes.data.sender_country || '',
          senderEmail: cfgRes.data.sender_email || '',
          senderPhone: cfgRes.data.sender_phone || '',
        };
        this.carrierConfig.set(cfg);
      }
      this.loadedWorkspaceId.set(requestedWorkspaceId);
    } catch (err) {
      if (this.isCurrentLoad(requestedWorkspaceId, loadVersion)) {
        const error = this.asLoadError(err);
        this.loadError.set(error);
        this.loadedWorkspaceId.set(requestedWorkspaceId);
        this.logger.error('Verbindungsfehler beim Laden der Versanddaten:', error);
      }
    }
  }

  private resetWorkspaceData(): void {
    this.carrierConfig.set(createDefaultCarrierConfig());
    this.orders.set([]);
    this.loadedWorkspaceId.set(null);
    this.loadError.set(null);
    this.selectedOrderForLabel.set(null);
    this.selectedOrderForSlip.set(null);
    this.selectedOrderForPurchase.set(null);
    this.selectedBundleCandidate.set(null);
  }

  private isCurrentWorkspace(workspaceId: string): boolean {
    return !this.workspaceService || this.workspaceService.currentWorkspace()?.id === workspaceId;
  }

  private isCurrentLoad(workspaceId: string, loadVersion: number): boolean {
    return this.loadVersion === loadVersion && this.isCurrentWorkspace(workspaceId);
  }

  async updateCarrierConfig(cfg: Partial<CarrierConfig>): Promise<CarrierConfigMutationResult> {
    const workspaceId = this.workspaceService?.currentWorkspace()?.id ?? null;
    const updated = { ...this.carrierConfig(), ...cfg };
    const persistent = this.istPersistenterModus();
    if (persistent && !workspaceId)
      return this.carrierConfigFehler(new Error('Kein aktiver Workspace.'));
    let confirmed = updated;
    if (persistent) {
      try {
        const { data, error } = await this.supabase!.client.from('carrier_configs')
          .upsert(
            {
              workspace_id: workspaceId!,
              dhl_enabled: updated.dhlEnabled,
              dhl_ekp: updated.dhlEkp,
              dhl_api_key: updated.dhlApiKey,
              hermes_enabled: updated.hermesEnabled,
              hermes_client_id: updated.hermesClientId,
              hermes_api_key: updated.hermesApiKey,
              sender_name: updated.senderName,
              sender_company: updated.senderCompany,
              sender_street: updated.senderStreet,
              sender_house_number: updated.senderHouseNumber,
              sender_postal_code: updated.senderPostalCode,
              sender_city: updated.senderCity,
              sender_country: updated.senderCountry,
              sender_email: updated.senderEmail,
              sender_phone: updated.senderPhone,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'workspace_id' },
          )
          .select('*')
          .single();
        if (error || !data) {
          return this.carrierConfigFehler(
            error ?? new Error('Die Datenbank hat keine Carrier-Konfiguration zurückgegeben.'),
          );
        }
        confirmed = {
          dhlEnabled: data.dhl_enabled,
          dhlEkp: data.dhl_ekp || '',
          dhlApiKey: data.dhl_api_key || '',
          hermesEnabled: data.hermes_enabled,
          hermesClientId: data.hermes_client_id || '',
          hermesApiKey: data.hermes_api_key || '',
          senderName: data.sender_name || '',
          senderCompany: data.sender_company || '',
          senderStreet: data.sender_street || '',
          senderHouseNumber: data.sender_house_number || '',
          senderPostalCode: data.sender_postal_code || '',
          senderCity: data.sender_city || '',
          senderCountry: data.sender_country || '',
          senderEmail: data.sender_email || '',
          senderPhone: data.sender_phone || '',
        };
      } catch (error: unknown) {
        return this.carrierConfigFehler(error);
      }
      if (!this.isCurrentWorkspace(workspaceId!)) {
        return {
          data: null,
          error: new Error('Der Workspace wurde während des Speicherns gewechselt.'),
          reportedBySyncStatus: false,
        };
      }
    }
    this.carrierConfig.set(confirmed);
    return { data: confirmed, error: null, reportedBySyncStatus: false };
  }

  private carrierConfigFehler(ursache: unknown): CarrierConfigMutationResult {
    const error = this.meldePersistenzfehler('Speichern der Carrier-Konfiguration', ursache);
    return {
      data: null,
      error,
      reportedBySyncStatus: this.syncStatus?.istZentralGemeldet(error) ?? false,
    };
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

  getSenderAddress(): AddressInfo | null {
    const config = this.carrierConfig();
    if (
      !config.senderName.trim() ||
      !config.senderStreet.trim() ||
      !config.senderHouseNumber.trim() ||
      !config.senderPostalCode.trim() ||
      !config.senderCity.trim() ||
      !config.senderCountry.trim()
    ) {
      return null;
    }
    return {
      name: config.senderName.trim(),
      company: config.senderCompany.trim() || undefined,
      street: config.senderStreet.trim(),
      house_number: config.senderHouseNumber.trim(),
      postal_code: config.senderPostalCode.trim(),
      city: config.senderCity.trim(),
      country: config.senderCountry.trim(),
      email: config.senderEmail.trim() || undefined,
      phone: config.senderPhone.trim() || undefined,
    };
  }

  async markAsShipped(
    orderId: string,
    trackingNumber?: string,
    carrier: CarrierType = 'dhl',
  ): Promise<FulfillmentMutationResult<ShippingOrder>> {
    const trk = trackingNumber?.trim() ?? '';
    if (!trk) {
      return {
        data: null,
        error: this.meldePersistenzfehler(
          'Speichern der Sendungsverfolgung',
          new Error('Eine Sendungsnummer ist erforderlich.'),
        ),
      };
    }
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
    const url = this.getTrackingUrl(carrier, trk);
    const shippedAt = new Date().toISOString();
    const ws = this.workspaceService?.currentWorkspace();

    if (this.istPersistenterModus()) {
      if (!ws || vorhandeneBestellung.workspace_id !== ws.id) {
        return {
          data: null,
          error: this.meldePersistenzfehler(
            'Speichern der Sendungsverfolgung',
            new Error('Die Sendung gehört nicht zum ausgewählten Workspace.'),
          ),
        };
      }
      try {
        const { error, count } = await this.supabase!.client.from('shipping_orders')
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
        if (!this.isCurrentWorkspace(ws.id)) {
          return this.workspaceWechselFehler('Speichern der Sendungsverfolgung');
        }
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
        if (!this.isCurrentWorkspace(ws.id)) {
          return this.workspaceWechselFehler('Bündeln der Sendungen');
        }
        this.orders.update((prev) => [
          gespeichertesBündel,
          ...prev.filter((order) => !orderIds.includes(order.id)),
        ]);
        this.meldeBündelung(candidate, gespeichertesBündel);
        return { data: gespeichertesBündel, error: null };
      } catch (error: unknown) {
        return { data: null, error: this.meldePersistenzfehler('Bündeln der Sendungen', error) };
      }
    }

    this.orders.update((prev) => [bundledOrder, ...prev.filter((o) => !orderIds.includes(o.id))]);

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
        if (!this.isCurrentWorkspace(ws.id)) {
          return this.workspaceWechselFehler('Auflösen des Sammelpakets');
        }
        this.orders.update((prev) => [
          ...wiederhergestellteAufträge,
          ...prev.filter((order) => order.id !== bundledOrderId),
        ]);
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

  private workspaceWechselFehler<T>(vorgang: string): FulfillmentMutationResult<T> {
    return {
      data: null,
      error: new Error(`Der Workspace wurde während „${vorgang}“ gewechselt.`),
    };
  }

  private asLoadError(reason: unknown): Error {
    if (reason instanceof Error) return reason;
    if (
      typeof reason === 'object' &&
      reason !== null &&
      'message' in reason &&
      typeof reason.message === 'string'
    ) {
      return new Error(reason.message);
    }
    return new Error('Die Versanddaten konnten nicht geladen werden.');
  }

  private istPersistenterModus(): boolean {
    return this.supabase !== null && this.supabase !== undefined;
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

  async markAsDelivered(orderId: string): Promise<FulfillmentStatusMutationResult> {
    const vorhandeneBestellung = this.orders().find((order) => order.id === orderId);
    if (!vorhandeneBestellung) {
      return this.zustellfehler(new Error('Die Sendung wurde nicht gefunden.'));
    }

    const ws = this.workspaceService?.currentWorkspace();
    if (this.istPersistenterModus()) {
      if (!ws || vorhandeneBestellung.workspace_id !== ws.id) {
        return this.zustellfehler(
          new Error('Die Sendung gehört nicht zum ausgewählten Workspace.'),
        );
      }
      try {
        const { error, count } = await this.supabase!.client.from('shipping_orders')
          .update({ status: 'delivered' }, { count: 'exact' })
          .eq('id', orderId)
          .eq('workspace_id', ws.id);
        if (error) return this.zustellfehler(error);
        if (count === 0) {
          return this.zustellfehler({
            code: 'PGRST116',
            message: 'Die Sendung wurde nicht gefunden.',
          });
        }
        if (!this.isCurrentWorkspace(ws.id)) {
          const result = this.workspaceWechselFehler<ShippingOrder>(
            'Markieren der Sendung als zugestellt',
          );
          return { ...result, reportedBySyncStatus: false };
        }
      } catch (error: unknown) {
        return this.zustellfehler(error);
      }
    }

    const aktualisierteBestellung: ShippingOrder = {
      ...vorhandeneBestellung,
      status: 'delivered',
    };
    this.orders.update((prev) =>
      prev.map((order) => (order.id === orderId ? aktualisierteBestellung : order)),
    );
    return { data: aktualisierteBestellung, error: null, reportedBySyncStatus: false };
  }

  private zustellfehler(ursache: unknown): FulfillmentStatusMutationResult {
    const error = this.meldePersistenzfehler('Markieren der Sendung als zugestellt', ursache);
    return {
      data: null,
      error,
      reportedBySyncStatus: this.syncStatus?.istZentralGemeldet(error) ?? false,
    };
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
