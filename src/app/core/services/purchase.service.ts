import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { InventoryService } from './inventory.service';
import { SourcesService } from './sources.service';
import { SuppliersService } from './suppliers.service';
import { WebhookService } from './webhook.service';
import { SyncStatusService } from './sync-status.service';
import { ReceivePurchaseLineInput, ReceivePurchaseResult, StockService } from './stock.service';
import { MutationResult } from '../models/mutation-result.model';
import {
  Purchase,
  PurchaseCost,
  PurchaseCostTaxTreatment,
  PurchaseLine,
  PurchaseType,
  CostAllocationMode,
  InventoryItem,
  ItemCondition,
  TrackingCarrier,
  InboundTrackingStatus,
  TrackingMode,
} from '../models/flipbase.models';
import {
  PurchaseCostAllocationMethod,
  PurchaseLinePriceMode,
} from '../models/purchase-costing.models';
import {
  normalizePurchaseSellerDetails,
  PurchaseSellerDetails,
} from '../models/purchase-seller.models';

export const PURCHASE_SELLER_DETAILS_CONFLICT_MESSAGE =
  'Der Einkauf wurde zwischenzeitlich geändert. Bitte neu laden.';

export interface CreatePurchaseLineInput {
  readonly isPackage?: boolean;
  readonly draftId?: string;
  readonly catalogProductId: string | null;
  readonly titleSnapshot: string;
  readonly ean?: string | null;
  readonly lineKind: TrackingMode;
  readonly orderedQuantity: number;
  readonly condition?: ItemCondition;
  readonly priceMode?: PurchaseLinePriceMode;
  readonly unitPurchasePrice: number | null;
  readonly lineTotal: number | null;
  readonly estimatedMarketValue?: number | null;
  readonly allocatedAdditionalCost?: number;
}

export interface CreatePurchaseCostInput {
  readonly type: string;
  readonly amount: number;
  readonly description?: string;
  readonly allocationMethod?: 'by_value' | 'by_quantity' | 'direct';
  readonly taxTreatment?: PurchaseCostTaxTreatment | null;
  readonly targetPurchaseLineId?: string | null;
}

function parsePurchaseCostTaxTreatment(value: unknown): PurchaseCostTaxTreatment | null {
  if (value === null || value === undefined) return null;
  if (value === 'purchase_price' || value === 'expense') return value;
  throw new Error(
    'Die zurückgegebene Kostenherkunft ist ungültig. Bitte den Einkauf erneut laden.',
  );
}

/**
 * Wandelt einen Geldbetrag in ganze Cent um, ohne typische binäre
 * Gleitkommaartefakte wie bei 0,07 als Dezimalbruch zu verwerfen.
 */
export function toExactCents(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const scaled = value * 100;
  const cents = Math.round(scaled);
  const floatingPointTolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 8;
  return Number.isSafeInteger(cents) && Math.abs(scaled - cents) <= floatingPointTolerance
    ? cents
    : null;
}

export interface ReceiveIndividualPurchaseLineInput {
  readonly title: string;
  readonly condition: ItemCondition;
}

export interface ReceiveIndividualPurchaseResult {
  readonly purchaseLine: PurchaseLine;
  readonly inventoryItem: InventoryItem;
  readonly purchase: Purchase;
}

export interface CreatePurchasePayload {
  request_id?: string;
  source_id?: string | null;
  supplier_id?: string | null;
  type: PurchaseType;
  title: string;
  purchase_date: string;
  purchase_price: number | null;
  discount_amount?: number;
  content_status?: 'known' | 'unknown';
  pricing_mode?: 'individual' | 'total';
  shipment_status?: 'not_shipped' | 'in_transit' | 'arrived';
  supplier_reference?: string | null;
  seller_type?: Purchase['seller_type'];
  seller_name?: string | null;
  seller_marketplace_username?: string | null;
  seller_street?: string | null;
  seller_address_extra?: string | null;
  seller_postal_code?: string | null;
  seller_city?: string | null;
  seller_country_code?: string | null;
  external_order_id?: string | null;
  cost_allocation_mode?: CostAllocationMode;
  notes?: string | null;
  tracking_number?: string | null;
  tracking_carrier?: TrackingCarrier | null;
  tracking_status?: InboundTrackingStatus | null;
  original_url?: string | null;
  items_count?: number;
  initial_costs?: readonly CreatePurchaseCostInput[];
  single_item_title?: string;
  single_item_condition?: string;
  single_item_expected_value?: number;
  purchase_lines?: readonly CreatePurchaseLineInput[];
}

export type PurchaseCreateProblemKind =
  'additional_costs' | 'purchase_lines' | 'inventory_item' | 'activity_log';

export type PurchaseSaleHistoryState =
  'idle' | 'loading' | 'recorded' | 'review_required' | 'none' | 'error';

type ResolvedPurchaseSaleHistoryState = Extract<
  PurchaseSaleHistoryState,
  'recorded' | 'review_required' | 'none'
>;

interface PurchaseSaleHistoryOutcome {
  readonly state: ResolvedPurchaseSaleHistoryState;
  readonly reviewInventoryItemId: string | null;
}

interface PurchaseSaleHistoryRpcClient {
  rpc(
    name: 'get_purchase_sale_history',
    args: Readonly<{ p_workspace_id: string; p_purchase_id: string }>,
  ): Promise<{ data: unknown; error: unknown }>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePurchaseSaleHistoryOutcome(data: unknown): PurchaseSaleHistoryOutcome | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;

  const record = data as Readonly<Record<string, unknown>>;
  const state = record['state'];
  const reviewInventoryItemId = record['review_inventory_item_id'];
  if (state !== 'recorded' && state !== 'review_required' && state !== 'none') return null;

  if (state === 'review_required') {
    if (typeof reviewInventoryItemId !== 'string' || !uuidPattern.test(reviewInventoryItemId)) {
      return null;
    }
    return { state, reviewInventoryItemId };
  }

  return reviewInventoryItemId === null ? { state, reviewInventoryItemId: null } : null;
}

export interface PurchaseCreateProblem {
  readonly kind: PurchaseCreateProblemKind;
  readonly error: Error;
  readonly reportedBySyncStatus: boolean;
}

export type CreatePurchaseResult =
  | {
      readonly status: 'success';
      readonly data: Purchase;
      readonly error: null;
      readonly reportedBySyncStatus: false;
      readonly problems: readonly [];
    }
  | {
      readonly status: 'partial';
      readonly data: Purchase;
      readonly error: null;
      readonly reportedBySyncStatus: boolean;
      readonly problems: readonly PurchaseCreateProblem[];
    }
  | {
      readonly status: 'failed';
      readonly data: null;
      readonly error: Error;
      readonly reportedBySyncStatus: boolean;
      readonly problems: readonly [];
    };

export function beschreibePurchaseProblem(problem: PurchaseCreateProblem): string {
  const schritt: Record<PurchaseCreateProblemKind, string> = {
    additional_costs: 'Zusatzkosten',
    purchase_lines: 'Einkaufspositionen',
    inventory_item: 'Inventarartikel',
    activity_log: 'Aktivitätsprotokoll',
  };
  return `${schritt[problem.kind]}: ${problem.error.message}`;
}

@Injectable({
  providedIn: 'root',
})
export class PurchaseService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly webhookService = inject(WebhookService);
  private readonly stockService = inject(StockService);
  // Der Inventardienst ist die einzige Quelle fuer Artikel. Diese Richtung der
  // Abhaengigkeit ist bewusst: Der Inventardienst kennt Einkaeufe nicht, sonst
  // haetten beide Dienste einen eigenen - und damit frueher oder spaeter
  // abweichenden - Bestand.
  private readonly inventory = inject(InventoryService);
  private readonly sourcesService = inject(SourcesService);
  private readonly suppliersService = inject(SuppliersService);

  /** Die Einkaeufe, wie sie aus Datenbank oder lokalem Spiegel kommen. */
  private readonly purchasesRaw = signal<Purchase[]>([]);
  private readonly selectedPurchaseRaw = signal<Purchase | null>(null);
  /** Artikel aus der Detailabfrage - nur Rueckfallebene, solange das Inventar laedt. */
  private readonly purchaseItemsFallback = signal<InventoryItem[]>([]);
  private readonly purchaseLinesRaw = signal<PurchaseLine[]>([]);
  private detailLoadRequestId = 0;
  private saleHistoryLoadRequestId = 0;
  private loadRequestId = 0;
  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<Error | null>(null);
  readonly loadedWorkspaceId = signal<string | null>(null);
  readonly purchaseSaleHistoryState = signal<PurchaseSaleHistoryState>('idle');
  readonly purchaseSaleReviewInventoryItemId = signal<string | null>(null);

  /**
   * Einkaufsliste mit abgeleiteter Artikelanzahl.
   *
   * Die Anzahl wird bewusst nicht mitgefuehrt, sondern bei jeder Anzeige aus
   * der Inventarliste berechnet. Nur so stimmt jede Kachel sofort, egal wo ein
   * Artikel angelegt oder geloescht wurde. Solange das Inventar noch laedt,
   * gilt der Wert aus der Datenbankabfrage.
   */
  readonly purchases = computed<Purchase[]>(() => {
    const liste = this.purchasesRaw();
    if (!this.inventory.istGeladen()) return liste;
    const items = this.inventory.items();
    return liste.map((p) => ({
      ...p,
      items_count: this.zaehleArtikel(p, items, p.purchase_lines ?? []),
    }));
  });

  readonly selectedPurchase = computed<Purchase | null>(() => {
    const p = this.selectedPurchaseRaw();
    if (!p) return null;
    if (!this.inventory.istGeladen()) return p;
    return {
      ...p,
      items_count: this.zaehleArtikel(p, this.inventory.items(), this.purchaseLinesRaw()),
    };
  });

  /** Die Artikel des geoeffneten Einkaufs - direkt aus der Inventarliste. */
  readonly purchaseItems = computed<InventoryItem[]>(() => {
    const p = this.selectedPurchaseRaw();
    if (!p) return [];
    if (!this.inventory.istGeladen()) return this.purchaseItemsFallback();
    return this.inventory.items().filter((i) => i.purchase_id === p.id);
  });

  /** Die Einkaufspositionen des geöffneten Einkaufs, inklusive Eingangsmengen. */
  readonly purchaseLines = computed<PurchaseLine[]>(() => this.purchaseLinesRaw());

  /**
   * Zaehlt fachliche Einkaufspositionen. Eine Position bleibt auch nach dem
   * Wareneingang genau einmal enthalten: Mengenpositionen über ihre bestellte
   * Menge, Einzelpositionen über die Positionsmenge. Nur alte Inventarartikel
   * ohne passende Einkaufsposition kommen zusätzlich hinzu.
   */
  private zaehleArtikel(
    einkauf: Purchase,
    items: readonly InventoryItem[],
    lines: readonly PurchaseLine[] = [],
  ): number {
    const purchaseItems = items.filter((item) => item.purchase_id === einkauf.id);
    const purchaseLines = lines.filter((line) => line.purchase_id === einkauf.id);
    if (purchaseLines.length === 0) {
      if (
        einkauf.purchase_lines !== undefined &&
        (einkauf.receiving_status === 'ordered' ||
          einkauf.receiving_status === 'partially_received')
      ) {
        return purchaseItems.length;
      }
      return Math.max(purchaseItems.length, einkauf.items_count ?? 0);
    }

    const representedLineIds = new Set(purchaseLines.map((line) => line.id));
    const positionCount = purchaseLines.reduce(
      (count, line) => count + (line.is_package ? 0 : line.ordered_quantity),
      0,
    );
    const legacyItemCount = purchaseItems.filter(
      (item) =>
        item.source_package_line_id ||
        !item.purchase_line_id ||
        !representedLineIds.has(item.purchase_line_id),
    ).length;
    return positionCount + legacyItemCount;
  }

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService.currentWorkspace();
        this.resetPurchaseDetail();
        if (ws) {
          this.loadPurchases(ws.id);
        } else {
          this.loadRequestId += 1;
          this.isLoading.set(false);
          this.loadError.set(null);
          this.loadedWorkspaceId.set(null);
          this.purchasesRaw.set([]);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  async loadPurchases(workspaceId: string): Promise<void> {
    const requestId = ++this.loadRequestId;
    this.isLoading.set(true);
    this.loadError.set(null);
    this.loadedWorkspaceId.set(null);
    this.purchasesRaw.set([]);
    try {
      const { data, error } = await this.supabase.client
        .from('purchases')
        .select(
          `
          *,
          source:sources(*),
          supplier:suppliers(*),
          costs:purchase_costs!purchase_costs_workspace_purchase_fkey(*),
          items:inventory_items(id, purchase_id, purchase_line_id, source_package_line_id, title, status, allocated_purchase_cost, expected_value),
          purchase_lines!purchase_lines_purchase_id_fkey(*)
        `,
        )
        .eq('workspace_id', workspaceId)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (!this.isCurrentListLoad(requestId, workspaceId)) return;

      if (error) {
        this.loadError.set(this.syncStatus.melde('Laden der Einkäufe', error));
      } else if (data) {
        const enriched = (data as unknown as Purchase[]).map((p) => {
          const costsSum = (p.costs || []).reduce((acc, cost) => acc + Number(cost.amount || 0), 0);
          const totalCost =
            p.purchase_price === null
              ? null
              : Number(p.purchase_price) - Number(p.discount_amount ?? 0) + costsSum;
          return {
            ...p,
            items_count: this.zaehleArtikel(
              p,
              (p.items || []) as InventoryItem[],
              (p.purchase_lines || []) as PurchaseLine[],
            ),
            total_purchase_cost: totalCost === null ? null : Number(totalCost.toFixed(2)),
          } as Purchase;
        });
        this.purchasesRaw.set(enriched);
        this.loadedWorkspaceId.set(workspaceId);
      }
    } catch (err: unknown) {
      if (!this.isCurrentListLoad(requestId, workspaceId)) return;
      this.loadError.set(this.syncStatus.melde('Laden der Einkäufe', err));
    } finally {
      if (requestId === this.loadRequestId) this.isLoading.set(false);
    }
  }

  private isCurrentListLoad(requestId: number, workspaceId: string): boolean {
    return (
      requestId === this.loadRequestId &&
      this.workspaceService.currentWorkspace()?.id === workspaceId
    );
  }

  private resetPurchaseDetail(): void {
    this.detailLoadRequestId += 1;
    this.saleHistoryLoadRequestId += 1;
    this.selectedPurchaseRaw.set(null);
    this.purchaseItemsFallback.set([]);
    this.purchaseLinesRaw.set([]);
    this.purchaseSaleHistoryState.set('idle');
    this.purchaseSaleReviewInventoryItemId.set(null);
  }

  private isCurrentDetailLoad(requestId: number, workspaceId: string): boolean {
    return (
      requestId === this.detailLoadRequestId &&
      this.workspaceService.currentWorkspace()?.id === workspaceId
    );
  }

  async getPurchaseById(id: string): Promise<Purchase | null> {
    const requestId = Number.isFinite(this.detailLoadRequestId) ? this.detailLoadRequestId + 1 : 1;
    this.detailLoadRequestId = requestId;
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    this.selectedPurchaseRaw.set(null);
    this.purchaseItemsFallback.set([]);
    this.purchaseLinesRaw.set([]);
    if (!workspaceId) return null;
    const saleHistoryLoad = workspaceId
      ? this.loadPurchaseSaleHistory(workspaceId, id)
      : Promise.resolve<PurchaseSaleHistoryState>('error');
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('purchases')
        .select(
          `
          *,
          source:sources(*),
          supplier:suppliers(*),
          costs:purchase_costs!purchase_costs_workspace_purchase_fkey(*),
          items:inventory_items(*),
          purchase_lines!purchase_lines_purchase_id_fkey(*)
        `,
        )
        .eq('workspace_id', workspaceId)
        .eq('id', id)
        .single();

      if (!this.isCurrentDetailLoad(requestId, workspaceId)) return null;

      if (error || !data) {
        if (error) this.syncStatus.melde('Abrufen des Einkaufs', error);
        await saleHistoryLoad;
        if (!this.isCurrentDetailLoad(requestId, workspaceId)) return null;
        return null;
      }

      const purchase = data as unknown as Purchase;
      if (purchase.workspace_id !== workspaceId) {
        await saleHistoryLoad;
        return null;
      }
      const purchaseItemsForWorkspace = (purchase.items || []).filter(
        (item) => item.workspace_id === workspaceId,
      );
      const purchaseLinesForWorkspace = (purchase.purchase_lines || []).filter(
        (line) => line.workspace_id === workspaceId,
      );
      const costsSum = (purchase.costs || []).reduce(
        (acc, cost) => acc + Number(cost.amount || 0),
        0,
      );
      const totalCost =
        purchase.purchase_price === null
          ? null
          : Number(purchase.purchase_price) - Number(purchase.discount_amount ?? 0) + costsSum;

      const enriched: Purchase = {
        ...purchase,
        type: purchase.type as PurchaseType,
        items: purchaseItemsForWorkspace,
        purchase_lines: purchaseLinesForWorkspace,
        items_count: this.zaehleArtikel(
          purchase,
          purchaseItemsForWorkspace,
          purchaseLinesForWorkspace,
        ),
        total_purchase_cost: totalCost === null ? null : Number(totalCost.toFixed(2)),
      };

      await Promise.all([this.loadPurchaseLines(id, requestId), saleHistoryLoad]);
      if (!this.isCurrentDetailLoad(requestId, workspaceId)) return null;
      this.selectedPurchaseRaw.set(enriched);
      this.purchaseItemsFallback.set(purchaseItemsForWorkspace);
      return enriched;
    } catch (err) {
      if (this.isCurrentDetailLoad(requestId, workspaceId)) {
        this.syncStatus.melde('GetPurchaseById', err);
      }
      return null;
    } finally {
      if (requestId === this.detailLoadRequestId) {
        this.isLoading.set(false);
      }
    }
  }

  /**
   * Prüft unveränderliche Verkaufsbelege des Einkaufs. Der Zustand `none`
   * wird ausschließlich nach einer erfolgreichen Serverantwort gesetzt;
   * Ladefehler können deshalb niemals versehentlich das Wiederöffnen erlauben.
   */
  async loadPurchaseSaleHistory(
    workspaceId: string,
    purchaseId: string,
  ): Promise<PurchaseSaleHistoryState> {
    const requestId = Number.isFinite(this.saleHistoryLoadRequestId)
      ? this.saleHistoryLoadRequestId + 1
      : 1;
    this.saleHistoryLoadRequestId = requestId;
    this.purchaseSaleHistoryState.set('loading');
    this.purchaseSaleReviewInventoryItemId.set(null);

    let nextState: PurchaseSaleHistoryState;
    let nextReviewInventoryItemId: string | null = null;
    try {
      const { data, error } = await (
        this.supabase.client as unknown as PurchaseSaleHistoryRpcClient
      ).rpc('get_purchase_sale_history', {
        p_workspace_id: workspaceId,
        p_purchase_id: purchaseId,
      });
      if (
        requestId !== this.saleHistoryLoadRequestId ||
        this.workspaceService.currentWorkspace()?.id !== workspaceId
      ) {
        return this.purchaseSaleHistoryState();
      }
      const outcome = error ? null : parsePurchaseSaleHistoryOutcome(data);
      if (!outcome) {
        this.syncStatus.melde(
          'Prüfen des Einkaufs-Verkaufsverlaufs',
          error ?? new Error('Die Antwort zum Verkaufsverlauf ist ungültig.'),
        );
        nextState = 'error';
      } else {
        nextState = outcome.state;
        nextReviewInventoryItemId = outcome.reviewInventoryItemId;
      }
    } catch (error: unknown) {
      if (
        requestId !== this.saleHistoryLoadRequestId ||
        this.workspaceService.currentWorkspace()?.id !== workspaceId
      ) {
        return this.purchaseSaleHistoryState();
      }
      this.syncStatus.melde('Prüfen des Einkaufs-Verkaufsverlaufs', error);
      nextState = 'error';
    }

    if (
      requestId !== this.saleHistoryLoadRequestId ||
      this.workspaceService.currentWorkspace()?.id !== workspaceId
    ) {
      return this.purchaseSaleHistoryState();
    }
    this.purchaseSaleHistoryState.set(nextState);
    this.purchaseSaleReviewInventoryItemId.set(nextReviewInventoryItemId);
    return nextState;
  }

  async loadPurchaseLines(purchaseId: string, detailRequestId?: number): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) {
      if (detailRequestId === undefined) {
        this.purchaseLinesRaw.set([]);
      }
      return;
    }
    const mayPublish = (): boolean =>
      detailRequestId === undefined
        ? this.workspaceService.currentWorkspace()?.id === workspaceId
        : this.isCurrentDetailLoad(detailRequestId, workspaceId);

    try {
      const { data, error } = await this.supabase.client
        .from('purchase_lines')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('purchase_id', purchaseId)
        .order('created_at', { ascending: true });
      if (error) {
        if (mayPublish()) {
          this.syncStatus.melde('Laden der Einkaufspositionen', error);
        }
        return;
      }
      if (mayPublish()) {
        this.purchaseLinesRaw.set((data ?? []) as PurchaseLine[]);
      }
    } catch (error: unknown) {
      if (mayPublish()) {
        this.syncStatus.melde('Laden der Einkaufspositionen', error);
      }
    }
  }

  async createPurchase(payload: CreatePurchasePayload): Promise<CreatePurchaseResult> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) {
      return {
        status: 'failed',
        data: null,
        error: new Error('Kein aktiver Workspace'),
        reportedBySyncStatus: false,
        problems: [],
      };
    }

    const moneyError = this.validatePurchaseMoney(payload);
    if (moneyError) {
      return {
        status: 'failed',
        data: null,
        error: moneyError,
        reportedBySyncStatus: false,
        problems: [],
      };
    }

    const normalizedLines = this.normalizePurchaseLines(
      payload.purchase_lines ?? [],
      payload.pricing_mode ?? (payload.type === 'mystery_pack' ? 'total' : 'individual'),
    );
    if (normalizedLines.error) {
      return {
        status: 'failed',
        data: null,
        error: normalizedLines.error,
        reportedBySyncStatus: false,
        problems: [],
      };
    }

    const mode: CostAllocationMode = payload.cost_allocation_mode || 'even';
    // Leerzeilen aus dem Formular sind keine Kosten und haetten sonst dauerhaft
    // mit 0 EUR in der Aufstellung des Einkaufs gestanden.
    const kostenZeilen = (payload.initial_costs || [])
      .filter((c) => Number(c.amount) > 0)
      .map((c) => ({
        type: c.type,
        amount: Number(c.amount),
        description: c.description?.trim() || null,
        tax_treatment: c.taxTreatment ?? null,
        allocation_method: this.toPersistedAllocationMethod(
          payload.pricing_mode === 'total' ? 'by_quantity' : (c.allocationMethod ?? 'by_value'),
        ),
        target_purchase_line_id:
          c.allocationMethod === 'direct' ? (c.targetPurchaseLineId ?? null) : null,
      }));
    const extraCostsSum = kostenZeilen.reduce((acc, c) => acc + c.amount, 0);
    const totalCost =
      payload.purchase_price === null
        ? null
        : Number(
            (payload.purchase_price - (payload.discount_amount ?? 0) + extraCostsSum).toFixed(2),
          );

    // Aus den geladenen Stammdaten, nicht aus dem lokalen Spiegel: Der ist im
    // angemeldeten Betrieb leer, wodurch die frische Kachel weder Quelle noch
    // Lieferant anzeigte, bis die Seite neu geladen wurde.
    const source = payload.source_id
      ? this.sourcesService.sources().find((s) => s.id === payload.source_id)
      : undefined;
    const supplier = payload.supplier_id
      ? this.suppliersService.suppliers().find((s) => s.id === payload.supplier_id)
      : undefined;

    const newPurchase: Purchase = {
      id: `pur-${Date.now()}`,
      workspace_id: ws.id,
      source_id: payload.source_id || null,
      supplier_id: payload.supplier_id || null,
      source,
      supplier,
      type: payload.type,
      title: payload.title.trim(),
      purchase_date: payload.purchase_date,
      purchase_price: payload.purchase_price,
      discount_amount: payload.discount_amount ?? 0,
      content_status: payload.content_status ?? 'known',
      pricing_mode: payload.pricing_mode ?? null,
      shipment_status: payload.shipment_status ?? 'not_shipped',
      supplier_reference: payload.supplier_reference?.trim() || null,
      ...this.sellerSnapshotFields(payload),
      seller_details_version: 0,
      request_id: payload.request_id ?? null,
      total_purchase_cost: totalCost,
      cost_allocation_mode: mode,
      notes: payload.notes || null,
      tracking_number: payload.tracking_number?.trim() || null,
      tracking_carrier: payload.tracking_carrier || (payload.tracking_number ? 'dhl' : null),
      tracking_status: payload.tracking_status || (payload.tracking_number ? 'in_transit' : null),
      original_url: payload.original_url || null,
      receiving_status: 'draft',
      items_count:
        normalizedLines.data.length > 0
          ? normalizedLines.data.reduce(
              (count, line) => count + (line.isPackage ? 0 : line.orderedQuantity),
              0,
            )
          : payload.items_count || 0,
      costs: kostenZeilen,
      created_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await this.supabase.client.rpc('create_purchase', {
        p_workspace_id: ws.id,
        p_purchase: {
          request_id: payload.request_id ?? null,
          source_id: payload.source_id || null,
          supplier_id: payload.supplier_id || null,
          type: payload.type,
          title: payload.title.trim(),
          purchase_date: payload.purchase_date,
          purchase_price: payload.purchase_price,
          discount_amount: payload.discount_amount ?? 0,
          content_status: payload.content_status ?? 'known',
          pricing_mode:
            payload.pricing_mode ?? (payload.type === 'mystery_pack' ? 'total' : 'individual'),
          shipment_status: payload.shipment_status ?? 'not_shipped',
          supplier_reference: payload.supplier_reference?.trim() || null,
          cost_allocation_mode: mode,
          notes: payload.notes?.trim() || null,
          tracking_number: payload.tracking_number?.trim() || null,
          tracking_carrier: payload.tracking_carrier || (payload.tracking_number ? 'dhl' : null),
          tracking_status:
            payload.tracking_status || (payload.tracking_number ? 'in_transit' : 'pending'),
          original_url: payload.original_url || null,
          ...this.sellerSnapshotFields(payload),
        },
        p_expenses: kostenZeilen.map((cost) => ({
          type: cost.type,
          amount: cost.amount,
          description: cost.description,
          tax_treatment: cost.tax_treatment,
          allocation_method: cost.allocation_method,
          target_purchase_line_ref:
            cost.allocation_method === 'direct' ? cost.target_purchase_line_id : null,
        })),
        p_lines: normalizedLines.data.map((line) => ({
          client_ref: line.draftId ?? null,
          catalog_product_id: line.catalogProductId,
          title_snapshot: line.titleSnapshot,
          ean_snapshot: line.ean ?? null,
          line_kind: line.lineKind,
          is_package: line.isPackage ?? false,
          ordered_quantity: line.orderedQuantity,
          price_mode: line.priceMode ?? 'priced',
          unit_purchase_price: line.unitPurchasePrice,
          line_total: line.lineTotal,
          condition_snapshot: line.condition ?? null,
          estimated_market_value: line.estimatedMarketValue ?? null,
          allocated_additional_cost: line.allocatedAdditionalCost ?? 0,
        })),
      });
      if (error || !data || typeof data !== 'object') {
        const reported = this.syncStatus.melde(
          'Speichern des Einkaufs',
          error ?? new Error('Der Einkauf wurde nicht zurückgegeben.'),
        );
        return {
          status: 'failed',
          data: null,
          error: reported,
          reportedBySyncStatus: true,
          problems: [],
        };
      }

      const response = data as unknown as Record<string, unknown>;
      const dbPurchase = response['purchase'] as Purchase | undefined;
      if (!dbPurchase?.id) throw new Error('Der Einkauf wurde nicht zurückgegeben.');
      const lines = Array.isArray(response['purchase_lines'])
        ? (response['purchase_lines'] as PurchaseLine[])
        : [];
      const eanUpdates = lines.flatMap((line, index) => {
        const ean = normalizedLines.data[index]?.ean;
        return ean === undefined ? [] : [{ id: line.id, ean: ean ?? null }];
      });
      const eanError = await this.persistPurchaseLineEans(ws.id, eanUpdates);
      if (eanError) {
        const reported = this.syncStatus.melde('Speichern der EAN/GTIN', eanError);
        return {
          status: 'failed',
          data: null,
          error: reported,
          reportedBySyncStatus: true,
          problems: [],
        };
      }
      const persistedLines = lines.map((line, index) => ({
        ...line,
        ean_snapshot:
          normalizedLines.data[index]?.ean === undefined
            ? (line.ean_snapshot ?? null)
            : (normalizedLines.data[index]?.ean ?? null),
      }));
      const costs = Array.isArray(response['purchase_costs'])
        ? (response['purchase_costs'] as PurchaseCost[])
        : [];
      const finalPurchase: Purchase = {
        ...newPurchase,
        ...dbPurchase,
        source,
        supplier,
        costs,
        purchase_lines: persistedLines,
        items_count: persistedLines.reduce((count, line) => count + line.ordered_quantity, 0),
        total_purchase_cost: dbPurchase.total_purchase_cost ?? newPurchase.total_purchase_cost,
      };
      this.purchasesRaw.update((list) => [
        finalPurchase,
        ...list.filter((purchase) => purchase.id !== finalPurchase.id),
      ]);
      if (this.selectedPurchase()?.id === finalPurchase.id)
        this.purchaseLinesRaw.set(persistedLines);

      const problems: PurchaseCreateProblem[] = [];
      this.webhookService.sendPurchaseNotification(finalPurchase);
      return problems.length > 0
        ? {
            status: 'partial',
            data: finalPurchase,
            error: null,
            reportedBySyncStatus: problems.some((problem) => problem.reportedBySyncStatus),
            problems,
          }
        : {
            status: 'success',
            data: finalPurchase,
            error: null,
            reportedBySyncStatus: false,
            problems: [],
          };
    } catch (error: unknown) {
      const reported = this.syncStatus.melde('Erstellen des Einkaufs', error);
      return {
        status: 'failed',
        data: null,
        error: reported,
        reportedBySyncStatus: true,
        problems: [],
      };
    }
  }

  async updatePurchaseDraft(
    purchaseId: string,
    payload: CreatePurchasePayload,
  ): Promise<MutationResult<Purchase>> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) {
      return {
        data: null,
        error: new Error('Kein aktiver Workspace'),
        reportedBySyncStatus: false,
      };
    }

    const moneyError = this.validatePurchaseMoney(payload);
    if (moneyError) {
      return { data: null, error: moneyError, reportedBySyncStatus: false };
    }

    const normalizedLines = this.normalizePurchaseLines(
      payload.purchase_lines ?? [],
      payload.pricing_mode ?? (payload.type === 'mystery_pack' ? 'total' : 'individual'),
    );
    if (normalizedLines.error) {
      return { data: null, error: normalizedLines.error, reportedBySyncStatus: false };
    }

    const mode: CostAllocationMode = payload.cost_allocation_mode || 'even';
    const costs = (payload.initial_costs ?? [])
      .filter((cost) => Number(cost.amount) > 0)
      .map((cost) => ({
        type: cost.type,
        amount: Number(cost.amount),
        description: cost.description?.trim() || null,
        tax_treatment: cost.taxTreatment ?? null,
        allocation_method: this.toPersistedAllocationMethod(
          payload.pricing_mode === 'total' ? 'by_quantity' : (cost.allocationMethod ?? 'by_value'),
        ),
        target_purchase_line_ref:
          cost.allocationMethod === 'direct' ? (cost.targetPurchaseLineId ?? null) : null,
      }));
    const source = payload.source_id
      ? this.sourcesService.sources().find((entry) => entry.id === payload.source_id)
      : undefined;
    const supplier = payload.supplier_id
      ? this.suppliersService.suppliers().find((entry) => entry.id === payload.supplier_id)
      : undefined;

    try {
      const { data, error } = await this.supabase.client.rpc('update_purchase_draft', {
        p_workspace_id: workspace.id,
        p_purchase_id: purchaseId,
        p_purchase: {
          source_id: payload.source_id || null,
          supplier_id: payload.supplier_id || null,
          type: payload.type,
          title: payload.title.trim(),
          purchase_date: payload.purchase_date,
          purchase_price: payload.purchase_price,
          discount_amount: payload.discount_amount ?? 0,
          content_status: payload.content_status ?? 'known',
          pricing_mode:
            payload.pricing_mode ?? (payload.type === 'mystery_pack' ? 'total' : 'individual'),
          shipment_status: payload.shipment_status ?? 'not_shipped',
          supplier_reference: payload.supplier_reference?.trim() || null,
          cost_allocation_mode: mode,
          notes: payload.notes?.trim() || null,
          tracking_number: payload.tracking_number?.trim() || null,
          tracking_carrier: payload.tracking_carrier || (payload.tracking_number ? 'dhl' : null),
          tracking_status:
            payload.tracking_status || (payload.tracking_number ? 'in_transit' : 'pending'),
          original_url: payload.original_url || null,
          ...this.sellerSnapshotFields(payload),
        },
        p_expenses: costs,
        p_lines: normalizedLines.data.map((line) => ({
          client_ref: line.draftId ?? null,
          catalog_product_id: line.catalogProductId,
          title_snapshot: line.titleSnapshot,
          ean_snapshot: line.ean ?? null,
          line_kind: line.lineKind,
          is_package: line.isPackage ?? false,
          ordered_quantity: line.orderedQuantity,
          price_mode: line.priceMode ?? 'priced',
          unit_purchase_price: line.unitPurchasePrice,
          line_total: line.lineTotal,
          condition_snapshot: line.condition ?? null,
          estimated_market_value: line.estimatedMarketValue ?? null,
          allocated_additional_cost: line.allocatedAdditionalCost ?? 0,
        })),
      });
      if (error || !data || typeof data !== 'object') {
        const reported = this.syncStatus.melde(
          'Speichern des Einkaufsentwurfs',
          error ?? new Error('Der Einkaufsentwurf wurde nicht zurückgegeben.'),
        );
        return { data: null, error: reported, reportedBySyncStatus: true };
      }

      const response = data as unknown as Record<string, unknown>;
      const dbPurchase = response['purchase'] as Purchase | undefined;
      if (!dbPurchase?.id) throw new Error('Der Einkaufsentwurf wurde nicht zurückgegeben.');
      const lines = Array.isArray(response['purchase_lines'])
        ? (response['purchase_lines'] as PurchaseLine[])
        : [];
      const eanUpdates = lines.flatMap((line, index) => {
        const ean = normalizedLines.data[index]?.ean;
        return ean === undefined ? [] : [{ id: line.id, ean: ean ?? null }];
      });
      const eanError = await this.persistPurchaseLineEans(workspace.id, eanUpdates);
      if (eanError) {
        const reported = this.syncStatus.melde('Speichern der EAN/GTIN', eanError);
        return { data: null, error: reported, reportedBySyncStatus: true };
      }
      const persistedLines = lines.map((line, index) => ({
        ...line,
        ean_snapshot:
          normalizedLines.data[index]?.ean === undefined
            ? (line.ean_snapshot ?? null)
            : (normalizedLines.data[index]?.ean ?? null),
      }));
      const persistedCosts = Array.isArray(response['purchase_costs'])
        ? (response['purchase_costs'] as PurchaseCost[])
        : [];
      const updatedPurchase: Purchase = {
        ...dbPurchase,
        source,
        supplier,
        costs: persistedCosts,
        purchase_lines: persistedLines,
        items_count: persistedLines.reduce((count, line) => count + line.ordered_quantity, 0),
      };
      this.purchasesRaw.update((current) =>
        current.map((purchase) => (purchase.id === purchaseId ? updatedPurchase : purchase)),
      );
      if (this.selectedPurchase()?.id === purchaseId) {
        this.selectedPurchaseRaw.set(updatedPurchase);
        this.purchaseLinesRaw.set(persistedLines);
      }
      return { data: updatedPurchase, error: null, reportedBySyncStatus: false };
    } catch (cause: unknown) {
      return {
        data: null,
        error: this.syncStatus.melde('Speichern des Einkaufsentwurfs', cause),
        reportedBySyncStatus: true,
      };
    }
  }

  async createPurchaseLines(
    purchaseId: string,
    inputs: readonly CreatePurchaseLineInput[],
  ): Promise<MutationResult<readonly PurchaseLine[]>> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) {
      return {
        data: null,
        error: new Error('Kein aktiver Workspace'),
        reportedBySyncStatus: false,
      };
    }

    const normalized = this.normalizePurchaseLines(
      inputs,
      this.selectedPurchase()?.pricing_mode ??
        (this.selectedPurchase()?.type === 'mystery_pack' ? 'total' : 'individual'),
    );
    if (normalized.error) {
      return { data: null, error: normalized.error, reportedBySyncStatus: false };
    }
    if (normalized.data.length === 0) {
      return { data: [], error: null, reportedBySyncStatus: false };
    }

    const rows = normalized.data.map((line) => ({
      catalog_product_id: line.catalogProductId,
      title_snapshot: line.titleSnapshot,
      ean_snapshot: line.ean ?? null,
      line_kind: line.lineKind,
      is_package: line.isPackage ?? false,
      ordered_quantity: line.orderedQuantity,
      received_quantity: 0,
      unit_purchase_price: line.unitPurchasePrice,
      line_total: line.lineTotal,
      price_mode: line.priceMode ?? 'priced',
      condition_snapshot: line.condition ?? null,
      estimated_market_value: line.estimatedMarketValue ?? null,
      allocated_additional_cost: line.allocatedAdditionalCost ?? 0,
    }));

    try {
      const { data, error } = await this.supabase.client.rpc('add_purchase_lines', {
        p_workspace_id: workspaceId,
        p_purchase_id: purchaseId,
        p_lines: rows,
      });
      if (error || !data || typeof data !== 'object') {
        const reported = this.syncStatus.melde(
          'Speichern der Einkaufspositionen',
          error ?? new Error('Die Einkaufspositionen wurden nicht zurückgegeben.'),
        );
        return { data: null, error: reported, reportedBySyncStatus: true };
      }
      const response = data as unknown as Record<string, unknown>;
      const lines = Array.isArray(response['purchase_lines'])
        ? (response['purchase_lines'] as PurchaseLine[])
        : [];
      const eanUpdates = lines.flatMap((line, index) => {
        const ean = normalized.data[index]?.ean;
        return ean === undefined ? [] : [{ id: line.id, ean: ean ?? null }];
      });
      const eanError = await this.persistPurchaseLineEans(workspaceId, eanUpdates);
      if (eanError) {
        const reported = this.syncStatus.melde('Speichern der EAN/GTIN', eanError);
        return { data: null, error: reported, reportedBySyncStatus: true };
      }
      const persistedLines = lines.map((line, index) => ({
        ...line,
        ean_snapshot:
          normalized.data[index]?.ean === undefined
            ? (line.ean_snapshot ?? null)
            : (normalized.data[index]?.ean ?? null),
      }));
      if (this.selectedPurchase()?.id === purchaseId) {
        this.purchaseLinesRaw.update((current) => [...current, ...persistedLines]);
      }
      return { data: persistedLines, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      const reported = this.syncStatus.melde('Speichern der Einkaufspositionen', error);
      return { data: null, error: reported, reportedBySyncStatus: true };
    }
  }

  private async persistPurchaseLineEans(
    workspaceId: string,
    lines: readonly { readonly id: string; readonly ean: string | null }[],
  ): Promise<Error | null> {
    if (lines.length === 0) return null;
    try {
      const { error } = await this.supabase.client.rpc('set_purchase_line_eans', {
        p_workspace_id: workspaceId,
        p_lines: lines.map((line) => ({ id: line.id, ean: line.ean })),
      });
      return error ?? null;
    } catch (cause: unknown) {
      return cause instanceof Error
        ? cause
        : new Error('Die EAN/GTIN konnte nicht gespeichert werden.');
    }
  }

  private normalizePurchaseLines(
    inputs: readonly CreatePurchaseLineInput[],
    pricingMode: 'individual' | 'total' = 'individual',
  ): {
    data: readonly CreatePurchaseLineInput[];
    error: Error | null;
  } {
    const lines = inputs.map((line) => ({
      ...line,
      titleSnapshot: line.titleSnapshot.trim(),
      ean: line.ean === undefined ? undefined : line.ean?.trim() || null,
      orderedQuantity: Number(line.orderedQuantity),
      priceMode: line.priceMode ?? 'priced',
      unitPurchasePrice: line.unitPurchasePrice === null ? null : Number(line.unitPurchasePrice),
      lineTotal: line.lineTotal === null ? null : Number(line.lineTotal),
      estimatedMarketValue:
        line.estimatedMarketValue === null || line.estimatedMarketValue === undefined
          ? null
          : Number(line.estimatedMarketValue),
      allocatedAdditionalCost:
        line.allocatedAdditionalCost === undefined
          ? undefined
          : Number(line.allocatedAdditionalCost),
    }));
    for (const line of lines) {
      if (line.isPackage !== undefined && typeof line.isPackage !== 'boolean')
        return { data: [], error: new Error('Die Paketkennzeichnung ist ungültig.') };
      if (
        line.isPackage &&
        (line.lineKind !== 'individual' ||
          line.catalogProductId !== null ||
          line.orderedQuantity !== 1 ||
          line.priceMode !== 'priced' ||
          line.unitPurchasePrice === null ||
          line.lineTotal === null)
      ) {
        return {
          data: [],
          error: new Error(
            'Ein Paket benötigt Menge eins, einen bekannten Preis und darf keinen Artikelstamm verwenden.',
          ),
        };
      }
      if (
        !line.titleSnapshot ||
        !Number.isInteger(line.orderedQuantity) ||
        line.orderedQuantity < 1
      ) {
        return { data: [], error: new Error('Jede Einkaufsposition benötigt Titel und Menge.') };
      }
      if (line.lineKind === 'quantity' && !line.catalogProductId) {
        return { data: [], error: new Error('Mengenartikel benötigen einen Artikelstamm.') };
      }
      if (line.lineKind === 'individual' && line.orderedQuantity !== 1) {
        return { data: [], error: new Error('Einzelartikel haben immer die Menge eins.') };
      }
      if (
        line.estimatedMarketValue !== null &&
        (!Number.isFinite(line.estimatedMarketValue) ||
          line.estimatedMarketValue < 0 ||
          toExactCents(line.estimatedMarketValue) === null)
      ) {
        return { data: [], error: new Error('Der geschätzte Marktwert ist ungültig.') };
      }
      if (
        line.allocatedAdditionalCost !== undefined &&
        (!Number.isFinite(line.allocatedAdditionalCost) ||
          line.allocatedAdditionalCost < 0 ||
          toExactCents(line.allocatedAdditionalCost) === null)
      ) {
        return { data: [], error: new Error('Die manuelle Kostenzuordnung ist ungültig.') };
      }
      if (pricingMode === 'total') {
        const isLegacyUnpricedLine =
          line.priceMode === 'unpriced_mystery' &&
          line.unitPurchasePrice === null &&
          line.lineTotal === null;
        if (isLegacyUnpricedLine) continue;
      }
      if (
        line.priceMode !== 'priced' ||
        line.unitPurchasePrice === null ||
        line.lineTotal === null ||
        !Number.isFinite(line.unitPurchasePrice) ||
        line.unitPurchasePrice < 0 ||
        !Number.isFinite(line.lineTotal) ||
        line.lineTotal < 0
      ) {
        return { data: [], error: new Error('Die Einkaufskosten müssen gültige Beträge sein.') };
      }
      const lineTotalCents = toExactCents(line.lineTotal);
      if (
        lineTotalCents === null ||
        Math.abs(line.unitPurchasePrice * line.orderedQuantity - line.lineTotal) > 0.00000001
      ) {
        return {
          data: [],
          error: new Error(
            'Positionssumme und durchschnittlicher EK je Stück müssen zusammenpassen.',
          ),
        };
      }
    }
    return { data: lines, error: null };
  }

  private validatePurchaseMoney(payload: CreatePurchasePayload): Error | null {
    if (
      payload.purchase_price !== null &&
      (typeof payload.purchase_price !== 'number' ||
        payload.purchase_price < 0 ||
        toExactCents(payload.purchase_price) === null)
    ) {
      return new Error('Der Kaufpreis muss centgenau und darf nicht negativ sein.');
    }

    if (
      payload.discount_amount !== undefined &&
      (!Number.isFinite(payload.discount_amount) ||
        payload.discount_amount < 0 ||
        toExactCents(payload.discount_amount) === null ||
        (payload.purchase_price !== null && payload.discount_amount > payload.purchase_price))
    ) {
      return new Error(
        'Der Rabatt muss centgenau sein und darf den Warenbetrag nicht übersteigen.',
      );
    }

    for (const cost of payload.initial_costs ?? []) {
      if (
        typeof cost.amount !== 'number' ||
        !Number.isFinite(cost.amount) ||
        cost.amount < 0 ||
        (cost.amount > 0 && toExactCents(cost.amount) === null)
      ) {
        return new Error('Zusatzkosten müssen positive centgenaue Beträge sein.');
      }
    }

    return null;
  }

  private toPersistedAllocationMethod(
    method: NonNullable<CreatePurchaseCostInput['allocationMethod']>,
  ): PurchaseCostAllocationMethod {
    if (method === 'by_quantity') return 'quantity';
    if (method === 'direct') return 'direct';
    return 'value_weighted';
  }

  /**
   * Schreibt die im Formular erfassten Zusatzkosten als eigene Zeilen.
   *
   * Bis hierhin wurden sie nur zur Gesamtsumme addiert und diese Summe in den
   * Einkauf geschrieben. Beim naechsten Laden rechnet die Liste die Summe aber
   * aus Einkaufspreis plus Kostenzeilen neu - und ohne Zeilen kam wieder der
   * blanke Einkaufspreis heraus. Versand und Fahrtkosten waren damit still
   * verschwunden, und mit ihnen die Grundlage jeder Margenrechnung.
   *
   * Erst hier, nach dem Speichern: Vorher traegt der Einkauf nur eine
   * Behelfskennung, und der Fremdschluessel zeigte ins Leere.
   */
  private async legeZusatzkostenAn(
    workspaceId: string,
    purchaseId: string,
    zeilen: PurchaseCost[],
  ): Promise<{ error: Error | null; reportedBySyncStatus: boolean }> {
    if (zeilen.length === 0) return { error: null, reportedBySyncStatus: false };

    try {
      const { error } = await this.supabase.client.from('purchase_costs').insert(
        zeilen.map((z) => ({
          workspace_id: workspaceId,
          purchase_id: purchaseId,
          type: z.type,
          amount: z.amount,
          description: z.description ?? null,
        })),
      );
      if (error) {
        return {
          error: this.syncStatus.melde('Speichern der Zusatzkosten', error),
          reportedBySyncStatus: true,
        };
      }
    } catch (e: unknown) {
      return {
        error: this.syncStatus.melde('Speichern der Zusatzkosten', e),
        reportedBySyncStatus: true,
      };
    }

    return { error: null, reportedBySyncStatus: false };
  }

  /**
   * Legt fuer einen Einzelkauf den zugehoerigen Inventar-Artikel an.
   *
   * Das Formular fragt bei einem Einzelkauf nach Zustand und erwartetem
   * Marktwert und beschriftet den Kasten mit "1 Kauf -> 1 Inventar-Artikel".
   * Genau das ist nie passiert: Die Angaben wurden mitgeschickt und
   * weggeworfen. Die Kachel zeigte trotzdem "1 Artikel", die Detailseite
   * "0 Posten" - beides war auf seine Weise richtig, weil es den Artikel
   * schlicht nicht gab.
   *
   * Die gesamten Einkaufskosten gehen auf diesen einen Artikel, denn er ist
   * der Einkauf. Liegt eine Sendungsnummer vor, ist er noch unterwegs und
   * bekommt "zu pruefen" - daraus macht die Zustellmeldung spaeter
   * "eingetroffen".
   */
  private async legeEinzelartikelAn(
    einkauf: Purchase,
    payload: CreatePurchasePayload,
    purchaseLineId?: string,
  ): Promise<PurchaseCreateProblem[]> {
    // Ein vorhandener Positionseditor steuert den Eingang ausdrücklich. Nur
    // der bisherige positionslose Einzelkauf erzeugt weiterhin sofort seinen
    // einen Inventarartikel. Sonst würde etwa eine Mengenposition bei noch
    // ausgewähltem Typ „Einzelkauf“ doppelt im Bestand erscheinen.
    if (einkauf.type !== 'single' || (payload.purchase_lines?.length ?? 0) > 0) return [];

    // Ein unbekannter Draft-Preis ist kein echter Nullpreis. Ein bepreister
    // Draft-Artikel startet kostenneutral; die Finalisierung weist ihm die
    // abgeleiteten Kosten atomar zu.
    if (einkauf.purchase_price === null) return [];

    const ergebnis = await this.inventory.createItem({
      purchase_id: einkauf.id,
      purchase_line_id: purchaseLineId ?? null,
      title: payload.single_item_title?.trim() || einkauf.title,
      condition: (payload.single_item_condition as ItemCondition) || 'used',
      status: payload.tracking_number?.trim() ? 'needs_review' : 'received',
      allocated_purchase_cost: 0,
      expected_value: payload.single_item_expected_value ?? null,
    });
    if (ergebnis.error) {
      return [
        {
          kind: 'inventory_item',
          error: ergebnis.error,
          reportedBySyncStatus: ergebnis.reportedBySyncStatus,
        },
      ];
    }
    return ergebnis.problems.map((problem) => ({
      kind: problem.kind,
      error: problem.error,
      reportedBySyncStatus: problem.reportedBySyncStatus,
    }));
  }

  /**
   * Aendert die Stammangaben eines Einkaufs.
   *
   * Bis hierhin liess sich an einem Einkauf nur die Sendungsnummer und der
   * Verteilungsmodus aendern. Ein Zahlendreher im Preis bedeutete: loeschen und
   * neu anlegen - und weil die Artikel per Fremdschluessel am Einkauf haengen,
   * waren sie damit auch weg.
   *
   * Die Artikel bleiben unberuehrt. Wer den Einkaufspreis aendert, aendert
   * damit nicht die bereits verteilten Kosten - das macht der Kostenallokator
   * bewusst als eigener Schritt. Dasselbe gilt fuer die Einkaufsart: Sie
   * beschreibt die Herkunft, nicht den Bestand - ein Lot, das sich als Mystery
   * Box entpuppt, behaelt seine bereits erfassten Artikel.
   */
  async updatePurchase(
    purchaseId: string,
    updates: {
      type?: PurchaseType;
      title?: string;
      purchase_date?: string;
      purchase_price?: number | null;
      source_id?: string | null;
      supplier_id?: string | null;
      original_url?: string | null;
      notes?: string | null;
      tracking_number?: string | null;
      tracking_carrier?: TrackingCarrier | null;
      receiving_status?: Purchase['receiving_status'];
      shipment_status?: Purchase['shipment_status'];
      content_status?: Purchase['content_status'];
      supplier_reference?: string | null;
      discount_amount?: number;
    },
  ): Promise<{ error: Error | null }> {
    const quelle = updates.source_id
      ? this.sourcesService.sources().find((s) => s.id === updates.source_id)
      : undefined;
    const lieferant = updates.supplier_id
      ? this.suppliersService.suppliers().find((s) => s.id === updates.supplier_id)
      : undefined;

    // Der Sendungsstatus haengt an der Nummer und wird nur angefasst, wenn die
    // Nummer selbst im Spiel war: Eine nachgetragene Sendung ist unterwegs,
    // eine geloeschte gibt es nicht mehr. Eine reine Preiskorrektur darf eine
    // laufende Zustellung dagegen nicht zurueckwerfen.
    const sendungsStatus: InboundTrackingStatus | undefined =
      updates.tracking_number === undefined
        ? undefined
        : updates.tracking_number?.trim()
          ? 'in_transit'
          : 'pending';

    const anwenden = (p: Purchase): Purchase => ({
      ...p,
      ...updates,
      source: updates.source_id === undefined ? p.source : quelle,
      supplier: updates.supplier_id === undefined ? p.supplier : lieferant,
      tracking_status: sendungsStatus ?? p.tracking_status,
      updated_at: new Date().toISOString(),
    });

    const lokalAnwenden = () => {
      this.purchasesRaw.update((liste) =>
        liste.map((p) => (p.id === purchaseId ? anwenden(p) : p)),
      );
      this.selectedPurchaseRaw.update((p) => (p && p.id === purchaseId ? anwenden(p) : p));
    };

    try {
      const { error } = await this.supabase.client
        .from('purchases')
        .update({
          type: updates.type,
          title: updates.title,
          purchase_date: updates.purchase_date,
          purchase_price: updates.purchase_price,
          source_id: updates.source_id,
          supplier_id: updates.supplier_id,
          original_url: updates.original_url,
          notes: updates.notes,
          tracking_number:
            updates.tracking_number === undefined
              ? undefined
              : updates.tracking_number?.trim() || null,
          // Ohne Nummer ergibt ein Dienstleister keinen Sinn - er bliebe sonst
          // als Rest einer geloeschten Sendung stehen.
          tracking_carrier: sendungsStatus === 'pending' ? null : updates.tracking_carrier,
          tracking_status: sendungsStatus,
          receiving_status: updates.receiving_status,
          shipment_status: updates.shipment_status,
          content_status: updates.content_status,
          supplier_reference: updates.supplier_reference,
          discount_amount: updates.discount_amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', purchaseId);

      if (error) {
        return { error: this.syncStatus.melde('Aendern des Einkaufs', error) };
      }
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Aendern des Einkaufs', e) };
    }

    lokalAnwenden();
    return { error: null };
  }

  /**
   * Trägt Quelle und Verkäuferangaben nach, auch bei abgeschlossenen Einkäufen.
   * Kosten, Positionen, Bestand und Status bleiben unberührt; ein veralteter
   * Versionsstand wird als Konflikt gemeldet statt still zu überschreiben.
   */
  async updatePurchaseSellerDetails(
    purchaseId: string,
    expectedVersion: number,
    details: PurchaseSellerDetails,
    reason: string | null,
  ): Promise<{ error: Error | null; conflict: boolean }> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { error: new Error('Kein aktiver Workspace'), conflict: false };

    const normalized = normalizePurchaseSellerDetails(details);
    const source = normalized.source_id
      ? this.sourcesService.sources().find((entry) => entry.id === normalized.source_id)
      : undefined;
    const supplier = normalized.supplier_id
      ? this.suppliersService.suppliers().find((entry) => entry.id === normalized.supplier_id)
      : undefined;
    const apply = (purchase: Purchase, version: number, confirmed?: Purchase): Purchase => ({
      ...purchase,
      ...(confirmed ?? {}),
      ...normalized,
      source,
      supplier,
      seller_details_version: version,
      updated_at: confirmed?.updated_at ?? new Date().toISOString(),
    });
    const applyLocally = (version: number, confirmed?: Purchase): void => {
      this.purchasesRaw.update((list) =>
        list.map((entry) => (entry.id === purchaseId ? apply(entry, version, confirmed) : entry)),
      );
      this.selectedPurchaseRaw.update((entry) =>
        entry?.id === purchaseId ? apply(entry, version, confirmed) : entry,
      );
    };

    try {
      const { data, error } = await this.supabase.client.rpc('update_purchase_seller_details', {
        p_workspace_id: workspace.id,
        p_purchase_id: purchaseId,
        p_expected_version: expectedVersion,
        p_details: { ...normalized },
        p_reason: reason?.trim() || undefined,
      });
      if (error) {
        if (error.code === '40001') {
          return { error: new Error(PURCHASE_SELLER_DETAILS_CONFLICT_MESSAGE), conflict: true };
        }
        return {
          error: this.syncStatus.melde('Speichern der Verkäuferangaben', error),
          conflict: false,
        };
      }
      const confirmed = this.purchaseFromMutationResult(data);
      if (!confirmed) {
        return {
          error: this.syncStatus.melde(
            'Speichern der Verkäuferangaben',
            new Error('Die bestätigte Einkaufsänderung fehlt.'),
          ),
          conflict: false,
        };
      }
      applyLocally(confirmed.seller_details_version ?? expectedVersion, confirmed);
      return { error: null, conflict: false };
    } catch (cause: unknown) {
      return {
        error: this.syncStatus.melde('Speichern der Verkäuferangaben', cause),
        conflict: false,
      };
    }
  }

  async setPurchaseWorkflowStatus(
    purchaseId: string,
    status: 'ordered' | 'arrived',
  ): Promise<{ error: Error | null }> {
    const purchase = this.purchases().find((entry) => entry.id === purchaseId);
    if (!purchase) return { error: new Error('Der Einkauf wurde nicht gefunden.') };

    try {
      const { data, error } = await this.supabase.client.rpc('update_purchase_workflow', {
        p_purchase_id: purchaseId,
        p_status: status,
      });
      if (error) return { error: this.syncStatus.melde('Ändern des Einkaufsstatus', error) };
      const updated = this.purchaseFromMutationResult(data);
      if (!updated) {
        return {
          error: this.syncStatus.melde(
            'Ändern des Einkaufsstatus',
            new Error('Die bestätigte Einkaufsänderung fehlt.'),
          ),
        };
      }
      this.uebernehmeEinkaufLokal(updated);
      return { error: null };
    } catch (error: unknown) {
      return { error: this.syncStatus.melde('Ändern des Einkaufsstatus', error) };
    }
  }

  /**
   * Setzt die Zusatzkosten eines Einkaufs auf genau diese Liste.
   *
   * Der Erfassungsdialog kennt keine einzelnen Aenderungen - er schickt immer
   * alle Zeilen, die im Formular stehen. Deshalb wird ersetzt statt
   * abgeglichen: erst raeumen, dann schreiben. Ein Abgleich Zeile fuer Zeile
   * braeuchte stabile Kennungen im Formular, und ohne die stuende nach dem
   * zweiten Speichern jede Position doppelt da.
   *
   * Die Gesamtkosten werden mitgefuehrt. Sie sind zwar beim Laden ohnehin aus
   * Preis plus Kostenzeilen berechnet, aber bis dahin zeigt die Kachel sonst
   * den alten Betrag.
   */
  async ersetzeZusatzkosten(
    purchaseId: string,
    kosten: {
      type: string;
      amount: number;
      description?: string | null;
      taxTreatment?: PurchaseCostTaxTreatment | null;
    }[],
  ): Promise<{ error: Error | null }> {
    const purchase = this.purchasesRaw().find((entry) => entry.id === purchaseId);
    if (!purchase) return { error: new Error('Der Einkauf wurde nicht gefunden.') };

    // Leerzeilen aus dem Formular sind keine Kosten. Sie wegzulassen ist
    // wichtiger als es aussieht: Eine Zeile mit 0 EUR haette sonst dauerhaft
    // in der Kostenaufstellung des Einkaufs gestanden.
    const zeilen: PurchaseCost[] = kosten
      .filter((k) => Number(k.amount) > 0)
      .map((k) => ({
        workspace_id: purchase.workspace_id,
        purchase_id: purchaseId,
        type: k.type,
        amount: Number(k.amount),
        description: k.description?.trim() || null,
        tax_treatment: k.taxTreatment ?? null,
      }));

    const summe = zeilen.reduce((acc, z) => acc + z.amount, 0);
    let gespeicherteZeilen = zeilen.map((zeile, index) => ({
      ...zeile,
      id: `cost-${Date.now()}-${index}`,
    }));

    const anwenden = (p: Purchase): Purchase => ({
      ...p,
      costs: gespeicherteZeilen,
      total_purchase_cost:
        p.purchase_price === null ? null : Number((Number(p.purchase_price) + summe).toFixed(2)),
      updated_at: new Date().toISOString(),
    });

    const lokalAktualisieren = (): void => {
      this.purchasesRaw.update((liste) =>
        liste.map((p) => (p.id === purchaseId ? anwenden(p) : p)),
      );
      this.selectedPurchaseRaw.update((p) => (p && p.id === purchaseId ? anwenden(p) : p));
    };

    try {
      const { error: loeschFehler } = await this.supabase.client
        .from('purchase_costs')
        .delete()
        .eq('purchase_id', purchaseId);

      if (loeschFehler) {
        return { error: this.syncStatus.melde('Aendern der Zusatzkosten', loeschFehler) };
      }

      if (zeilen.length > 0) {
        const { data, error: schreibFehler } = await this.supabase.client
          .from('purchase_costs')
          .insert(
            zeilen.map((z) => ({
              workspace_id: purchase.workspace_id,
              purchase_id: purchaseId,
              type: z.type,
              amount: z.amount,
              description: z.description ?? null,
              tax_treatment: z.tax_treatment ?? null,
            })),
          )
          .select('id, purchase_id, type, amount, description, tax_treatment, created_at');

        if (schreibFehler) {
          return { error: this.syncStatus.melde('Aendern der Zusatzkosten', schreibFehler) };
        }

        gespeicherteZeilen = (data ?? []).map((zeile) => ({
          ...zeile,
          amount: Number(zeile.amount),
          tax_treatment: parsePurchaseCostTaxTreatment(zeile.tax_treatment),
        }));
      }
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Aendern der Zusatzkosten', e) };
    }

    lokalAktualisieren();
    return { error: null };
  }

  async updatePurchaseTracking(
    purchaseId: string,
    trackingNumber: string | null,
    carrier?: TrackingCarrier | null,
    status?: InboundTrackingStatus | null,
  ): Promise<{ data: Purchase | null; error: Error | null }> {
    const existing = this.purchases().find((p) => p.id === purchaseId);
    if (!existing) return { data: null, error: new Error('Einkauf nicht gefunden') };

    const pendingUpdate: Purchase = {
      ...existing,
      tracking_number: trackingNumber ? trackingNumber.trim() : null,
      tracking_carrier: trackingNumber ? carrier || existing.tracking_carrier || 'dhl' : null,
      tracking_status: status ?? 'pending',
      updated_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await this.supabase.client.rpc('update_purchase_tracking', {
        p_purchase_id: purchaseId,
        p_tracking_number: pendingUpdate.tracking_number ?? '',
        p_tracking_carrier: pendingUpdate.tracking_carrier ?? '',
        p_tracking_status: pendingUpdate.tracking_status ?? 'pending',
      });
      if (error) {
        return {
          data: null,
          error: this.syncStatus.melde('Aktualisieren des Tracking-Status', error),
        };
      }
      const updated = this.purchaseFromMutationResult(data);
      if (!updated) {
        return {
          data: null,
          error: this.syncStatus.melde(
            'Aktualisieren des Tracking-Status',
            new Error('Die bestätigte Trackingänderung fehlt.'),
          ),
        };
      }
      this.uebernehmeEinkaufLokal(updated);
      return { data: updated, error: null };
    } catch (error: unknown) {
      return {
        data: null,
        error: this.syncStatus.melde('Aktualisieren des Tracking-Status', error),
      };
    }
  }

  async markPurchaseDeliveredAndSyncItems(
    purchaseId: string,
  ): Promise<{ updatedCount: number; error: Error | null }> {
    const existing = this.purchases().find((p) => p.id === purchaseId);
    if (!existing) return { updatedCount: 0, error: new Error('Einkauf nicht gefunden') };

    const { error } = await this.setPurchaseWorkflowStatus(purchaseId, 'arrived');
    if (error) return { updatedCount: 0, error };

    // Eine Zustellung bestätigt nur die Paketankunft. Bestand entsteht weiterhin
    // ausschließlich über den ausdrücklich ausgelösten Wareneingang.
    return { updatedCount: 0, error: null };
  }

  /**
   * Bucht nur mengenverfolgte Einkaufspositionen ein. Einzelartikel bleiben
   * absichtlich beim expliziten Inventarfluss und werden nicht als Lose
   * vervielfacht.
   */
  async receivePurchaseLines(
    purchaseId: string,
    lines: readonly ReceivePurchaseLineInput[],
  ): Promise<MutationResult<ReceivePurchaseResult>> {
    return this.stockService.receivePurchaseLines(purchaseId, lines);
  }

  async receiveIndividualPurchaseLine(
    purchaseId: string,
    purchaseLineId: string,
    input: ReceiveIndividualPurchaseLineInput,
  ): Promise<MutationResult<ReceiveIndividualPurchaseResult>> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) {
      return {
        data: null,
        error: new Error('Kein aktiver Workspace'),
        reportedBySyncStatus: false,
      };
    }

    try {
      const { data, error } = await this.supabase.client.rpc('receive_individual_purchase_line', {
        p_workspace_id: workspaceId,
        p_purchase_id: purchaseId,
        p_purchase_line_id: purchaseLineId,
        p_item: {
          title: input.title,
          condition: input.condition,
        },
      });
      if (error || !data) {
        const reported = this.syncStatus.melde(
          'Wareneingang für Einzelartikel buchen',
          error ?? new Error('Die Einkaufsposition wurde nicht zurückgegeben.'),
        );
        return { data: null, error: reported, reportedBySyncStatus: true };
      }
      const value = data as Record<string, unknown>;
      const confirmed = value['purchase_line'] as PurchaseLine;
      const inventoryItem = value['inventory_item'] as InventoryItem;
      const purchase = value['purchase'] as Purchase;
      if (!confirmed || !inventoryItem || !purchase) {
        return {
          data: null,
          error: new Error('Der Einzelartikel-Wareneingang wurde unvollständig zurückgegeben.'),
          reportedBySyncStatus: false,
        };
      }
      await this.refreshInventoryAfterMutation(workspaceId);
      if (this.workspaceService.currentWorkspace()?.id !== workspaceId) {
        return {
          data: { purchaseLine: confirmed, inventoryItem, purchase },
          error: null,
          reportedBySyncStatus: false,
        };
      }
      this.purchaseLinesRaw.update((lines) =>
        lines.map((line) => (line.id === purchaseLineId ? confirmed : line)),
      );
      this.uebernehmeEinkaufLokal(purchase);
      return {
        data: { purchaseLine: confirmed, inventoryItem, purchase },
        error: null,
        reportedBySyncStatus: false,
      };
    } catch (error: unknown) {
      const reported = this.syncStatus.melde('Wareneingang für Einzelartikel buchen', error);
      return { data: null, error: reported, reportedBySyncStatus: true };
    }
  }

  private async refreshInventoryAfterMutation(workspaceId: string): Promise<void> {
    if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
    await this.inventory.loadInventory(workspaceId);
  }

  /**
   * Stellt nach einer bestätigten Finalisierung alle drei Anzeigequellen
   * gemeinsam auf denselben Datenbankstand. Komponenten rufen damit nicht
   * mehrere, leicht auseinanderlaufende Einzel-Refreshes auf.
   */
  async refreshAfterFinalization(workspaceId: string, purchaseId: string): Promise<void> {
    if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
    await Promise.all([
      this.loadPurchases(workspaceId),
      this.stockService.loadPositions(workspaceId),
      this.inventory.loadInventory(workspaceId),
    ]);
    if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;

    const selected = this.selectedPurchaseRaw();
    const refreshed = this.purchasesRaw().find(
      (purchase) => purchase.id === purchaseId && purchase.workspace_id === workspaceId,
    );
    if (selected?.id === purchaseId && selected.workspace_id === workspaceId && refreshed) {
      this.selectedPurchaseRaw.set(refreshed);
      this.purchaseItemsFallback.set([]);
      this.purchaseLinesRaw.set(refreshed.purchase_lines ?? []);
    }
  }

  async deletePurchase(purchaseId: string): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client.from('purchases').delete().eq('id', purchaseId);
      if (error) {
        return { error: this.syncStatus.melde('Löschen des Einkaufs', error) };
      }
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Löschen des Einkaufs', e) };
    }

    this.purchasesRaw.update((list) => list.filter((p) => p.id !== purchaseId));
    // Die Datenbank raeumt die Artikel per Fremdschluessel mit ab; die Anzeige
    // muss nach dem bestaetigten Loeschen im selben Moment nachziehen.
    this.inventory.entferneArtikelZuEinkauf(purchaseId);
    if (this.selectedPurchase()?.id === purchaseId) {
      this.selectedPurchaseRaw.set(null);
    }

    return { error: null };
  }

  async addPurchaseCost(
    purchaseId: string,
    type: string,
    amount: number,
    description?: string,
    taxTreatment: PurchaseCostTaxTreatment | null = null,
  ): Promise<{ error: Error | null }> {
    const purchase = this.purchasesRaw().find((entry) => entry.id === purchaseId);
    if (!purchase) return { error: new Error('Der Einkauf wurde nicht gefunden.') };

    let costId: string;

    try {
      const { data, error } = await this.supabase.client
        .from('purchase_costs')
        .insert({
          workspace_id: purchase.workspace_id,
          purchase_id: purchaseId,
          type,
          amount,
          description: description?.trim() || null,
          tax_treatment: taxTreatment,
        })
        .select('id')
        .single();

      if (error) {
        return { error: this.syncStatus.melde('Hinzufügen der Einkaufskosten', error) };
      }
      costId = data.id;
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Hinzufügen der Einkaufskosten', e) };
    }

    const neueKosten: PurchaseCost = {
      id: costId,
      workspace_id: purchase.workspace_id,
      purchase_id: purchaseId,
      type,
      amount,
      description: description?.trim() || null,
      tax_treatment: taxTreatment,
    };
    const anwenden = (purchase: Purchase): Purchase => ({
      ...purchase,
      costs: [...(purchase.costs ?? []), neueKosten],
      total_purchase_cost:
        purchase.purchase_price === null
          ? null
          : Number(((purchase.total_purchase_cost ?? purchase.purchase_price) + amount).toFixed(2)),
    });

    this.purchasesRaw.update((purchases) =>
      purchases.map((purchase) => (purchase.id === purchaseId ? anwenden(purchase) : purchase)),
    );
    this.selectedPurchaseRaw.update((purchase) =>
      purchase?.id === purchaseId ? anwenden(purchase) : purchase,
    );

    return { error: null };
  }

  async updateCostAllocationMode(
    purchaseId: string,
    mode: CostAllocationMode,
  ): Promise<{ error: Error | null }> {
    const speichern = await this.speichereVerteilungsmodus(purchaseId, mode);
    if (speichern.error) return speichern;

    this.uebernehmeVerteilungsmodusLokal(purchaseId, mode);
    return { error: null };
  }

  private async speichereVerteilungsmodus(
    purchaseId: string,
    mode: CostAllocationMode,
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client
        .from('purchases')
        .update({ cost_allocation_mode: mode })
        .eq('id', purchaseId);

      if (error) {
        return { error: this.syncStatus.melde('Aktualisieren des Verteilungsmodus', error) };
      }
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Aktualisieren des Verteilungsmodus', e) };
    }

    return { error: null };
  }

  private uebernehmeVerteilungsmodusLokal(purchaseId: string, mode: CostAllocationMode): void {
    const current = this.selectedPurchase();
    if (current && current.id === purchaseId) {
      const updated = { ...current, cost_allocation_mode: mode };
      this.selectedPurchaseRaw.set(updated);
    }
    this.purchasesRaw.update((list) =>
      list.map((p) => (p.id === purchaseId ? { ...p, cost_allocation_mode: mode } : p)),
    );
  }

  async redistributeCosts(
    purchaseId: string,
    mode: CostAllocationMode,
    _itemValues?: { id: string; expected_value: number }[],
  ): Promise<{ error: Error | null }> {
    // Im Entwurf ist der Modus nur eine Planungseingabe. Echte Artikel- und
    // Loskosten schreibt ausschliesslich die atomare Einkaufsfinalisierung.
    // Insbesondere darf der geschaetzte Marktwert keine Kosten gewichten.
    return this.updateCostAllocationMode(purchaseId, mode);
  }

  async deletePurchaseCost(costId: string, purchaseId: string): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client.from('purchase_costs').delete().eq('id', costId);
      if (error) {
        return { error: this.syncStatus.melde('Löschen der Einkaufskosten', error) };
      }
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Löschen der Einkaufskosten', e) };
    }
    await this.getPurchaseById(purchaseId);
    return { error: null };
  }

  /**
   * Legt einen Artikel an und haengt ihn an diesen Einkauf.
   *
   * Die eigentliche Arbeit macht der Inventardienst: Nur so landet der Artikel
   * in derselben Liste, aus der Inventar, Artikeltabelle und Artikelanzahl der
   * Kachel abgeleitet werden - alles aktualisiert sich damit sofort.
   */
  async addItemToPurchase(
    purchaseId: string,
    itemData: {
      title: string;
      condition: ItemCondition;
      expected_value?: number;
      purchase_line_id?: string | null;
    },
  ): Promise<{ data: InventoryItem | null; error: Error | null }> {
    return this.inventory.createItem({
      purchase_id: purchaseId,
      purchase_line_id: itemData.purchase_line_id ?? null,
      title: itemData.title,
      condition: itemData.condition,
      status: 'received',
      allocated_purchase_cost: 0,
      expected_value: itemData.expected_value ?? null,
    });
  }

  private uebernehmeEinkaufLokal(purchase: Purchase): void {
    const selectedPurchase = this.selectedPurchaseRaw();
    this.purchasesRaw.update((list) =>
      list.map((entry) =>
        entry.id === purchase.id ? this.mergePurchaseMutation(entry, purchase) : entry,
      ),
    );
    if (selectedPurchase?.id === purchase.id) {
      this.selectedPurchaseRaw.set(this.mergePurchaseMutation(selectedPurchase, purchase));
    }
  }

  private mergePurchaseMutation(existing: Purchase, mutation: Purchase): Purchase {
    const definedMutation = Object.fromEntries(
      Object.entries(mutation).filter(([, value]) => value !== undefined),
    );
    return { ...existing, ...definedMutation };
  }

  private sellerSnapshotFields(payload: CreatePurchasePayload) {
    return {
      seller_type: payload.seller_type ?? null,
      seller_name: payload.seller_name?.trim() || null,
      seller_marketplace_username: payload.seller_marketplace_username?.trim() || null,
      seller_street: payload.seller_street?.trim() || null,
      seller_address_extra: payload.seller_address_extra?.trim() || null,
      seller_postal_code: payload.seller_postal_code?.trim() || null,
      seller_city: payload.seller_city?.trim() || null,
      seller_country_code: payload.seller_country_code?.trim().toUpperCase() || null,
      external_order_id: payload.external_order_id?.trim() || null,
    };
  }

  private purchaseFromMutationResult(data: unknown): Purchase | null {
    if (!data || typeof data !== 'object' || !('purchase' in data)) return null;
    const purchase = data.purchase;
    if (!purchase || typeof purchase !== 'object' || !('id' in purchase)) return null;
    return purchase as Purchase;
  }
}
