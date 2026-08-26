import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { MockDataStoreService } from './mock-data-store.service';
import { InventoryService } from './inventory.service';
import { SourcesService } from './sources.service';
import { SuppliersService } from './suppliers.service';
import { WebhookService } from './webhook.service';
import { SyncStatusService } from './sync-status.service';
import { ReceivePurchaseLineInput, ReceivePurchaseResult, StockService } from './stock.service';
import { MutationResult } from './catalog.service';
import {
  Purchase,
  PurchaseCost,
  PurchaseLine,
  PurchaseType,
  CostAllocationMode,
  InventoryItem,
  ItemCondition,
  TrackingCarrier,
  InboundTrackingStatus,
  TrackingMode,
} from '../models/flipbase.models';

export interface CreatePurchaseLineInput {
  readonly catalogProductId: string | null;
  readonly titleSnapshot: string;
  readonly lineKind: TrackingMode;
  readonly orderedQuantity: number;
  readonly unitPurchasePrice: number;
  readonly lineTotal: number;
}

export interface ReceiveIndividualPurchaseLineInput {
  readonly title: string;
  readonly condition: ItemCondition;
  readonly allocatedPurchaseCost: number;
}

export interface ReceiveIndividualPurchaseResult {
  readonly purchaseLine: PurchaseLine;
  readonly inventoryItem: InventoryItem;
  readonly purchase: Purchase;
}

export interface CreatePurchasePayload {
  source_id?: string | null;
  supplier_id?: string | null;
  type: PurchaseType;
  title: string;
  purchase_date: string;
  purchase_price: number;
  cost_allocation_mode?: CostAllocationMode;
  notes?: string | null;
  tracking_number?: string | null;
  tracking_carrier?: TrackingCarrier | null;
  tracking_status?: InboundTrackingStatus | null;
  original_url?: string | null;
  items_count?: number;
  initial_costs?: { type: string; amount: number; description?: string }[];
  single_item_title?: string;
  single_item_category?: string;
  single_item_condition?: string;
  single_item_expected_value?: number;
  purchase_lines?: readonly CreatePurchaseLineInput[];
}

export type PurchaseCreateProblemKind =
  'additional_costs' | 'purchase_lines' | 'inventory_item' | 'activity_log';

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
  private readonly profitEngine = inject(ProfitEngineService);
  private readonly mockStore = inject(MockDataStoreService);
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
  readonly isLoading = signal<boolean>(false);

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
    return liste.map((p) => ({ ...p, items_count: this.zaehleArtikel(p, items) }));
  });

  readonly selectedPurchase = computed<Purchase | null>(() => {
    const p = this.selectedPurchaseRaw();
    if (!p) return null;
    if (!this.inventory.istGeladen()) return p;
    return { ...p, items_count: this.zaehleArtikel(p, this.inventory.items()) };
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
   * Zaehlt die Artikel eines Einkaufs.
   *
   * Frueher galt ein Einzelkauf als ein Artikel, auch ohne Inventareintrag -
   * eine Notluege, weil beim Anlegen keiner erzeugt wurde. Seit
   * `legeEinzelartikelAn` das nachholt, zaehlt hier schlicht, was es gibt.
   * Einzelkaeufe von frueher stehen deshalb auf 0, bis ein Artikel erfasst
   * wird; die Detailseite zeigte dort ohnehin schon eine leere Liste.
   */
  private zaehleArtikel(einkauf: Purchase, items: InventoryItem[]): number {
    return items.filter((i) => i.purchase_id === einkauf.id).length;
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
        if (ws) {
          this.loadPurchases(ws.id);
        } else {
          this.purchasesRaw.set([]);
          this.selectedPurchaseRaw.set(null);
          this.purchaseItemsFallback.set([]);
          this.purchaseLinesRaw.set([]);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  async loadPurchases(workspaceId: string): Promise<void> {
    if (this.mockStore.isDemoMode()) {
      const localPurchases = this.mockStore.getPurchases(workspaceId);
      const localItems = this.mockStore.getItems(workspaceId);
      const localSources = this.mockStore.getSources();
      const localSuppliers = this.mockStore.getSuppliers();

      const enrichedLocal = localPurchases.map((p) => {
        const matchingItems = localItems.filter((i) => i.purchase_id === p.id);
        const source =
          p.source || (p.source_id ? localSources.find((s) => s.id === p.source_id) : undefined);
        const supplier =
          p.supplier ||
          (p.supplier_id ? localSuppliers.find((s) => s.id === p.supplier_id) : undefined);
        return {
          ...p,
          source,
          supplier,
          items_count: this.zaehleArtikel(p, matchingItems),
        } as Purchase;
      });
      this.purchasesRaw.set(enrichedLocal);
      return;
    }

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('purchases')
        .select(
          `
          *,
          source:sources(*),
          supplier:suppliers(*),
          costs:purchase_costs(*),
          items:inventory_items(id, purchase_id, title, status, allocated_purchase_cost, expected_value)
        `,
        )
        .eq('workspace_id', workspaceId)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        this.syncStatus.melde('Laden der Einkäufe', error);
        this.purchasesRaw.set([]);
      } else if (data) {
        const enriched = (data as unknown[]).map((p: any) => {
          const costsSum = (p.costs || []).reduce(
            (acc: number, c: any) => acc + Number(c.amount || 0),
            0,
          );
          const totalCost = Number(p.purchase_price || 0) + costsSum;
          return {
            ...p,
            items_count: this.zaehleArtikel(p, (p.items || []) as InventoryItem[]),
            total_purchase_cost: Number(totalCost.toFixed(2)),
          } as Purchase;
        });
        this.purchasesRaw.set(enriched);
      }
    } catch (err) {
      this.syncStatus.melde('Laden der Einkäufe', err);
      this.purchasesRaw.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async getPurchaseById(id: string): Promise<Purchase | null> {
    // Die lokale Abkürzung gilt nur im Demo-Modus. Für angemeldete Nutzer muss
    // die Datenbank gefragt werden: Die zugehörigen Artikel stehen seit der
    // Umstellung auf „Datenbank zuerst" nicht mehr im lokalen Spiegel, wodurch
    // die Einkaufs-Detailseite gar keine Artikel mehr anzeigte – und die
    // Kostenverteilung damit ins Leere lief.
    const existing = this.mockStore.isDemoMode()
      ? this.purchases().find((p) => p.id === id) ||
        this.mockStore.getPurchases().find((p) => p.id === id)
      : undefined;
    if (existing) {
      const items = this.mockStore.getItems().filter((i) => i.purchase_id === id);
      const localSources = this.mockStore.getSources();
      const localSuppliers = this.mockStore.getSuppliers();
      const source =
        existing.source ||
        (existing.source_id ? localSources.find((s) => s.id === existing.source_id) : undefined);
      const supplier =
        existing.supplier ||
        (existing.supplier_id
          ? localSuppliers.find((s) => s.id === existing.supplier_id)
          : undefined);
      const enriched: Purchase = {
        ...existing,
        source,
        supplier,
        items_count: this.zaehleArtikel(existing, items),
      };
      this.selectedPurchaseRaw.set(enriched);
      this.purchaseItemsFallback.set(items);
      this.purchaseLinesRaw.set(
        this.mockStore.getPurchaseLines().filter((line) => line.purchase_id === id),
      );
      return enriched;
    }

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('purchases')
        .select(
          `
          *,
          source:sources(*),
          supplier:suppliers(*),
          costs:purchase_costs(*),
          items:inventory_items(*)
        `,
        )
        .eq('id', id)
        .single();

      if (error || !data) {
        if (error) this.syncStatus.melde('Abrufen des Einkaufs', error);
        return null;
      }

      const costsSum = (data.costs || []).reduce(
        (acc: number, c: any) => acc + Number(c.amount || 0),
        0,
      );
      const totalCost = Number(data.purchase_price || 0) + costsSum;

      const enriched: Purchase = {
        ...(data as any),
        type: data.type as PurchaseType,
        items_count: this.zaehleArtikel(
          data as unknown as Purchase,
          (data.items || []) as InventoryItem[],
        ),
        total_purchase_cost: Number(totalCost.toFixed(2)),
      };

      this.selectedPurchaseRaw.set(enriched);
      this.purchaseItemsFallback.set((data.items || []) as InventoryItem[]);
      await this.loadPurchaseLines(id);
      return enriched;
    } catch (err) {
      this.syncStatus.melde('GetPurchaseById', err);
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadPurchaseLines(purchaseId: string): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) {
      this.purchaseLinesRaw.set([]);
      return;
    }

    if (this.mockStore.isDemoMode()) {
      this.purchaseLinesRaw.set(
        this.mockStore
          .getPurchaseLines(workspaceId)
          .filter((line) => line.purchase_id === purchaseId),
      );
      return;
    }

    try {
      const { data, error } = await this.supabase.client
        .from('purchase_lines')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('purchase_id', purchaseId)
        .order('created_at', { ascending: true });
      if (error) {
        this.syncStatus.melde('Laden der Einkaufspositionen', error);
        return;
      }
      this.purchaseLinesRaw.set((data ?? []) as PurchaseLine[]);
    } catch (error: unknown) {
      this.syncStatus.melde('Laden der Einkaufspositionen', error);
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

    const normalizedLines = this.normalizePurchaseLines(payload.purchase_lines ?? []);
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
    const kostenZeilen: PurchaseCost[] = (payload.initial_costs || [])
      .filter((c) => Number(c.amount) > 0)
      .map((c) => ({
        type: c.type,
        amount: Number(c.amount),
        description: c.description?.trim() || null,
      }));
    const extraCostsSum = kostenZeilen.reduce((acc, c) => acc + c.amount, 0);
    const totalCost = payload.purchase_price + extraCostsSum;

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
      total_purchase_cost: totalCost,
      cost_allocation_mode: mode,
      notes: payload.notes || null,
      tracking_number: payload.tracking_number?.trim() || null,
      tracking_carrier: payload.tracking_carrier || (payload.tracking_number ? 'dhl' : null),
      tracking_status: payload.tracking_status || (payload.tracking_number ? 'in_transit' : null),
      original_url: payload.original_url || null,
      receiving_status: normalizedLines.data.length > 0 ? 'ordered' : 'received',
      items_count: payload.type === 'single' ? 1 : payload.items_count || 0,
      costs: kostenZeilen,
      created_at: new Date().toISOString(),
    };

    // 1. Immediately persist locally
    this.mockStore.savePurchase(newPurchase);
    this.purchasesRaw.update((list) => [newPurchase, ...list]);

    if (this.mockStore.isDemoMode()) {
      const lineResult = await this.createPurchaseLines(newPurchase.id, normalizedLines.data);
      const problems: PurchaseCreateProblem[] = [];
      if (lineResult.error) {
        problems.push({
          kind: 'purchase_lines',
          error: lineResult.error,
          reportedBySyncStatus: lineResult.reportedBySyncStatus,
        });
      }
      problems.push(
        ...(await this.legeEinzelartikelAn(
          newPurchase,
          payload,
          lineResult.data?.find((line) => line.line_kind === 'individual')?.id,
        )),
      );
      this.webhookService.sendPurchaseNotification(newPurchase);
      return problems.length > 0
        ? {
            status: 'partial',
            data: newPurchase,
            error: null,
            reportedBySyncStatus: problems.some((problem) => problem.reportedBySyncStatus),
            problems,
          }
        : {
            status: 'success',
            data: newPurchase,
            error: null,
            reportedBySyncStatus: false,
            problems: [],
          };
    }

    // 2. Zuerst nur den Elterneinkauf persistieren. Erst wenn dieser Schritt
    // bestätigt ist, dürfen nachgelagerte Fehler als Teilprobleme gelten.
    let dbPur: Pick<Purchase, 'id'> | null;
    try {
      const { data, error: dbError } = await this.supabase.client
        .from('purchases')
        .insert({
          workspace_id: ws.id,
          source_id: payload.source_id || null,
          supplier_id: payload.supplier_id || null,
          type: payload.type,
          title: payload.title.trim(),
          purchase_date: payload.purchase_date,
          purchase_price: payload.purchase_price,
          cost_allocation_mode: mode,
          notes: payload.notes?.trim() || null,
          tracking_number: payload.tracking_number?.trim() || null,
          tracking_carrier: payload.tracking_carrier || (payload.tracking_number ? 'dhl' : null),
          tracking_status:
            payload.tracking_status || (payload.tracking_number ? 'in_transit' : 'pending'),
          original_url: payload.original_url || null,
          receiving_status: normalizedLines.data.length > 0 ? 'ordered' : 'received',
          total_purchase_cost: totalCost,
        })
        .select()
        .single();

      if (dbError) {
        this.verwerfeVorlaeufigenEinkauf(newPurchase.id);
        return {
          status: 'failed',
          data: null,
          error: this.syncStatus.melde('Speichern des Einkaufs', dbError),
          reportedBySyncStatus: true,
          problems: [],
        };
      }
      dbPur = data;
    } catch (err: unknown) {
      this.verwerfeVorlaeufigenEinkauf(newPurchase.id);
      return {
        status: 'failed',
        data: null,
        error: this.syncStatus.melde('Erstellen des Einkaufs', err),
        reportedBySyncStatus: true,
        problems: [],
      };
    }

    if (!dbPur) {
      this.verwerfeVorlaeufigenEinkauf(newPurchase.id);
      return {
        status: 'failed',
        data: null,
        error: new Error('Der Einkauf wurde nicht zurückgegeben'),
        reportedBySyncStatus: false,
        problems: [],
      };
    }

    const finalPurchase: Purchase = { ...newPurchase, id: dbPur.id };
    this.mockStore.deletePurchase(newPurchase.id);
    this.mockStore.savePurchase(finalPurchase);
    this.purchasesRaw.update((list) => [
      finalPurchase,
      ...list.filter((p) => p.id !== newPurchase.id && p.id !== finalPurchase.id),
    ]);

    const problems: PurchaseCreateProblem[] = [];
    const kostenErgebnis = await this.legeZusatzkostenAn(finalPurchase.id, kostenZeilen);
    if (kostenErgebnis.error) {
      problems.push({
        kind: 'additional_costs',
        error: kostenErgebnis.error,
        reportedBySyncStatus: kostenErgebnis.reportedBySyncStatus,
      });
    }
    const lineResult = await this.createPurchaseLines(finalPurchase.id, normalizedLines.data);
    if (lineResult.error) {
      problems.push({
        kind: 'purchase_lines',
        error: lineResult.error,
        reportedBySyncStatus: lineResult.reportedBySyncStatus,
      });
    }
    problems.push(
      ...(await this.legeEinzelartikelAn(
        finalPurchase,
        payload,
        lineResult.data?.find((line) => line.line_kind === 'individual')?.id,
      )),
    );
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

    const normalized = this.normalizePurchaseLines(inputs);
    if (normalized.error) {
      return { data: null, error: normalized.error, reportedBySyncStatus: false };
    }
    if (normalized.data.length === 0) {
      return { data: [], error: null, reportedBySyncStatus: false };
    }

    const rows = normalized.data.map((line) => ({
      workspace_id: workspaceId,
      purchase_id: purchaseId,
      catalog_product_id: line.catalogProductId,
      title_snapshot: line.titleSnapshot,
      line_kind: line.lineKind,
      ordered_quantity: line.orderedQuantity,
      received_quantity: 0,
      unit_purchase_price: line.unitPurchasePrice,
      line_total: line.lineTotal,
    }));

    if (this.mockStore.isDemoMode()) {
      const lines = rows.map((row): PurchaseLine => ({
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `line-${Date.now()}-${Math.random()}`,
        workspace_id: row.workspace_id,
        purchase_id: row.purchase_id,
        catalog_product_id: row.catalog_product_id,
        title_snapshot: row.title_snapshot,
        line_kind: row.line_kind,
        ordered_quantity: row.ordered_quantity,
        received_quantity: row.received_quantity,
        unit_purchase_price: row.unit_purchase_price,
        line_total: row.line_total,
      }));
      lines.forEach((line) => this.mockStore.savePurchaseLine(line));
      if (this.selectedPurchase()?.id === purchaseId) {
        this.purchaseLinesRaw.update((current) => [...current, ...lines]);
      }
      const purchase = this.purchases().find((entry) => entry.id === purchaseId);
      if (purchase) {
        const allLines = this.mockStore
          .getPurchaseLines(workspaceId)
          .filter((line) => line.purchase_id === purchaseId);
        const hasOpen = allLines.some((line) => line.received_quantity < line.ordered_quantity);
        const hasReceived = allLines.some((line) => line.received_quantity > 0);
        this.uebernehmeEinkaufLokal({
          ...purchase,
          receiving_status: hasOpen ? (hasReceived ? 'partially_received' : 'ordered') : 'received',
        });
      }
      return { data: lines, error: null, reportedBySyncStatus: false };
    }

    try {
      const { data, error } = await this.supabase.client
        .from('purchase_lines')
        .insert(rows)
        .select();
      if (error || !data) {
        const reported = this.syncStatus.melde(
          'Speichern der Einkaufspositionen',
          error ?? new Error('Die Einkaufspositionen wurden nicht zurückgegeben.'),
        );
        return { data: null, error: reported, reportedBySyncStatus: true };
      }
      const lines = data as PurchaseLine[];
      if (this.selectedPurchase()?.id === purchaseId) {
        this.purchaseLinesRaw.update((current) => [...current, ...lines]);
      }
      return { data: lines, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      const reported = this.syncStatus.melde('Speichern der Einkaufspositionen', error);
      return { data: null, error: reported, reportedBySyncStatus: true };
    }
  }

  private normalizePurchaseLines(inputs: readonly CreatePurchaseLineInput[]): {
    data: readonly CreatePurchaseLineInput[];
    error: Error | null;
  } {
    const lines = inputs.map((line) => ({
      ...line,
      titleSnapshot: line.titleSnapshot.trim(),
      orderedQuantity: Number(line.orderedQuantity),
      unitPurchasePrice: Number(line.unitPurchasePrice),
      lineTotal: Number(line.lineTotal),
    }));
    for (const line of lines) {
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
        !Number.isFinite(line.unitPurchasePrice) ||
        line.unitPurchasePrice < 0 ||
        !Number.isFinite(line.lineTotal) ||
        line.lineTotal < 0
      ) {
        return { data: [], error: new Error('Die Einkaufskosten müssen gültige Beträge sein.') };
      }
      const unitPurchasePriceCents = Math.round(line.unitPurchasePrice * 100);
      const lineTotalCents = Math.round(line.lineTotal * 100);
      if (
        Math.abs(line.unitPurchasePrice * 100 - unitPurchasePriceCents) > Number.EPSILON ||
        Math.abs(line.lineTotal * 100 - lineTotalCents) > Number.EPSILON ||
        lineTotalCents !== line.orderedQuantity * unitPurchasePriceCents
      ) {
        return {
          data: [],
          error: new Error('Positionssumme und EK je Stück müssen centgenau zusammenpassen.'),
        };
      }
    }
    return { data: lines, error: null };
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
    purchaseId: string,
    zeilen: PurchaseCost[],
  ): Promise<{ error: Error | null; reportedBySyncStatus: boolean }> {
    if (zeilen.length === 0) return { error: null, reportedBySyncStatus: false };

    try {
      const { error } = await this.supabase.client.from('purchase_costs').insert(
        zeilen.map((z) => ({
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

    const ergebnis = await this.inventory.createItem({
      purchase_id: einkauf.id,
      purchase_line_id: purchaseLineId ?? null,
      title: payload.single_item_title?.trim() || einkauf.title,
      category: payload.single_item_category?.trim() || null,
      condition: (payload.single_item_condition as ItemCondition) || 'used',
      status: payload.tracking_number?.trim() ? 'needs_review' : 'received',
      allocated_purchase_cost: einkauf.total_purchase_cost || einkauf.purchase_price,
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
   * Nimmt die vorläufige Anzeige eines Einkaufs zurück, wenn das Speichern in
   * der Datenbank fehlgeschlagen ist.
   *
   * Ohne das bliebe der Einkauf in Liste und Browser-Speicher stehen, obwohl er
   * nirgends dauerhaft existiert – und wäre beim nächsten Neuladen verschwunden.
   */
  private verwerfeVorlaeufigenEinkauf(vorlaeufigeId: string): void {
    this.mockStore.deletePurchase(vorlaeufigeId);
    this.purchasesRaw.update((list) => list.filter((p) => p.id !== vorlaeufigeId));
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
      purchase_price?: number;
      source_id?: string | null;
      supplier_id?: string | null;
      original_url?: string | null;
      notes?: string | null;
      tracking_number?: string | null;
      tracking_carrier?: TrackingCarrier | null;
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

      const gespeichert = this.mockStore.getPurchases().find((p) => p.id === purchaseId);
      if (gespeichert) this.mockStore.savePurchase(anwenden(gespeichert));
    };

    if (this.mockStore.isDemoMode()) {
      lokalAnwenden();
      return { error: null };
    }

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
    kosten: { type: string; amount: number; description?: string | null }[],
  ): Promise<{ error: Error | null }> {
    // Leerzeilen aus dem Formular sind keine Kosten. Sie wegzulassen ist
    // wichtiger als es aussieht: Eine Zeile mit 0 EUR haette sonst dauerhaft
    // in der Kostenaufstellung des Einkaufs gestanden.
    const zeilen: PurchaseCost[] = kosten
      .filter((k) => Number(k.amount) > 0)
      .map((k) => ({
        purchase_id: purchaseId,
        type: k.type,
        amount: Number(k.amount),
        description: k.description?.trim() || null,
      }));

    const summe = zeilen.reduce((acc, z) => acc + z.amount, 0);
    let gespeicherteZeilen = zeilen.map((zeile, index) => ({
      ...zeile,
      id: `cost-${Date.now()}-${index}`,
    }));

    const anwenden = (p: Purchase): Purchase => ({
      ...p,
      costs: gespeicherteZeilen,
      total_purchase_cost: Number((Number(p.purchase_price || 0) + summe).toFixed(2)),
      updated_at: new Date().toISOString(),
    });

    const lokalAktualisieren = (): void => {
      this.purchasesRaw.update((liste) =>
        liste.map((p) => (p.id === purchaseId ? anwenden(p) : p)),
      );
      this.selectedPurchaseRaw.update((p) => (p && p.id === purchaseId ? anwenden(p) : p));

      const gespeichert = this.mockStore.getPurchases().find((p) => p.id === purchaseId);
      if (gespeichert) this.mockStore.savePurchase(anwenden(gespeichert));
    };

    if (this.mockStore.isDemoMode()) {
      lokalAktualisieren();
      return { error: null };
    }

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
              purchase_id: purchaseId,
              type: z.type,
              amount: z.amount,
              description: z.description ?? null,
            })),
          )
          .select('id, purchase_id, type, amount, description, created_at');

        if (schreibFehler) {
          return { error: this.syncStatus.melde('Aendern der Zusatzkosten', schreibFehler) };
        }

        gespeicherteZeilen = (data ?? []).map((zeile) => ({
          ...zeile,
          amount: Number(zeile.amount),
        }));
      }

      const { error: summenFehler } = await this.supabase.client
        .from('purchases')
        .update({
          total_purchase_cost: Number(
            (
              (this.purchasesRaw().find((p) => p.id === purchaseId)?.purchase_price ?? 0) + summe
            ).toFixed(2),
          ),
          updated_at: new Date().toISOString(),
        })
        .eq('id', purchaseId);

      if (summenFehler) {
        return { error: this.syncStatus.melde('Aendern der Zusatzkosten', summenFehler) };
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

    const updated: Purchase = {
      ...existing,
      tracking_number: trackingNumber ? trackingNumber.trim() : null,
      tracking_carrier: carrier || existing.tracking_carrier || (trackingNumber ? 'dhl' : null),
      tracking_status: status || existing.tracking_status || (trackingNumber ? 'in_transit' : null),
      updated_at: new Date().toISOString(),
    };

    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client
          .from('purchases')
          .update({
            tracking_number: updated.tracking_number,
            tracking_carrier: updated.tracking_carrier,
            tracking_status: updated.tracking_status || 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', purchaseId);

        if (error) {
          return {
            data: null,
            error: this.syncStatus.melde('Aktualisieren des Tracking-Status', error),
          };
        }
      } catch (err) {
        return {
          data: null,
          error: this.syncStatus.melde('Aktualisieren des Tracking-Status', err),
        };
      }
    }

    this.mockStore.savePurchase(updated);
    this.purchasesRaw.update((list) => list.map((p) => (p.id === purchaseId ? updated : p)));
    if (this.selectedPurchase()?.id === purchaseId) {
      this.selectedPurchaseRaw.set(updated);
    }

    return { data: updated, error: null };
  }

  async markPurchaseDeliveredAndSyncItems(
    purchaseId: string,
  ): Promise<{ updatedCount: number; error: Error | null }> {
    const existing = this.purchases().find((p) => p.id === purchaseId);
    if (!existing) return { updatedCount: 0, error: new Error('Einkauf nicht gefunden') };

    // 1. Update purchase tracking status to delivered
    const { error: trackingError } = await this.updatePurchaseTracking(
      purchaseId,
      existing.tracking_number || null,
      existing.tracking_carrier,
      'delivered',
    );
    if (trackingError) return { updatedCount: 0, error: trackingError };

    // 2. Alle zugehoerigen Artikel auf "eingetroffen" setzen. Die Liste kommt
    // aus dem Inventardienst, der sie auch in der Datenbank nachzieht - frueher
    // stand hier der lokale Spiegel, der angemeldet leer ist: Es wurde nichts
    // aktualisiert und die Artikeltabelle der Detailseite lief anschliessend leer.
    const zugehoerige = this.inventory
      .items()
      .filter((i) => i.purchase_id === purchaseId && (i.status === 'needs_review' || !i.status));
    let updatedCount = 0;

    for (const item of zugehoerige) {
      const { error } = await this.inventory.updateItemStatus(item.id, 'received');
      if (error) return { updatedCount, error };
      updatedCount++;
    }

    return { updatedCount, error: null };
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

    if (this.mockStore.isDemoMode()) {
      const result = this.mockStore.receiveIndividualPurchaseLine(
        workspaceId,
        purchaseId,
        purchaseLineId,
        { title: input.title, condition: input.condition },
      );
      if (result.error || !result.purchaseLine || !result.inventoryItem || !result.purchase) {
        return {
          data: null,
          error: result.error ?? new Error('Der Einzelartikel wurde nicht zurückgegeben.'),
          reportedBySyncStatus: false,
        };
      }
      this.purchaseLinesRaw.update((lines) =>
        lines.map((line) => (line.id === purchaseLineId ? result.purchaseLine! : line)),
      );
      this.inventory.uebernehmeArtikelAenderungen([result.inventoryItem]);
      this.uebernehmeEinkaufLokal(result.purchase);
      return {
        data: {
          purchaseLine: result.purchaseLine,
          inventoryItem: result.inventoryItem,
          purchase: result.purchase,
        },
        error: null,
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
          allocated_purchase_cost: input.allocatedPurchaseCost,
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
      this.purchaseLinesRaw.update((lines) =>
        lines.map((line) => (line.id === purchaseLineId ? confirmed : line)),
      );
      this.inventory.uebernehmeArtikelAenderungen([inventoryItem]);
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

  async deletePurchase(purchaseId: string): Promise<{ error: Error | null }> {
    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client
          .from('purchases')
          .delete()
          .eq('id', purchaseId);
        if (error) {
          return { error: this.syncStatus.melde('Löschen des Einkaufs', error) };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Löschen des Einkaufs', e) };
      }
    }

    this.mockStore.deletePurchase(purchaseId);
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
  ): Promise<{ error: Error | null }> {
    let costId = `cost-${Date.now()}`;

    if (!this.mockStore.isDemoMode()) {
      try {
        const { data, error } = await this.supabase.client
          .from('purchase_costs')
          .insert({
            purchase_id: purchaseId,
            type,
            amount,
            description: description?.trim() || null,
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
    }

    const neueKosten: PurchaseCost = {
      id: costId,
      purchase_id: purchaseId,
      type,
      amount,
      description: description?.trim() || null,
    };
    const anwenden = (purchase: Purchase): Purchase => ({
      ...purchase,
      costs: [...(purchase.costs ?? []), neueKosten],
      total_purchase_cost: Number(
        ((purchase.total_purchase_cost || purchase.purchase_price) + amount).toFixed(2),
      ),
    });

    this.purchasesRaw.update((purchases) =>
      purchases.map((purchase) => (purchase.id === purchaseId ? anwenden(purchase) : purchase)),
    );
    this.selectedPurchaseRaw.update((purchase) =>
      purchase?.id === purchaseId ? anwenden(purchase) : purchase,
    );

    const gespeichert = this.mockStore
      .getPurchases()
      .find((purchase) => purchase.id === purchaseId);
    if (gespeichert) this.mockStore.savePurchase(anwenden(gespeichert));

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
    if (this.mockStore.isDemoMode()) return { error: null };

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
      this.mockStore.savePurchase(updated);
    }
    this.purchasesRaw.update((list) =>
      list.map((p) => {
        if (p.id === purchaseId) {
          const updated = { ...p, cost_allocation_mode: mode };
          this.mockStore.savePurchase(updated);
          return updated;
        }
        return p;
      }),
    );
  }

  async redistributeCosts(
    purchaseId: string,
    mode: CostAllocationMode,
    itemValues?: { id: string; expected_value: number }[],
  ): Promise<{ error: Error | null }> {
    const purchase = this.selectedPurchase();
    if (!purchase || purchase.id !== purchaseId) return { error: null };

    const items = this.purchaseItems();
    if (items.length === 0) return { error: null };

    const totalCost = purchase.total_purchase_cost || purchase.purchase_price;

    let updatedItems: InventoryItem[] = [];

    // Die Verteilung rechnet in ganzen Cent und vergibt den Rest nach groesstem
    // Anteil. So entspricht die Summe der zugeordneten Kosten exakt dem
    // Einkaufspreis - Grundlage fuer das § 25a-Journal und den DATEV-Export.
    if (mode === 'value_weighted') {
      const erwarteteWerte = items.map((it) => {
        const custom = itemValues?.find((v) => v.id === it.id);
        return custom ? custom.expected_value : (it.expected_value ?? 0);
      });
      const anteile = this.profitEngine.allocateCosts(totalCost, erwarteteWerte);

      updatedItems = items.map((it, index) => ({
        ...it,
        expected_value: erwarteteWerte[index],
        allocated_purchase_cost: anteile[index],
      }));
    } else if (mode === 'even') {
      const anteile = this.profitEngine.allocateCosts(
        totalCost,
        items.map(() => 1),
      );
      updatedItems = items.map((it, index) => ({
        ...it,
        allocated_purchase_cost: anteile[index],
      }));
    }

    if (!this.mockStore.isDemoMode()) {
      const modusErgebnis = await this.speichereVerteilungsmodus(purchaseId, mode);
      if (modusErgebnis.error) return modusErgebnis;

      try {
        for (const it of updatedItems) {
          const { error } = await this.supabase.client
            .from('inventory_items')
            .update({
              allocated_purchase_cost: it.allocated_purchase_cost,
              expected_value: it.expected_value,
            })
            .eq('id', it.id);

          if (error) {
            return { error: this.syncStatus.melde('Kostenverteilung', error) };
          }
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Kostenverteilung', e) };
      }
    }

    this.inventory.uebernehmeArtikelAenderungen(updatedItems);
    this.uebernehmeVerteilungsmodusLokal(purchaseId, mode);
    return { error: null };
  }

  async deletePurchaseCost(costId: string, purchaseId: string): Promise<{ error: Error | null }> {
    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client
          .from('purchase_costs')
          .delete()
          .eq('id', costId);
        if (error) {
          return { error: this.syncStatus.melde('Löschen der Einkaufskosten', error) };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Löschen der Einkaufskosten', e) };
      }
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
      category?: string;
      condition: ItemCondition;
      allocated_purchase_cost?: number;
      expected_value?: number;
      purchase_line_id?: string | null;
    },
  ): Promise<{ data: InventoryItem | null; error: Error | null }> {
    return this.inventory.createItem({
      purchase_id: purchaseId,
      purchase_line_id: itemData.purchase_line_id ?? null,
      title: itemData.title,
      category: itemData.category || null,
      condition: itemData.condition,
      status: 'received',
      allocated_purchase_cost: itemData.allocated_purchase_cost || 0,
      expected_value: itemData.expected_value ?? null,
    });
  }

  private uebernehmeEinkaufLokal(purchase: Purchase): void {
    this.mockStore.savePurchase(purchase);
    this.purchasesRaw.update((list) =>
      list.map((entry) => (entry.id === purchase.id ? purchase : entry)),
    );
    if (this.selectedPurchase()?.id === purchase.id) this.selectedPurchaseRaw.set(purchase);
  }
}
