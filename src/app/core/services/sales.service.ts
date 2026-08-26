import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { InventoryService } from './inventory.service';
import { MockDataStoreService } from './mock-data-store.service';
import { WebhookService } from './webhook.service';
import { SyncStatusService } from './sync-status.service';
import {
  Sale,
  InventoryItem,
  ItemStatus,
  SaleLine,
  SaleLineLotAllocation,
  StockMovement,
} from '../models/flipbase.models';
import { MutationResult } from './catalog.service';

const STORAGE_KEY_PENDING_FOLLOW_UPS = 'flipbase_pending_sale_follow_ups';
const ITEM_STATUSES = new Set<string>([
  'received',
  'needs_review',
  'researched',
  'ready',
  'listed',
  'reserved',
  'sold',
  'returned',
  'archived',
  'defective',
]);

export interface CreateSalePayload {
  inventory_item_id: string;
  platform: string;
  sale_price: number;
  sale_date: string;
  platform_fee?: number;
  shipping_cost?: number;
  packaging_cost?: number;
  other_costs?: number;
  external_order_id?: string | null;
  external_listing_id?: string | null;
  buyer_notes?: string | null;
}

export interface RecordSaleLineInput {
  readonly catalogProductId?: string;
  readonly inventoryItemId?: string;
  readonly titleSnapshot?: string;
  readonly quantity: number;
  readonly unitSalePrice: number;
}

export interface RecordSaleInput {
  readonly platform: string;
  readonly saleDate: string;
  readonly platformFee?: number;
  readonly shippingCost?: number;
  readonly packagingCost?: number;
  readonly otherCosts?: number;
  readonly externalOrderId?: string | null;
  readonly externalListingId?: string | null;
  readonly buyerNotes?: string | null;
  readonly lines: readonly RecordSaleLineInput[];
}

export interface RecordSaleResult {
  readonly sale: Sale;
  readonly saleLines: readonly SaleLine[];
  readonly lotAllocations: readonly SaleLineLotAllocation[];
  readonly stockMovements: readonly StockMovement[];
}

export interface RecordReturnInput {
  readonly saleId: string;
  readonly refundAmount: number;
  readonly restock: boolean;
  readonly reason: string;
  readonly notes?: string | null;
}

export interface SaleMutationResult {
  readonly data: Sale | null;
  readonly error: Error | null;
  readonly status: 'success' | 'partial' | 'error';
  readonly problems: readonly SaleFollowUpProblem[];
}

export type SaleFollowUpKind = 'inventory_status' | 'sale_return_status';

export interface SaleFollowUpProblem {
  readonly kind: SaleFollowUpKind;
  readonly error: Error;
  readonly reportedBySyncStatus: boolean;
}

interface PendingFollowUp {
  readonly key: string;
  readonly workspaceId: string;
  readonly kind: SaleFollowUpKind;
  readonly inventoryItemId?: string;
  readonly targetStatus?: ItemStatus;
  readonly notes?: string;
  readonly saleId?: string;
  readonly refundAmount?: number;
}

@Injectable({
  providedIn: 'root',
})
export class SalesService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly profitEngine = inject(ProfitEngineService);
  private readonly inventoryService = inject(InventoryService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly webhookService = inject(WebhookService);

  readonly sales = signal<Sale[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly pendingFollowUps = signal<PendingFollowUp[]>(this.loadPendingFollowUps());

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService.currentWorkspace();
        if (ws) {
          this.loadSales(ws.id);
        } else {
          this.sales.set([]);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  async loadSales(workspaceId: string): Promise<void> {
    if (this.mockStore.isDemoMode()) {
      const localSales = this.mockStore.getSales(workspaceId).map((s) => this.enrichSaleMetrics(s));
      this.sales.set(localSales);
      return;
    }

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('sales')
        .select(
          `
          *,
          inventory_item:inventory_items(
            *,
            purchase:purchases(*, source:sources(*), supplier:suppliers(*)),
            costs:item_costs(*)
          ),
          sale_lines:sale_lines(
            *,
            lot_allocations:sale_line_lot_allocations(*),
            stock_movements:stock_movements(*)
          )
        `,
        )
        .eq('workspace_id', workspaceId)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        this.syncStatus.melde('Laden der Verkäufe', error);
        this.sales.set([]);
      } else if (data) {
        const enriched = (data as unknown[]).map((sale) => this.mapLoadedSale(sale));
        this.sales.set(enriched);
      }
      await this.retryPendingFollowUps(workspaceId);
    } catch (err) {
      this.syncStatus.melde('Laden der Verkäufe', err);
      this.sales.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  public enrichSaleMetrics(raw: any): Sale {
    const item = raw.inventory_item as InventoryItem | undefined;
    const salePrice = Number(raw.sale_price || 0);

    const itemPurchaseCost = Number(item?.allocated_purchase_cost || 0);
    const itemExtraCosts = (item?.costs || []).reduce(
      (sum: number, c: any) => sum + Number(c.amount || 0),
      0,
    );
    const totalItemBasisCost = itemPurchaseCost + itemExtraCosts;

    const fee = Number(raw.platform_fee || 0);
    const shipping = Number(raw.shipping_cost || 0);
    const packaging = Number(raw.packaging_cost || 0);
    const other = Number(raw.other_costs || 0);
    const totalSaleCosts = fee + shipping + packaging + other;

    const totalAllCosts = totalItemBasisCost + totalSaleCosts;
    const netProfit = this.profitEngine.calculateProfit(salePrice, totalAllCosts);
    const roi = this.profitEngine.calculateRoi(netProfit, totalAllCosts);

    let holdingDays = 0;
    const purchaseDate = item?.purchase?.purchase_date || item?.created_at;
    if (purchaseDate && raw.sale_date) {
      holdingDays = this.profitEngine.calculateHoldingDurationDays(purchaseDate, raw.sale_date);
    }

    return {
      ...raw,
      net_profit: netProfit,
      roi: roi,
      holding_duration_days: holdingDays,
    } as Sale;
  }

  private mapLoadedSale(raw: unknown): Sale {
    const sale = raw as Sale & { sale_lines?: SaleLine[] };
    const persistedLines = sale.sale_lines ?? [];
    const lines =
      persistedLines.length > 0
        ? persistedLines
        : sale.inventory_item_id
          ? [
              {
                id: `legacy-${sale.id}`,
                sale_id: sale.id,
                inventory_item_id: sale.inventory_item_id,
                title_snapshot: sale.inventory_item?.title ?? 'Artikel',
                quantity: 1,
                unit_sale_price: sale.sale_price,
                line_total: sale.sale_price,
                cost_of_goods_sold: sale.inventory_item?.allocated_purchase_cost ?? 0,
                tax_mode: 'diff_25a' as const,
              },
            ]
          : [];
    const allocations = lines.flatMap(
      (line) =>
        (
          line as SaleLine & {
            lot_allocations?: SaleLineLotAllocation[];
          }
        ).lot_allocations ?? [],
    );
    const movements = lines.flatMap(
      (line) =>
        (
          line as SaleLine & {
            stock_movements?: StockMovement[];
          }
        ).stock_movements ?? [],
    );
    return this.enrichSaleMetrics({
      ...sale,
      lines,
      lot_allocations: allocations,
      stock_movements: movements,
    });
  }

  /**
   * Bucht einen Mengen- oder Einzelartikelverkauf vollständig in einer
   * Datenbanktransaktion. Erst die RPC-Antwort darf den lokalen Zustand ändern.
   */
  async recordSale(input: RecordSaleInput): Promise<MutationResult<RecordSaleResult>> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId)
      return this.mutationFailure('Verkauf buchen', new Error('Kein aktiver Workspace'));

    if (this.mockStore.isDemoMode()) {
      const result = this.recordDemoSale(workspaceId, input);
      this.sales.update((sales) => [
        result.sale,
        ...sales.filter((sale) => sale.id !== result.sale.id),
      ]);
      this.mockStore.saveSale(result.sale);
      return { data: result, error: null, reportedBySyncStatus: false };
    }

    try {
      const { data, error } = await this.supabase.client.rpc('record_sale', {
        p_workspace_id: workspaceId,
        p_sale: {
          platform: input.platform,
          sale_date: input.saleDate,
          platform_fee: input.platformFee ?? 0,
          shipping_cost: input.shippingCost ?? 0,
          packaging_cost: input.packagingCost ?? 0,
          other_costs: input.otherCosts ?? 0,
          external_order_id: input.externalOrderId ?? null,
          external_listing_id: input.externalListingId ?? null,
          buyer_notes: input.buyerNotes ?? null,
        },
        p_lines: input.lines.map((line) => ({
          catalog_product_id: line.catalogProductId ?? null,
          inventory_item_id: line.inventoryItemId ?? null,
          title_snapshot: line.titleSnapshot ?? null,
          quantity: line.quantity,
          unit_sale_price: line.unitSalePrice,
        })),
      });
      if (error || !data || typeof data !== 'object') {
        return this.mutationFailure(
          'Verkauf buchen',
          error ?? new Error('Der Verkauf wurde nicht zurückgegeben.'),
        );
      }
      const result = this.mapRecordSaleResult(data as Record<string, unknown>);
      this.sales.update((sales) => [
        result.sale,
        ...sales.filter((sale) => sale.id !== result.sale.id),
      ]);
      return { data: result, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      return this.mutationFailure('Verkauf buchen', error);
    }
  }

  /** Bucht eine Retoure mit optionaler Wiedereinlagerung atomar. */
  async recordReturn(input: RecordReturnInput): Promise<MutationResult<Sale>> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId)
      return this.mutationFailure('Retoure buchen', new Error('Kein aktiver Workspace'));

    if (this.mockStore.isDemoMode()) {
      const existing = this.sales().find((sale) => sale.id === input.saleId);
      if (!existing)
        return this.mutationFailure(
          'Retoure buchen',
          new Error('Der Verkauf wurde nicht gefunden.'),
        );
      const sale = this.enrichSaleMetrics({
        ...existing,
        returned_at: new Date().toISOString(),
        refund_amount: input.refundAmount,
      });
      this.sales.update((sales) => sales.map((entry) => (entry.id === sale.id ? sale : entry)));
      this.mockStore.saveSale(sale);
      return { data: sale, error: null, reportedBySyncStatus: false };
    }

    try {
      const { data, error } = await this.supabase.client.rpc('record_sale_return', {
        p_workspace_id: workspaceId,
        p_sale_id: input.saleId,
        p_refund_amount: input.refundAmount,
        p_restock: input.restock,
        p_reason: input.reason,
        p_notes: input.notes ?? '',
      });
      if (error || !data || typeof data !== 'object') {
        return this.mutationFailure(
          'Retoure buchen',
          error ?? new Error('Die Retoure wurde nicht zurückgegeben.'),
        );
      }
      const response = data as Record<string, unknown>;
      const sale = this.enrichSaleMetrics({
        ...(response['sale'] as Sale),
        lines: this.arrayValue<SaleLine>(response['sale_lines']),
        lot_allocations: this.arrayValue<SaleLineLotAllocation>(response['lot_allocations']),
        stock_movements: this.arrayValue<StockMovement>(response['stock_movements']),
      });
      this.sales.update((sales) => sales.map((entry) => (entry.id === sale.id ? sale : entry)));
      return { data: sale, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      return this.mutationFailure('Retoure buchen', error);
    }
  }

  private mapRecordSaleResult(value: Record<string, unknown>): RecordSaleResult {
    const lines = this.arrayValue<SaleLine>(value['sale_lines']);
    const allocations = this.arrayValue<SaleLineLotAllocation>(value['lot_allocations']);
    const movements = this.arrayValue<StockMovement>(value['stock_movements']);
    const sale = this.enrichSaleMetrics({
      ...(value['sale'] as Sale),
      lines,
      lot_allocations: allocations,
      stock_movements: movements,
    });
    return { sale, saleLines: lines, lotAllocations: allocations, stockMovements: movements };
  }

  private recordDemoSale(workspaceId: string, input: RecordSaleInput): RecordSaleResult {
    const saleId = `sale-${Date.now()}`;
    const lines: SaleLine[] = input.lines.map((line, index) => ({
      id: `sale-line-${Date.now()}-${index}`,
      sale_id: saleId,
      catalog_product_id: line.catalogProductId ?? null,
      inventory_item_id: line.inventoryItemId ?? null,
      title_snapshot: line.titleSnapshot ?? 'Artikel',
      quantity: line.quantity,
      unit_sale_price: line.unitSalePrice,
      line_total: line.quantity * line.unitSalePrice,
      cost_of_goods_sold: 0,
      tax_mode: 'diff_25a',
    }));
    const total = lines.reduce((sum, line) => sum + line.line_total, 0);
    const sale = this.enrichSaleMetrics({
      id: saleId,
      workspace_id: workspaceId,
      platform: input.platform,
      sale_price: total,
      sale_price_total: total,
      sale_date: input.saleDate,
      platform_fee: input.platformFee ?? 0,
      shipping_cost: input.shippingCost ?? 0,
      packaging_cost: input.packagingCost ?? 0,
      other_costs: input.otherCosts ?? 0,
      lines,
    });
    return { sale, saleLines: lines, lotAllocations: [], stockMovements: [] };
  }

  private arrayValue<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private mutationFailure<T>(operation: string, cause: unknown): MutationResult<T> {
    const error = this.syncStatus.melde(operation, cause);
    return { data: null, error, reportedBySyncStatus: this.syncStatus.istZentralGemeldet(error) };
  }

  async createSale(payload: CreateSalePayload): Promise<SaleMutationResult> {
    // Kompatibilitätsadapter für den bestehenden Einzelartikel-Dialog. Die
    // Statusänderung erfolgt nun innerhalb von record_sale, nicht als
    // nachgelagerte lokale Warteschlange.
    const result = await this.recordSale({
      platform: payload.platform,
      saleDate: payload.sale_date,
      platformFee: payload.platform_fee,
      shippingCost: payload.shipping_cost,
      packagingCost: payload.packaging_cost,
      otherCosts: payload.other_costs,
      externalOrderId: payload.external_order_id,
      externalListingId: payload.external_listing_id,
      buyerNotes: payload.buyer_notes,
      lines: [
        {
          inventoryItemId: payload.inventory_item_id,
          quantity: 1,
          unitSalePrice: payload.sale_price,
        },
      ],
    });
    return {
      data: result.data?.sale ?? null,
      error: result.error,
      status: result.error ? 'error' : 'success',
      problems: [],
    };
  }

  /**
   * Aendert einen gebuchten Verkauf.
   *
   * Bisher liess sich ein Verkauf nur anlegen oder stornieren. Ein falsch
   * getippter Verkaufspreis oder eine nachtraeglich bekannte Plattformgebuehr
   * bedeutete: stornieren, den Artikel wieder auf verkaufsbereit setzen und
   * alles neu erfassen - inklusive verfaelschter Auswertung dazwischen.
   *
   * Der zugeordnete Artikel bleibt unberuehrt; nur die Zahlen des Verkaufs
   * aendern sich. Gewinn und ROI werden neu berechnet.
   */
  async updateSale(
    saleId: string,
    updates: Partial<CreateSalePayload>,
  ): Promise<SaleMutationResult> {
    const vorhandener = this.sales().find((s) => s.id === saleId);
    if (!vorhandener)
      return {
        data: null,
        error: new Error('Verkauf nicht gefunden'),
        status: 'error',
        problems: [],
      };

    const geaendert = this.enrichSaleMetrics({ ...vorhandener, ...updates });

    if (!this.mockStore.isDemoMode()) {
      try {
        const { data, error } = await this.supabase.client
          .from('sales')
          .update({
            platform: updates.platform,
            sale_price: updates.sale_price,
            sale_date: updates.sale_date,
            platform_fee: updates.platform_fee,
            shipping_cost: updates.shipping_cost,
            packaging_cost: updates.packaging_cost,
            other_costs: updates.other_costs,
            external_order_id: updates.external_order_id?.trim() || null,
            buyer_notes: updates.buyer_notes?.trim() || null,
          })
          .eq('id', saleId)
          .select('id')
          .maybeSingle();

        if (error || !data) {
          return {
            data: null,
            error: this.syncStatus.melde(
              'Aendern des Verkaufs',
              error ?? new Error('Der Verkauf wurde nicht gefunden.'),
            ),
            status: 'error',
            problems: [],
          };
        }
      } catch (e: unknown) {
        return {
          data: null,
          error: this.syncStatus.melde('Aendern des Verkaufs', e),
          status: 'error',
          problems: [],
        };
      }
    }

    this.sales.update((liste) => liste.map((s) => (s.id === saleId ? geaendert : s)));
    this.mockStore.saveSale(geaendert);
    return { data: geaendert, error: null, status: 'success', problems: [] };
  }

  /**
   * Vermerkt am Verkauf, dass er zurueckgegeben wurde.
   *
   * Ohne diesen Vermerk zaehlte ein zurueckgegebener Verkauf weiter mit vollem
   * Gewinn, waehrend der Artikel gleichzeitig wieder im Lager stand - derselbe
   * Gegenstand also doppelt. Die Erstattung minderte nichts.
   */
  async markiereAlsRetourniert(
    saleId: string,
    erstattet: number,
  ): Promise<{ error: Error | null }> {
    const zeitpunkt = new Date().toISOString();

    if (!this.mockStore.isDemoMode()) {
      try {
        const { data, error } = await this.supabase.client
          .from('sales')
          .update({ returned_at: zeitpunkt, refund_amount: erstattet })
          .eq('id', saleId)
          .select('id')
          .maybeSingle();

        if (error || !data) {
          return {
            error: this.syncStatus.melde(
              'Vermerken der Retoure',
              error ?? new Error('Der Verkauf wurde nicht gefunden.'),
            ),
          };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Vermerken der Retoure', e) };
      }
    }

    this.sales.update((liste) =>
      liste.map((s) =>
        s.id === saleId
          ? this.enrichSaleMetrics({ ...s, returned_at: zeitpunkt, refund_amount: erstattet })
          : s,
      ),
    );
    const geaendert = this.sales().find((s) => s.id === saleId);
    if (geaendert) this.mockStore.saveSale(geaendert);
    return { error: null };
  }

  async deleteSale(saleId: string, inventoryItemId?: string | null): Promise<SaleMutationResult> {
    if (!inventoryItemId) {
      return {
        data: null,
        error: new Error('Mengenverkäufe müssen über den atomaren Retourenpfad gebucht werden.'),
        status: 'error',
        problems: [],
      };
    }
    const workspaceId = this.workspaceService.currentWorkspace()?.id ?? '';
    if (!this.mockStore.isDemoMode()) {
      try {
        const { data, error } = await this.supabase.client
          .from('sales')
          .delete()
          .eq('id', saleId)
          .eq('workspace_id', workspaceId)
          .select('id')
          .maybeSingle();
        if (error || !data) {
          return {
            data: null,
            error: this.syncStatus.melde(
              'Löschen des Verkaufs',
              error ?? new Error('Der Verkauf wurde nicht gefunden.'),
            ),
            status: 'error',
            problems: [],
          };
        }
      } catch (e: unknown) {
        return {
          data: null,
          error: this.syncStatus.melde('Löschen des Verkaufs', e),
          status: 'error',
          problems: [],
        };
      }
    }

    try {
      const { error } = await this.inventoryService.updateItemStatus(
        inventoryItemId,
        'ready',
        'Verkauf storniert/gelöscht',
      );
      if (error) {
        const problem = this.erstelleProblem('inventory_status', error);
        this.uebernehmeLoeschungLokal(saleId);
        this.planeArtikelstatusNachholung(
          workspaceId,
          inventoryItemId,
          'ready',
          'Verkauf storniert/gelöscht',
        );
        return { data: null, error, status: 'partial', problems: [problem] };
      }
    } catch (e: unknown) {
      const error = this.syncStatus.melde('Aktualisieren des Artikelstatus', e);
      const problem = this.erstelleProblem('inventory_status', error);
      this.uebernehmeLoeschungLokal(saleId);
      this.planeArtikelstatusNachholung(
        workspaceId,
        inventoryItemId,
        'ready',
        'Verkauf storniert/gelöscht',
      );
      return {
        data: null,
        error,
        status: 'partial',
        problems: [problem],
      };
    }

    this.uebernehmeLoeschungLokal(saleId);
    return { data: null, error: null, status: 'success', problems: [] };
  }

  planeArtikelstatusNachholung(
    workspaceId: string,
    inventoryItemId: string,
    targetStatus: ItemStatus,
    notes: string,
  ): void {
    this.merkeNachschritt({
      key: `inventory_status:${inventoryItemId}`,
      workspaceId,
      kind: 'inventory_status',
      inventoryItemId,
      targetStatus,
      notes,
    });
  }

  planeRetourenvermerkNachholung(workspaceId: string, saleId: string, refundAmount: number): void {
    this.merkeNachschritt({
      key: `sale_return_status:${saleId}`,
      workspaceId,
      kind: 'sale_return_status',
      saleId,
      refundAmount,
    });
  }

  async retryPendingFollowUps(workspaceId?: string): Promise<void> {
    const pending = this.pendingFollowUps().filter(
      (followUp) => workspaceId === undefined || followUp.workspaceId === workspaceId,
    );
    for (const followUp of pending) {
      const error = await this.fuehreNachschrittAus(followUp);
      if (!error) this.entferneNachschritt(followUp.key);
    }
  }

  private async fuehreNachschrittAus(followUp: PendingFollowUp): Promise<Error | null> {
    if (followUp.kind === 'inventory_status') {
      if (!followUp.inventoryItemId || !followUp.targetStatus)
        return new Error('Ungültiger Nachschritt.');
      const result = await this.inventoryService.updateItemStatus(
        followUp.inventoryItemId,
        followUp.targetStatus,
        followUp.notes,
      );
      return result.error;
    }
    if (!followUp.saleId || followUp.refundAmount === undefined)
      return new Error('Ungültiger Nachschritt.');
    return (await this.markiereAlsRetourniert(followUp.saleId, followUp.refundAmount)).error;
  }

  private erstelleProblem(kind: SaleFollowUpKind, error: Error): SaleFollowUpProblem {
    return { kind, error, reportedBySyncStatus: this.syncStatus.istZentralGemeldet(error) };
  }

  private problemsFuerArtikel(workspaceId: string, inventoryItemId: string): SaleFollowUpProblem[] {
    return this.pendingFollowUps()
      .filter(
        (followUp) =>
          followUp.workspaceId === workspaceId &&
          followUp.kind === 'inventory_status' &&
          followUp.inventoryItemId === inventoryItemId,
      )
      .map(() => ({
        kind: 'inventory_status',
        error: new Error('Der Artikelstatus wird automatisch nachgeholt.'),
        reportedBySyncStatus: false,
      }));
  }

  private uebernehmeVerkaufLokal(sale: Sale): void {
    this.mockStore.saveSale(sale);
    this.sales.update((list) => [sale, ...list.filter((eintrag) => eintrag.id !== sale.id)]);
  }

  private uebernehmeLoeschungLokal(saleId: string): void {
    this.mockStore.deleteSale(saleId);
    this.sales.update((list) => list.filter((sale) => sale.id !== saleId));
  }

  private merkeNachschritt(followUp: PendingFollowUp): void {
    this.pendingFollowUps.update((list) => [
      followUp,
      ...list.filter((eintrag) => eintrag.key !== followUp.key),
    ]);
    this.persistPendingFollowUps();
  }

  private entferneNachschritt(key: string): void {
    this.pendingFollowUps.update((list) => list.filter((followUp) => followUp.key !== key));
    this.persistPendingFollowUps();
  }

  private loadPendingFollowUps(): PendingFollowUp[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PENDING_FOLLOW_UPS);
      if (!stored) return [];

      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        return this.verwerfeBeschaedigteNachschritte(
          [],
          new Error('Gespeicherte Nachschritte haben kein gültiges Listenformat.'),
        );
      }

      const valide = parsed.filter((eintrag): eintrag is PendingFollowUp =>
        this.istGueltigerNachschritt(eintrag),
      );
      if (valide.length !== parsed.length) {
        return this.verwerfeBeschaedigteNachschritte(
          valide,
          new Error('Mindestens ein gespeicherter Nachschritt ist unvollständig.'),
        );
      }
      return valide;
    } catch (error: unknown) {
      return this.verwerfeBeschaedigteNachschritte(
        [],
        error instanceof Error ? error : new Error('Gespeicherte Nachschritte sind beschädigt.'),
      );
    }
  }

  private verwerfeBeschaedigteNachschritte(
    valide: PendingFollowUp[],
    error: Error,
  ): PendingFollowUp[] {
    this.syncStatus.melde('Laden ausstehender Nachschritte', error);
    try {
      localStorage.setItem(STORAGE_KEY_PENDING_FOLLOW_UPS, JSON.stringify(valide));
    } catch {}
    return valide;
  }

  private istGueltigerNachschritt(value: unknown): value is PendingFollowUp {
    if (
      !this.istObjekt(value) ||
      typeof value['key'] !== 'string' ||
      typeof value['workspaceId'] !== 'string'
    ) {
      return false;
    }
    if (value['kind'] === 'inventory_status') {
      return (
        typeof value['inventoryItemId'] === 'string' &&
        this.istArtikelstatus(value['targetStatus']) &&
        typeof value['notes'] === 'string'
      );
    }
    return (
      value['kind'] === 'sale_return_status' &&
      typeof value['saleId'] === 'string' &&
      typeof value['refundAmount'] === 'number' &&
      Number.isFinite(value['refundAmount'])
    );
  }

  private istObjekt(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private istArtikelstatus(value: unknown): value is ItemStatus {
    return typeof value === 'string' && ITEM_STATUSES.has(value);
  }

  private persistPendingFollowUps(): void {
    try {
      localStorage.setItem(STORAGE_KEY_PENDING_FOLLOW_UPS, JSON.stringify(this.pendingFollowUps()));
    } catch {}
  }
}
