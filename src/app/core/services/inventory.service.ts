import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { SyncFehlerAktion, SyncStatusService } from './sync-status.service';
import {
  InventoryItem,
  ItemCost,
  ItemStatus,
  ItemCondition,
  ActivityLog,
  InventoryItemSaleState,
} from '../models/flipbase.models';
import type { TablesInsert, TablesUpdate } from '../models/supabase.types';
import { isInventoryItemMutationLocked } from '../models/inventory-sellability';
import { INVENTORY_RECONCILIATION_AUDIT_REASONS } from '../models/inventory-reconciliation';

export interface CreateItemPayload {
  purchase_id?: string | null;
  purchase_line_id?: string | null;
  /** Verweis auf eine Produktkategorie; den Anzeigetext setzt der Trigger. */
  categoryId?: string | null;
  title: string;
  /** Verweis auf eine Marke; ohne Verweis bleibt der alte Markentext möglich. */
  brandId?: string | null;
  /** Legacy-Freitext für Übernahmen und bestehende Importwege. */
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  condition: ItemCondition;
  status?: ItemStatus;
  sku?: string | null;
  ean?: string | null;
  description?: string | null;
  allocated_purchase_cost: number | null;
  expected_value?: number | null;
}

export type UpdateItemPayload = Partial<Omit<InventoryItem, 'category_id' | 'brand_id'>> & {
  /** Verweis auf eine Produktkategorie; null entfernt die Auswahl. */
  categoryId?: string | null;
  /** Verweis auf eine Marke; null entfernt die Auswahl. */
  brandId?: string | null;
};

const CATEGORY_BRAND_TEXT_FIELDS = ['category', 'brand'] as const;

function touchesCategoryOrBrand(updates: UpdateItemPayload): boolean {
  return (
    updates.categoryId !== undefined ||
    updates.brandId !== undefined ||
    CATEGORY_BRAND_TEXT_FIELDS.some((field) => updates[field] !== undefined)
  );
}

function mapItemUpdates(updates: UpdateItemPayload): Partial<InventoryItem> {
  const { categoryId, brandId, ...legacyUpdates } = updates;
  const mapped: Partial<InventoryItem> = { ...legacyUpdates };
  if (categoryId !== undefined) mapped.category_id = categoryId;
  if (brandId !== undefined) mapped.brand_id = brandId;
  return mapped;
}

export interface CreateItemProblem {
  readonly kind: 'activity_log';
  readonly error: Error;
  readonly reportedBySyncStatus: boolean;
}

export interface CreateItemResult {
  readonly data: InventoryItem | null;
  readonly error: Error | null;
  readonly reportedBySyncStatus: boolean;
  readonly problems: readonly CreateItemProblem[];
}

interface ActivityLogResult {
  readonly error: Error | null;
  readonly reportedBySyncStatus: boolean;
}

interface InventorySaleStateRow {
  readonly inventory_item_id: string;
  readonly workspace_id: string;
  readonly sale_state: InventoryItemSaleState;
  readonly active_sale_count: number;
  readonly active_sale_id: string | null;
}

interface QueryError {
  readonly code?: string;
  readonly message: string;
}

interface InventorySaleStateQuery extends PromiseLike<{
  data: InventorySaleStateRow[] | null;
  error: QueryError | null;
}> {
  eq(column: string, value: string): InventorySaleStateQuery;
}

interface InventoryIntegrityClient {
  from(table: 'inventory_item_sale_states'): {
    select(columns: string): {
      eq(column: string, value: string): InventorySaleStateQuery;
    };
  };
  rpc(
    name: 'resolve_legacy_sold_item',
    parameters: {
      p_workspace_id: string;
      p_inventory_item_id: string;
      p_action: 'restore_stock';
      p_reason: string;
    },
  ): PromiseLike<{
    data: { inventory_item: InventoryItem } | null;
    error: QueryError | null;
  }>;
}

@Injectable({
  providedIn: 'root',
})
export class InventoryService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly profitEngine = inject(ProfitEngineService);

  private get integrityClient(): InventoryIntegrityClient {
    return this.supabase.client as unknown as InventoryIntegrityClient;
  }

  readonly items = signal<InventoryItem[]>([]);
  readonly selectedItem = signal<InventoryItem | null>(null);

  applyArchiveMetadata(
    workspaceId: string,
    itemId: string,
    metadata: Pick<InventoryItem, 'archived_at' | 'archived_by'>,
  ): void {
    if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
    const apply = (item: InventoryItem): InventoryItem =>
      item.id === itemId && item.workspace_id === workspaceId
        ? { ...item, archived_at: metadata.archived_at, archived_by: metadata.archived_by }
        : item;
    this.items.update((items) => items.map(apply));
    this.selectedItem.update((item) => (item ? apply(item) : null));
  }
  readonly itemCosts = signal<ItemCost[]>([]);
  readonly activityLogs = signal<ActivityLog[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<Error | null>(null);
  readonly loadedWorkspaceId = signal<string | null>(null);
  private loadRequestId = 0;
  private detailLoadRequestId = 0;

  private isMutationLocked(itemId: string): boolean {
    const selected = this.selectedItem();
    const item =
      this.items().find((candidate) => candidate.id === itemId) ??
      (selected?.id === itemId ? selected : null);
    return !!item && isInventoryItemMutationLocked(item);
  }

  private lockedMutationResult(): { error: Error } {
    return {
      error: new Error(
        'Verkaufte oder widersprüchliche Inventardaten dürfen nur über einen dokumentierten Korrekturvorgang geändert werden.',
      ),
    };
  }

  /**
   * Ob die Artikelliste dieses Arbeitsbereichs vollstaendig geladen ist.
   *
   * Andere Dienste leiten daraus ab, ob sie sich auf `items()` verlassen
   * duerfen - etwa fuer die Artikelanzahl eines Einkaufs. Ohne diese
   * Unterscheidung wuerde waehrend des Ladens ueberall kurz "0" stehen.
   */
  readonly istGeladen = computed(() => {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    return (
      workspaceId !== undefined &&
      this.loadedWorkspaceId() === workspaceId &&
      this.loadError() === null
    );
  });

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService.currentWorkspace();
        this.resetItemDetail();
        if (ws) {
          this.loadInventory(ws.id);
        } else {
          this.loadRequestId += 1;
          this.isLoading.set(false);
          this.loadError.set(null);
          this.loadedWorkspaceId.set(null);
          this.items.set([]);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  async loadInventory(workspaceId: string): Promise<void> {
    // Ein verspäteter Mutations-Refresh für Workspace A darf den bereits
    // geladenen Bestand des inzwischen aktiven Workspace B nicht einmal kurz
    // leeren. Die nachgelagerten Request-IDs schützen Antworten; diese Prüfung
    // schützt zusätzlich schon den Start eines veralteten Requests.
    if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
    const requestId = ++this.loadRequestId;
    this.isLoading.set(true);
    this.loadError.set(null);
    this.loadedWorkspaceId.set(null);
    this.items.set([]);
    try {
      const { data, error } = await this.supabase.client
        .from('inventory_items')
        .select(
          `
          *,
          purchase:purchases(*, source:sources(*), supplier:suppliers(*)),
          costs:item_costs(*),
          media:item_media(*)
        `,
        )
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (!this.isCurrentLoad(requestId, workspaceId)) return;

      if (error) {
        this.loadError.set(this.syncStatus.melde('Laden des Inventars', error));
      } else if (data) {
        const { data: saleStates, error: saleStateError } = await this.integrityClient
          .from('inventory_item_sale_states')
          .select('inventory_item_id, workspace_id, sale_state, active_sale_count, active_sale_id')
          .eq('workspace_id', workspaceId);

        if (!this.isCurrentLoad(requestId, workspaceId)) return;

        if (saleStateError) {
          this.loadError.set(
            this.syncStatus.melde('Laden der Inventar-Verkaufszustände', saleStateError),
          );
          return;
        }

        const statesByItemId = new Map(
          (saleStates ?? []).map((saleState) => [saleState.inventory_item_id, saleState]),
        );
        const enriched = (data as unknown as InventoryItem[]).map((item) => {
          const saleState = statesByItemId.get(item.id);
          return this.enrichItemTotals(saleState ? this.mergeSaleState(item, saleState) : item);
        });
        this.items.set(enriched);
        this.loadedWorkspaceId.set(workspaceId);
      }
    } catch (err: unknown) {
      if (!this.isCurrentLoad(requestId, workspaceId)) return;
      this.loadError.set(this.syncStatus.melde('Laden des Inventars', err));
    } finally {
      if (requestId === this.loadRequestId) this.isLoading.set(false);
    }
  }

  private isCurrentLoad(requestId: number, workspaceId: string): boolean {
    return (
      requestId === this.loadRequestId &&
      this.workspaceService.currentWorkspace()?.id === workspaceId
    );
  }

  private resetItemDetail(): void {
    this.detailLoadRequestId += 1;
    this.selectedItem.set(null);
    this.itemCosts.set([]);
    this.activityLogs.set([]);
  }

  private isCurrentDetailLoad(requestId: number, workspaceId: string): boolean {
    return (
      requestId === this.detailLoadRequestId &&
      this.workspaceService.currentWorkspace()?.id === workspaceId
    );
  }

  async getItemById(itemId: string): Promise<InventoryItem | null> {
    const requestId = ++this.detailLoadRequestId;
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    this.selectedItem.set(null);
    this.itemCosts.set([]);
    this.activityLogs.set([]);
    if (!workspaceId) return null;
    this.isLoading.set(true);
    const signalItem = this.items().find(
      (item) => item.id === itemId && item.workspace_id === workspaceId,
    );
    let existing: InventoryItem | undefined;

    if (signalItem?.sale_state !== undefined) {
      existing = signalItem;
    }

    if (existing) {
      const enriched = this.enrichItemTotals(existing);
      await this.loadActivityLogs(itemId, workspaceId, requestId);
      if (!this.isCurrentDetailLoad(requestId, workspaceId)) return null;
      this.selectedItem.set(enriched);
      this.itemCosts.set(enriched.costs || []);
      this.isLoading.set(false);
      return enriched;
    }

    try {
      const { data, error } = await this.supabase.client
        .from('inventory_items')
        .select(
          `
          *,
          purchase:purchases(*, source:sources(*), supplier:suppliers(*)),
          costs:item_costs(*),
          media:item_media(*)
        `,
        )
        .eq('workspace_id', workspaceId)
        .eq('id', itemId)
        .single();

      if (!this.isCurrentDetailLoad(requestId, workspaceId)) return null;
      if (error || !data) {
        if (error) this.syncStatus.melde('Abrufen des Artikels', error);
        return null;
      }

      const rawItem = data as unknown as InventoryItem;
      if (rawItem.workspace_id !== workspaceId) return null;

      const { data: saleStates, error: saleStateError } = await this.integrityClient
        .from('inventory_item_sale_states')
        .select('inventory_item_id, workspace_id, sale_state, active_sale_count, active_sale_id')
        .eq('workspace_id', workspaceId)
        .eq('inventory_item_id', itemId);

      if (!this.isCurrentDetailLoad(requestId, workspaceId)) return null;
      if (saleStateError) {
        this.syncStatus.melde('Laden des Inventar-Verkaufszustands', saleStateError);
        this.selectedItem.set(null);
        return null;
      }

      const saleState = (saleStates ?? []).find(
        (state) =>
          state.inventory_item_id === itemId && state.workspace_id === rawItem.workspace_id,
      );
      if (!saleState) {
        this.syncStatus.melde(
          'Laden des Inventar-Verkaufszustands',
          new Error('Für den Artikel wurde kein sicherer Verkaufszustand zurückgegeben.'),
        );
        this.selectedItem.set(null);
        return null;
      }

      const item = this.enrichItemTotals(this.mergeSaleState(rawItem, saleState));
      await this.loadActivityLogs(itemId, workspaceId, requestId);
      if (!this.isCurrentDetailLoad(requestId, workspaceId)) return null;
      this.selectedItem.set(item);
      this.itemCosts.set((data.costs || []) as ItemCost[]);

      return item;
    } catch (err) {
      if (this.isCurrentDetailLoad(requestId, workspaceId)) {
        this.syncStatus.melde('GetItemById', err);
      }
      return null;
    } finally {
      if (requestId === this.detailLoadRequestId) this.isLoading.set(false);
    }
  }

  private mergeSaleState(item: InventoryItem, saleState: InventorySaleStateRow): InventoryItem {
    return {
      ...item,
      sale_state: saleState.sale_state,
      active_sale_count: saleState.active_sale_count,
      active_sale_id: saleState.active_sale_id,
    };
  }

  async loadActivityLogs(
    itemId: string,
    workspaceId = this.workspaceService.currentWorkspace()?.id,
    detailRequestId?: number,
  ): Promise<void> {
    if (!workspaceId) return;
    const isCurrent = (): boolean =>
      this.workspaceService.currentWorkspace()?.id === workspaceId &&
      (detailRequestId === undefined || this.isCurrentDetailLoad(detailRequestId, workspaceId));

    try {
      const { data, error } = await this.supabase.client
        .from('activity_logs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('inventory_item_id', itemId)
        .order('created_at', { ascending: false });

      if (!isCurrent()) return;
      if (error) {
        this.syncStatus.melde('Laden der Aktivitätsprotokolle', error);
      } else if (data && data.length > 0) {
        this.activityLogs.set(data as ActivityLog[]);
      }
    } catch (err) {
      if (isCurrent()) this.syncStatus.melde('Laden der Aktivitätsprotokolle', err);
    }
  }

  public enrichItemTotals(raw: InventoryItem): InventoryItem {
    const additionalCostsSum = (raw.costs || []).reduce(
      (sum, cost) => sum + Number(cost.amount || 0),
      0,
    );
    const purchaseCost = raw.allocated_purchase_cost;
    const totalCost =
      purchaseCost == null || !Number.isFinite(purchaseCost)
        ? undefined
        : Number((purchaseCost + additionalCostsSum).toFixed(2));
    const expectedVal = raw.expected_value == null ? null : Number(raw.expected_value);
    const profitPotential =
      expectedVal !== null && totalCost !== undefined
        ? Number((expectedVal - totalCost).toFixed(2))
        : undefined;

    return {
      ...raw,
      total_item_cost: totalCost,
      profit_potential: profitPotential,
    } as InventoryItem;
  }

  async resolveLegacySoldItem(itemId: string): Promise<{ error: Error | null }> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { error: new Error('Kein aktiver Workspace') };

    try {
      const { data, error } = await this.integrityClient.rpc('resolve_legacy_sold_item', {
        p_workspace_id: workspace.id,
        p_inventory_item_id: itemId,
        p_action: 'restore_stock',
        p_reason: INVENTORY_RECONCILIATION_AUDIT_REASONS.restoreStock,
      });

      if (error || !data?.inventory_item) {
        return {
          error: this.syncStatus.melde(
            'Klärung des historischen Inventarstatus',
            error ?? new Error('Die Datenbank hat keinen geklärten Artikel zurückgegeben.'),
          ),
        };
      }

      const mergeResolvedItem = (current: InventoryItem): InventoryItem =>
        this.enrichItemTotals({
          ...current,
          ...data.inventory_item,
          sale_state: 'no_active_sale',
          active_sale_count: 0,
          active_sale_id: null,
        });

      this.items.update((items) =>
        items.map((item) => (item.id === itemId ? mergeResolvedItem(item) : item)),
      );
      const selected = this.selectedItem();
      if (selected?.id === itemId) this.selectedItem.set(mergeResolvedItem(selected));
      return { error: null };
    } catch (error: unknown) {
      return {
        error: this.syncStatus.melde('Klärung des historischen Inventarstatus', error),
      };
    }
  }

  async createItem(
    payload: CreateItemPayload,
    fehlerAktion?: SyncFehlerAktion,
  ): Promise<CreateItemResult> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) {
      return {
        data: null,
        error: new Error('Kein aktiver Workspace'),
        reportedBySyncStatus: false,
        problems: [],
      };
    }

    try {
      const insertPayload: TablesInsert<'inventory_items'> = {
        workspace_id: ws.id,
        purchase_id: payload.purchase_id || null,
        purchase_line_id: payload.purchase_line_id || null,
        category_id: payload.categoryId ?? null,
        title: payload.title.trim(),
        brand_id: payload.brandId ?? null,
        model: payload.model?.trim() || null,
        condition: payload.condition,
        status: payload.status || 'received',
        sku: payload.sku?.trim() || null,
        ean: payload.ean?.trim() || null,
        description: payload.description?.trim() || null,
        allocated_purchase_cost: payload.allocated_purchase_cost,
        expected_value: payload.expected_value || null,
        ...(payload.categoryId === undefined ? { category: payload.category?.trim() || null } : {}),
        ...(payload.brandId === undefined ? { brand: payload.brand?.trim() || null } : {}),
      };

      const { data: dbData, error: dbError } = await this.supabase.client
        .from('inventory_items')
        .insert(insertPayload)
        .select()
        .single();

      if (dbError) {
        return {
          data: null,
          error: this.syncStatus.melde('Speichern des Artikels', dbError, fehlerAktion),
          reportedBySyncStatus: true,
          problems: [],
        };
      } else if (dbData) {
        const finalEnriched = this.enrichItemTotals(dbData as unknown as InventoryItem);
        this.items.update((list) => [finalEnriched, ...list]);
        const logErgebnis = await this.logActivity(
          finalEnriched.id,
          'received',
          `Artikel angelegt (${finalEnriched.title})`,
        );
        if (logErgebnis.error) {
          return {
            data: finalEnriched,
            error: null,
            reportedBySyncStatus: logErgebnis.reportedBySyncStatus,
            problems: [
              {
                kind: 'activity_log',
                error: logErgebnis.error,
                reportedBySyncStatus: logErgebnis.reportedBySyncStatus,
              },
            ],
          };
        }
        return { data: finalEnriched, error: null, reportedBySyncStatus: false, problems: [] };
      }
    } catch (err: unknown) {
      return {
        data: null,
        error: this.syncStatus.melde('Erstellen des Artikels', err, fehlerAktion),
        reportedBySyncStatus: true,
        problems: [],
      };
    }

    return {
      data: null,
      error: new Error('Der Artikel wurde nicht zurückgegeben'),
      reportedBySyncStatus: false,
      problems: [],
    };
  }

  async updateItem(itemId: string, updates: UpdateItemPayload): Promise<{ error: Error | null }> {
    if (this.isMutationLocked(itemId)) return this.lockedMutationResult();
    const existing =
      this.items().find((item) => item.id === itemId) ??
      (this.selectedItem()?.id === itemId ? this.selectedItem() : undefined);
    if (
      (updates.source_package_line_id !== undefined &&
        updates.source_package_line_id !== existing?.source_package_line_id) ||
      (existing?.source_package_line_id &&
        ((updates.purchase_id !== undefined && updates.purchase_id !== existing.purchase_id) ||
          (updates.purchase_line_id !== undefined &&
            updates.purchase_line_id !== existing.purchase_line_id)))
    )
      return { error: new Error('Die Herkunft eines Paketinhalts kann nicht geändert werden.') };
    const mappedUpdates = mapItemUpdates(updates);
    const aenderungenLokalUebernehmen = (aenderungen: Partial<InventoryItem>): void => {
      this.items.update((list) =>
        list.map((item) =>
          item.id === itemId ? this.enrichItemTotals({ ...item, ...aenderungen }) : item,
        ),
      );

      const currentSel = this.selectedItem();
      if (currentSel && currentSel.id === itemId) {
        this.selectedItem.set(this.enrichItemTotals({ ...currentSel, ...aenderungen }));
      }
    };

    try {
      const {
        categoryId,
        brandId,
        category: legacyCategory,
        brand: legacyBrand,
        total_item_cost,
        profit_potential,
        costs,
        media,
        purchase,
        sale,
        sale_state: _saleState,
        active_sale_count: _activeSaleCount,
        active_sale_id: _activeSaleId,
        activity_logs,
        notes: _notes,
        condition_notes: _conditionNotes,
        ...dbUpdates
      } = updates as UpdateItemPayload & { activity_logs?: ActivityLog[] };

      const payload: TablesUpdate<'inventory_items'> = {
        ...dbUpdates,
        updated_at: new Date().toISOString(),
      };
      if (categoryId !== undefined) payload.category_id = categoryId;
      else if (legacyCategory !== undefined) payload.category = legacyCategory;
      if (brandId !== undefined) payload.brand_id = brandId;
      else if (legacyBrand !== undefined) payload.brand = legacyBrand;

      const { error, count } = await this.supabase.client
        .from('inventory_items')
        .update(payload, { count: 'exact' })
        .eq('id', itemId);

      if (error) {
        return { error: this.syncStatus.melde('Aktualisieren des Artikels', error) };
      }
      if (count === 0) {
        return {
          error: this.syncStatus.melde('Aktualisieren des Artikels', {
            code: 'PGRST116',
            message: 'Der Artikel wurde nicht gefunden.',
          }),
        };
      }
      if (touchesCategoryOrBrand(updates)) {
        // Der Trigger setzt die abgeleiteten Texte. Ohne Nachlesen bliebe der
        // lokale Artikel bis zum nächsten Laden veraltet.
        const { data: derived, error: readError } = await this.supabase.client
          .from('inventory_items')
          .select('category_id, category, brand_id, brand')
          .eq('id', itemId)
          .maybeSingle();
        if (readError)
          return { error: this.syncStatus.melde('Aktualisieren des Artikels', readError) };
        if (derived) {
          aenderungenLokalUebernehmen({ ...mappedUpdates, ...derived });
          return { error: null };
        }
      }
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Aktualisieren des Artikels', e) };
    }

    aenderungenLokalUebernehmen(mappedUpdates);
    return { error: null };
  }

  async updateItemStatus(
    itemId: string,
    newStatus: ItemStatus,
    notes?: string,
  ): Promise<{ error: Error | null }> {
    if (this.isMutationLocked(itemId)) return this.lockedMutationResult();
    const statusLokalUebernehmen = (): void => {
      this.items.update((list) =>
        list.map((item) => (item.id === itemId ? { ...item, status: newStatus } : item)),
      );

      const currentSel = this.selectedItem();
      if (currentSel && currentSel.id === itemId) {
        this.selectedItem.set({ ...currentSel, status: newStatus });
      }
    };

    try {
      const { error, count } = await this.supabase.client
        .from('inventory_items')
        .update({ status: newStatus, updated_at: new Date().toISOString() }, { count: 'exact' })
        .eq('id', itemId);

      if (error) {
        return { error: this.syncStatus.melde('Aktualisieren des Artikelstatus', error) };
      }
      if (count === 0) {
        return {
          error: this.syncStatus.melde('Aktualisieren des Artikelstatus', {
            code: 'PGRST116',
            message: 'Der Artikel wurde nicht gefunden.',
          }),
        };
      }
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Aktualisieren des Artikelstatus', e) };
    }

    statusLokalUebernehmen();
    await this.logActivity(itemId, newStatus, notes || `Status geändert auf: ${newStatus}`);

    return { error: null };
  }

  async addItemCost(
    itemId: string,
    type: string,
    amount: number,
    description?: string,
  ): Promise<{ error: Error | null }> {
    if (this.isMutationLocked(itemId)) return this.lockedMutationResult();
    const kostenLokalUebernehmen = (kosten: ItemCost): void => {
      this.itemCosts.update((costs) => [...costs, kosten]);
      this.items.update((list) =>
        list.map((i) => {
          if (i.id === itemId) {
            const updatedCosts = [...(i.costs || []), kosten];
            return this.enrichItemTotals({ ...i, costs: updatedCosts });
          }
          return i;
        }),
      );
    };

    try {
      const { data, error } = await this.supabase.client
        .from('item_costs')
        .insert({
          inventory_item_id: itemId,
          type,
          amount,
          description: description?.trim() || null,
        })
        .select()
        .single();

      if (error || !data) {
        return {
          error: this.syncStatus.melde(
            'Hinzufügen der Artikelkosten',
            error ?? new Error('Die Datenbank hat keine Artikelkosten zurückgegeben.'),
          ),
        };
      }
      kostenLokalUebernehmen(data as ItemCost);
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Hinzufügen der Artikelkosten', e) };
    }

    await this.logActivity(
      itemId,
      'cost_added',
      `Kosten hinzugefügt: ${amount.toFixed(2)} € (${type})`,
    );

    return { error: null };
  }

  async deleteItemCost(itemId: string, costId: string): Promise<{ error: Error | null }> {
    if (this.isMutationLocked(itemId)) return this.lockedMutationResult();
    const kostenLokalEntfernen = (): void => {
      this.itemCosts.update((costs) => costs.filter((c) => c.id !== costId));
      this.items.update((list) =>
        list.map((i) => {
          if (i.id === itemId) {
            const updatedCosts = (i.costs || []).filter((c) => c.id !== costId);
            return this.enrichItemTotals({ ...i, costs: updatedCosts });
          }
          return i;
        }),
      );
    };

    try {
      const { error, count } = await this.supabase.client
        .from('item_costs')
        .delete({ count: 'exact' })
        .eq('id', costId);
      if (error) {
        return { error: this.syncStatus.melde('Löschen der Artikelkosten', error) };
      }
      if (count === 0) {
        return {
          error: this.syncStatus.melde('Löschen der Artikelkosten', {
            code: 'PGRST116',
            message: 'Die Artikelkosten wurden nicht gefunden.',
          }),
        };
      }
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Löschen der Artikelkosten', e) };
    }

    kostenLokalEntfernen();
    return { error: null };
  }

  async logActivity(itemId: string, action: string, notes?: string): Promise<ActivityLogResult> {
    const wsId = this.workspaceService.currentWorkspace()?.id;
    if (!wsId) {
      return { error: new Error('Kein aktiver Workspace.'), reportedBySyncStatus: false };
    }
    const newLog: ActivityLog = {
      id: `log-${Date.now()}`,
      workspace_id: wsId,
      inventory_item_id: itemId,
      action,
      notes: notes || null,
      created_at: new Date().toISOString(),
    };

    try {
      const { error } = await this.supabase.client.from('activity_logs').insert({
        workspace_id: wsId,
        inventory_item_id: itemId,
        action,
        notes: notes || null,
      });

      if (error) {
        return {
          error: this.syncStatus.melde('Speichern des Aktivitätsprotokolls', error),
          reportedBySyncStatus: true,
        };
      }
    } catch (e: unknown) {
      return {
        error: this.syncStatus.melde('Speichern des Aktivitätsprotokolls', e),
        reportedBySyncStatus: true,
      };
    }

    this.activityLogs.update((logs) => [newLog, ...logs]);
    return { error: null, reportedBySyncStatus: false };
  }

  /**
   * Uebernimmt bereits berechnete Artikelaenderungen in die Live-Liste.
   *
   * Gedacht fuer Vorgaenge, die mehrere Artikel auf einmal anfassen (z. B. die
   * Kostenverteilung eines Konvoluts) und die Datenbank selbst schreiben.
   */
  uebernehmeArtikelAenderungen(geaenderte: InventoryItem[]): void {
    if (geaenderte.length === 0) return;
    const nachId = new Map(geaenderte.map((i) => [i.id, i]));

    this.items.update((list) =>
      list.map((item) => {
        const treffer = nachId.get(item.id);
        return treffer ? this.enrichItemTotals({ ...item, ...treffer }) : item;
      }),
    );

    const aktuell = this.selectedItem();
    if (aktuell && nachId.has(aktuell.id)) {
      this.selectedItem.set(this.enrichItemTotals({ ...aktuell, ...nachId.get(aktuell.id)! }));
    }
  }

  /**
   * Entfernt alle Artikel eines geloeschten Einkaufs aus der Live-Liste.
   *
   * In der Datenbank erledigt das der Fremdschluessel (ON DELETE CASCADE);
   * die Anzeige muss aber im selben Moment nachziehen.
   */
  entferneArtikelZuEinkauf(purchaseId: string): void {
    this.items.update((list) => list.filter((i) => i.purchase_id !== purchaseId));
    if (this.selectedItem()?.purchase_id === purchaseId) {
      this.selectedItem.set(null);
    }
  }

  async deleteItem(itemId: string): Promise<{ error: Error | null }> {
    if (this.isMutationLocked(itemId)) return this.lockedMutationResult();
    try {
      const { error, count } = await this.supabase.client
        .from('inventory_items')
        .delete({ count: 'exact' })
        .eq('id', itemId);
      if (error) {
        return { error: this.syncStatus.melde('Löschen des Artikels', error) };
      }
      if (count === 0) {
        return {
          error: this.syncStatus.melde('Löschen des Artikels', {
            code: 'PGRST116',
            message: 'Der Artikel wurde nicht gefunden.',
          }),
        };
      }
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Löschen des Artikels', e) };
    }

    this.items.update((list) => list.filter((i) => i.id !== itemId));
    if (this.selectedItem()?.id === itemId) {
      this.selectedItem.set(null);
    }

    return { error: null };
  }
}
