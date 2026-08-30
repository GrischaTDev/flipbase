import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SyncFehlerAktion, SyncStatusService } from './sync-status.service';
import { createLocalDemoId } from '../utils/client-identity';
import {
  InventoryItem,
  ItemCost,
  ItemStatus,
  ItemCondition,
  ActivityLog,
  InventoryItemSaleState,
  Sale,
} from '../models/flipbase.models';
import type { TablesUpdate } from '../models/supabase.types';
import { isInventoryItemMutationLocked } from '../models/inventory-sellability';
import { INVENTORY_RECONCILIATION_AUDIT_REASONS } from '../models/inventory-reconciliation';

export interface CreateItemPayload {
  purchase_id?: string | null;
  purchase_line_id?: string | null;
  category?: string | null;
  title: string;
  brand?: string | null;
  model?: string | null;
  condition: ItemCondition;
  status?: ItemStatus;
  sku?: string | null;
  ean?: string | null;
  description?: string | null;
  allocated_purchase_cost: number;
  expected_value?: number | null;
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

interface InventoryIntegrityClient {
  from(table: 'inventory_item_sale_states'): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): PromiseLike<{ data: InventorySaleStateRow[] | null; error: QueryError | null }>;
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

/**
 * Vorlaeufige Kennung fuer einen neuen Artikel.
 *
 * Stand vorher auf `item-${Date.now()}`. Werden zwei Artikel in derselben
 * Millisekunde angelegt - beim Erfassen mehrerer gleicher Stuecke passiert
 * genau das -, bekommen sie dieselbe Kennung, und der zweite ueberschreibt den
 * ersten. Aufgefallen beim Anlegen von fuenf Stueck: angekommen sind zwei.
 *
 * Die endgueltige Kennung vergibt anschliessend die Datenbank.
 */
function vorlaeufigeKennung(): string {
  return createLocalDemoId('item');
}

@Injectable({
  providedIn: 'root',
})
export class InventoryService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly profitEngine = inject(ProfitEngineService);
  private readonly mockStore = inject(MockDataStoreService);

  private get integrityClient(): InventoryIntegrityClient {
    return this.supabase.client as unknown as InventoryIntegrityClient;
  }

  readonly items = signal<InventoryItem[]>([]);
  readonly selectedItem = signal<InventoryItem | null>(null);
  readonly itemCosts = signal<ItemCost[]>([]);
  readonly activityLogs = signal<ActivityLog[]>([]);
  readonly isLoading = signal<boolean>(false);

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
  readonly istGeladen = signal<boolean>(false);

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
          this.loadInventory(ws.id);
        } else {
          this.istGeladen.set(false);
          this.items.set([]);
          this.selectedItem.set(null);
          this.itemCosts.set([]);
          this.activityLogs.set([]);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  async loadInventory(workspaceId: string): Promise<void> {
    if (this.mockStore.isDemoMode()) {
      const localItems = this.classifyDemoSaleStates(
        this.mockStore.getItems(workspaceId),
        this.mockStore.getSales(workspaceId),
      ).map((i) => this.enrichItemTotals(i));
      this.items.set(localItems);
      this.istGeladen.set(true);
      return;
    }

    this.isLoading.set(true);
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

      if (error) {
        this.syncStatus.melde('Laden des Inventars', error);
        this.items.set([]);
      } else if (data) {
        const { data: saleStates, error: saleStateError } = await this.integrityClient
          .from('inventory_item_sale_states')
          .select('inventory_item_id, workspace_id, sale_state, active_sale_count, active_sale_id')
          .eq('workspace_id', workspaceId);

        if (saleStateError) {
          this.syncStatus.melde('Laden der Inventar-Verkaufszustände', saleStateError);
          this.items.set([]);
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
        this.istGeladen.set(true);
      }
    } catch (err) {
      this.syncStatus.melde('Laden des Inventars', err);
      this.items.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async getItemById(itemId: string): Promise<InventoryItem | null> {
    const signalItem = this.items().find((item) => item.id === itemId);
    let existing: InventoryItem | undefined;

    if (this.mockStore.isDemoMode()) {
      const rawItem = this.mockStore.getItems().find((item) => item.id === itemId) ?? signalItem;
      existing =
        signalItem?.sale_state !== undefined
          ? signalItem
          : rawItem
            ? this.classifyDemoSaleStates([rawItem], this.mockStore.getSales())[0]
            : undefined;
    } else if (signalItem?.sale_state !== undefined) {
      existing = signalItem;
    }

    if (existing) {
      const enriched = this.enrichItemTotals(existing);
      this.selectedItem.set(enriched);
      const costs = this.mockStore.getItemCosts(itemId);
      this.itemCosts.set(costs.length > 0 ? costs : enriched.costs || []);
      await this.loadActivityLogs(itemId);
      return enriched;
    }

    this.isLoading.set(true);
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
        .eq('id', itemId)
        .single();

      if (error || !data) {
        if (error) this.syncStatus.melde('Abrufen des Artikels', error);
        return null;
      }

      const { data: saleStates, error: saleStateError } = await this.integrityClient
        .from('inventory_item_sale_states')
        .select('inventory_item_id, workspace_id, sale_state, active_sale_count, active_sale_id')
        .eq('inventory_item_id', itemId);

      if (saleStateError) {
        this.syncStatus.melde('Laden des Inventar-Verkaufszustands', saleStateError);
        this.selectedItem.set(null);
        return null;
      }

      const rawItem = data as unknown as InventoryItem;
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
      this.selectedItem.set(item);
      this.itemCosts.set((data.costs || []) as ItemCost[]);

      await this.loadActivityLogs(itemId);
      return item;
    } catch (err) {
      this.syncStatus.melde('GetItemById', err);
      return null;
    } finally {
      this.isLoading.set(false);
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

  async loadActivityLogs(itemId: string): Promise<void> {
    const localLogs = this.mockStore.getActivityLogs(itemId);
    if (localLogs.length > 0) {
      this.activityLogs.set(localLogs);
    }

    if (this.mockStore.isDemoMode()) {
      return;
    }

    try {
      const { data, error } = await this.supabase.client
        .from('activity_logs')
        .select('*')
        .eq('inventory_item_id', itemId)
        .order('created_at', { ascending: false });

      if (error) {
        this.syncStatus.melde('Laden der Aktivitätsprotokolle', error);
      } else if (data && data.length > 0) {
        this.activityLogs.set(data as ActivityLog[]);
      }
    } catch (err) {
      this.syncStatus.melde('Laden der Aktivitätsprotokolle', err);
    }
  }

  public enrichItemTotals(raw: InventoryItem): InventoryItem {
    const additionalCostsSum = (raw.costs || []).reduce(
      (sum, cost) => sum + Number(cost.amount || 0),
      0,
    );
    const purchaseCost = Number(raw.allocated_purchase_cost || 0);
    const totalCost = Number((purchaseCost + additionalCostsSum).toFixed(2));
    const expectedVal = raw.expected_value ? Number(raw.expected_value) : null;
    const profitPotential =
      expectedVal !== null ? Number((expectedVal - totalCost).toFixed(2)) : undefined;

    return {
      ...raw,
      total_item_cost: totalCost,
      profit_potential: profitPotential,
    } as InventoryItem;
  }

  private classifyDemoSaleStates(items: InventoryItem[], sales: Sale[]): InventoryItem[] {
    const activeSalesByItem = new Map<string, Set<string>>();
    const legacyHeadersWithoutLine = new Set<string>();

    const addSale = (itemId: string, saleId: string): void => {
      const saleIds = activeSalesByItem.get(itemId) ?? new Set<string>();
      saleIds.add(saleId);
      activeSalesByItem.set(itemId, saleIds);
    };

    for (const sale of sales) {
      if (sale.returned_at || sale.voided_at) continue;

      const persistedLines = sale.has_persisted_lines === false ? [] : (sale.lines ?? []);
      for (const line of persistedLines) {
        if (line.inventory_item_id) addSale(line.inventory_item_id, sale.id);
      }

      if (sale.inventory_item_id) {
        addSale(sale.inventory_item_id, sale.id);
        const hasMatchingLine = persistedLines.some(
          (line) => line.inventory_item_id === sale.inventory_item_id,
        );
        if (!hasMatchingLine) legacyHeadersWithoutLine.add(sale.inventory_item_id);
      }
    }

    return items.map((item) => {
      const activeSaleIds = [...(activeSalesByItem.get(item.id) ?? [])];
      const activeSaleCount = activeSaleIds.length;
      let saleState: InventoryItemSaleState;

      if (activeSaleCount > 1) saleState = 'multiple_active_sales';
      else if (legacyHeadersWithoutLine.has(item.id)) {
        saleState = 'legacy_sale_header_without_line';
      } else if (item.status === 'sold' && activeSaleCount === 0) {
        saleState = 'legacy_sold_unverified';
      } else if (item.status !== 'sold' && activeSaleCount > 0) {
        saleState = 'sale_status_conflict';
      } else if (activeSaleCount === 1) saleState = 'sold';
      else saleState = 'no_active_sale';

      return {
        ...item,
        sale_state: saleState,
        active_sale_count: activeSaleCount,
        active_sale_id: activeSaleCount === 1 ? activeSaleIds[0] : null,
      };
    });
  }

  async resolveLegacySoldItem(itemId: string): Promise<{ error: Error | null }> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { error: new Error('Kein aktiver Workspace') };

    if (this.mockStore.isDemoMode()) {
      return { error: new Error('Die Altbestandsklärung benötigt eine Datenbankverbindung.') };
    }

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

    const newItem: InventoryItem = {
      id: vorlaeufigeKennung(),
      workspace_id: ws.id,
      purchase_id: payload.purchase_id || null,
      purchase_line_id: payload.purchase_line_id || null,
      category: payload.category?.trim() || null,
      title: payload.title.trim(),
      brand: payload.brand?.trim() || null,
      model: payload.model?.trim() || null,
      condition: payload.condition,
      status: payload.status || 'received',
      sku: payload.sku?.trim() || this.naechsteArtikelnummer(),
      ean: payload.ean?.trim() || null,
      description: payload.description?.trim() || null,
      allocated_purchase_cost: payload.allocated_purchase_cost || 0,
      expected_value: payload.expected_value || null,
      created_at: new Date().toISOString(),
    };

    const enriched = this.enrichItemTotals(newItem);

    if (this.mockStore.isDemoMode()) {
      this.mockStore.saveItem(enriched);
      this.items.update((list) => [enriched, ...list]);
      const logErgebnis = await this.logActivity(
        newItem.id,
        'received',
        `Artikel angelegt (${newItem.title})`,
      );
      if (logErgebnis.error) {
        return {
          data: enriched,
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
      return { data: enriched, error: null, reportedBySyncStatus: false, problems: [] };
    }

    try {
      const { data: dbData, error: dbError } = await this.supabase.client
        .from('inventory_items')
        .insert({
          workspace_id: ws.id,
          purchase_id: payload.purchase_id || null,
          purchase_line_id: payload.purchase_line_id || null,
          category: payload.category?.trim() || null,
          title: payload.title.trim(),
          brand: payload.brand?.trim() || null,
          model: payload.model?.trim() || null,
          condition: payload.condition,
          status: payload.status || 'received',
          sku: payload.sku?.trim() || null,
          ean: payload.ean?.trim() || null,
          description: payload.description?.trim() || null,
          allocated_purchase_cost: payload.allocated_purchase_cost || 0,
          expected_value: payload.expected_value || null,
        })
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
        this.mockStore.saveItem(finalEnriched);
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

  async updateItem(
    itemId: string,
    updates: Partial<InventoryItem>,
  ): Promise<{ error: Error | null }> {
    if (this.isMutationLocked(itemId)) return this.lockedMutationResult();
    const aenderungenLokalUebernehmen = (): void => {
      const stored = this.mockStore.getItems().find((i) => i.id === itemId);
      const base = stored || this.items().find((i) => i.id === itemId) || this.selectedItem();
      if (base) {
        const updated = this.enrichItemTotals({ ...base, ...updates });
        this.mockStore.saveItem(updated);
      }

      this.items.update((list) =>
        list.map((item) =>
          item.id === itemId ? this.enrichItemTotals({ ...item, ...updates }) : item,
        ),
      );

      const currentSel = this.selectedItem();
      if (currentSel && currentSel.id === itemId) {
        this.selectedItem.set(this.enrichItemTotals({ ...currentSel, ...updates }));
      }
    };

    if (this.mockStore.isDemoMode()) {
      aenderungenLokalUebernehmen();
      return { error: null };
    }

    try {
      const {
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
      } = updates as Partial<InventoryItem> & { activity_logs?: ActivityLog[] };

      const payload: TablesUpdate<'inventory_items'> = {
        ...dbUpdates,
        updated_at: new Date().toISOString(),
      };

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
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Aktualisieren des Artikels', e) };
    }

    aenderungenLokalUebernehmen();
    return { error: null };
  }

  async updateItemStatus(
    itemId: string,
    newStatus: ItemStatus,
    notes?: string,
  ): Promise<{ error: Error | null }> {
    if (this.isMutationLocked(itemId)) return this.lockedMutationResult();
    const statusLokalUebernehmen = (): void => {
      const stored = this.mockStore.getItems().find((i) => i.id === itemId);
      const base = stored || this.items().find((i) => i.id === itemId) || this.selectedItem();
      if (base) {
        this.mockStore.saveItem({ ...base, status: newStatus });
      }

      this.items.update((list) =>
        list.map((item) => (item.id === itemId ? { ...item, status: newStatus } : item)),
      );

      const currentSel = this.selectedItem();
      if (currentSel && currentSel.id === itemId) {
        this.selectedItem.set({ ...currentSel, status: newStatus });
      }
    };

    if (this.mockStore.isDemoMode()) {
      statusLokalUebernehmen();
      await this.logActivity(itemId, newStatus, notes || `Status geändert auf: ${newStatus}`);
      return { error: null };
    }

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
    const newCost: ItemCost = {
      id: `cost-${Date.now()}`,
      inventory_item_id: itemId,
      type,
      amount,
      description: description?.trim() || null,
      created_at: new Date().toISOString(),
    };

    const kostenLokalUebernehmen = (kosten: ItemCost): void => {
      this.mockStore.saveItemCost(kosten);
      this.itemCosts.update((costs) => [...costs, kosten]);
      this.items.update((list) =>
        list.map((i) => {
          if (i.id === itemId) {
            const updatedCosts = [...(i.costs || []), kosten];
            const updatedItem = this.enrichItemTotals({ ...i, costs: updatedCosts });
            this.mockStore.saveItem(updatedItem);
            return updatedItem;
          }
          return i;
        }),
      );
    };

    if (this.mockStore.isDemoMode()) {
      kostenLokalUebernehmen(newCost);
      await this.logActivity(
        itemId,
        'cost_added',
        `Kosten hinzugefügt: ${amount.toFixed(2)} € (${type})`,
      );
      return { error: null };
    }

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
      this.mockStore.deleteItemCost(costId);
      this.itemCosts.update((costs) => costs.filter((c) => c.id !== costId));
      this.items.update((list) =>
        list.map((i) => {
          if (i.id === itemId) {
            const updatedCosts = (i.costs || []).filter((c) => c.id !== costId);
            const updatedItem = this.enrichItemTotals({ ...i, costs: updatedCosts });
            this.mockStore.saveItem(updatedItem);
            return updatedItem;
          }
          return i;
        }),
      );
    };

    if (!this.mockStore.isDemoMode()) {
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
    }

    kostenLokalEntfernen();
    return { error: null };
  }

  async logActivity(itemId: string, action: string, notes?: string): Promise<ActivityLogResult> {
    const wsId = this.workspaceService.currentWorkspace()?.id || 'demo-workspace-1';
    const newLog: ActivityLog = {
      id: `log-${Date.now()}`,
      workspace_id: wsId,
      inventory_item_id: itemId,
      action,
      notes: notes || null,
      created_at: new Date().toISOString(),
    };

    if (!this.mockStore.isDemoMode()) {
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
    }

    this.mockStore.saveActivityLog(newLog);
    this.activityLogs.update((logs) => [newLog, ...logs]);
    return { error: null, reportedBySyncStatus: false };
  }

  /**
   * Vergibt die naechste interne Artikelnummer, z. B. FB-2026-0042.
   *
   * Das Feld gab es schon, nur hat es niemand ausgefuellt - es war ein reines
   * Eingabefeld, und auf dem Etikett stand ersatzweise ein Stueck der internen
   * Kennung. Eine eigene Nummer ist das, was Warenwirtschaften fuer
   * Gebrauchtware ueber Seriennummern loesen: Sie macht das einzelne Stueck
   * ansprechbar - auf dem Etikett, im Regal und in den Aufzeichnungen zu
   * § 25a.
   *
   * Die Nummer zaehlt je Jahr hoch und weicht aus, falls es sie schon gibt.
   * Das reicht fuer einen Betrieb, in dem eine Person erfasst; bei mehreren
   * gleichzeitig muesste die Datenbank die Nummer vergeben.
   */
  private naechsteArtikelnummer(): string {
    const jahr = new Date().getFullYear();
    const praefix = `FB-${jahr}-`;

    const hoechste = this.items()
      .map((i) => i.sku)
      .filter((nr): nr is string => !!nr && nr.startsWith(praefix))
      .map((nr) => Number(nr.slice(praefix.length)))
      .filter((n) => Number.isFinite(n))
      .reduce((max, n) => Math.max(max, n), 0);

    const vergeben = new Set(this.items().map((i) => i.sku));
    let naechste = hoechste + 1;
    while (vergeben.has(praefix + String(naechste).padStart(4, '0'))) {
      naechste++;
    }

    return praefix + String(naechste).padStart(4, '0');
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

    geaenderte.forEach((i) => this.mockStore.saveItem(i));
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
    if (!this.mockStore.isDemoMode()) {
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
    }

    this.mockStore.deleteItem(itemId);
    this.items.update((list) => list.filter((i) => i.id !== itemId));
    if (this.selectedItem()?.id === itemId) {
      this.selectedItem.set(null);
    }

    return { error: null };
  }
}
