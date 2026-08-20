import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SyncStatusService } from './sync-status.service';
import {
  InventoryItem,
  ItemCost,
  ItemStatus,
  ItemCondition,
  ActivityLog,
} from '../models/reflip.models';

export interface CreateItemPayload {
  purchase_id?: string | null;
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

@Injectable({
  providedIn: 'root',
})
export class InventoryService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly profitEngine = inject(ProfitEngineService);
  private readonly mockStore = inject(MockDataStoreService);

  readonly items = signal<InventoryItem[]>([]);
  readonly selectedItem = signal<InventoryItem | null>(null);
  readonly itemCosts = signal<ItemCost[]>([]);
  readonly activityLogs = signal<ActivityLog[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung in Phase 8 auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService.currentWorkspace();
        if (ws) {
          this.loadInventory(ws.id);
        } else {
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
      const localItems = this.mockStore.getItems(workspaceId).map((i) => this.enrichItemTotals(i));
      this.items.set(localItems);
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
        const enriched = (data as unknown[]).map((item: any) => this.enrichItemTotals(item));
        this.items.set(enriched);
      }
    } catch (err) {
      this.syncStatus.melde('Laden des Inventars', err);
      this.items.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async getItemById(itemId: string): Promise<InventoryItem | null> {
    const existing =
      this.mockStore.getItems().find((i) => i.id === itemId) ||
      this.items().find((i) => i.id === itemId);
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

      const item = this.enrichItemTotals(data);
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

  public enrichItemTotals(raw: any): InventoryItem {
    const additionalCostsSum = (raw.costs || []).reduce(
      (sum: number, c: any) => sum + Number(c.amount || 0),
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

  async createItem(
    payload: CreateItemPayload,
  ): Promise<{ data: InventoryItem | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace') };

    const newItem: InventoryItem = {
      id: `item-${Date.now()}`,
      workspace_id: ws.id,
      purchase_id: payload.purchase_id || null,
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
      created_at: new Date().toISOString(),
    };

    const enriched = this.enrichItemTotals(newItem);

    // 1. Immediately persist locally (instant UI feedback)
    this.mockStore.saveItem(enriched);
    this.items.update((list) => [enriched, ...list]);
    await this.logActivity(newItem.id, 'received', `Artikel angelegt (${newItem.title})`);

    if (payload.purchase_id) {
      const allForPur = this.mockStore
        .getItems()
        .filter((i) => i.purchase_id === payload.purchase_id);
      const storedPur = this.mockStore.getPurchases().find((p) => p.id === payload.purchase_id);
      if (storedPur) {
        this.mockStore.savePurchase({ ...storedPur, items_count: allForPur.length });
      }
    }

    if (this.mockStore.isDemoMode()) {
      return { data: enriched, error: null };
    }

    // 2. Sync to Supabase in background
    try {
      const { data: dbData, error: dbError } = await this.supabase.client
        .from('inventory_items')
        .insert({
          workspace_id: ws.id,
          purchase_id: payload.purchase_id || null,
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
        return { data: null, error: this.syncStatus.melde('Speichern des Artikels', dbError) };
      } else if (dbData) {
        const finalEnriched = this.enrichItemTotals(dbData);
        // Vorlaeufigen Eintrag entfernen, sonst bleibt er mit seiner
        // Behelfs-Kennung im lokalen Spiegel liegen (Duplikat).
        this.mockStore.deleteItem(newItem.id);
        this.mockStore.saveItem(finalEnriched);
        this.items.update((list) => [finalEnriched, ...list.filter((i) => i.id !== newItem.id)]);
        return { data: finalEnriched, error: null };
      }
    } catch (err: unknown) {
      return { data: null, error: this.syncStatus.melde('Erstellen des Artikels', err) };
    }

    return { data: enriched, error: null };
  }

  async updateItem(
    itemId: string,
    updates: Partial<InventoryItem>,
  ): Promise<{ error: Error | null }> {
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

    if (!this.mockStore.isDemoMode()) {
      try {
        const {
          total_item_cost,
          profit_potential,
          costs,
          media,
          purchase,
          sale,
          activity_logs,
          ...dbUpdates
        } = updates as any;

        const { error } = await this.supabase.client
          .from('inventory_items')
          .update({ ...dbUpdates, updated_at: new Date().toISOString() })
          .eq('id', itemId);

        if (error) {
          return { error: this.syncStatus.melde('Aktualisieren des Artikels', error) };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Aktualisieren des Artikels', e) };
      }
    }

    return { error: null };
  }

  async updateItemStatus(
    itemId: string,
    newStatus: ItemStatus,
    notes?: string,
  ): Promise<{ error: Error | null }> {
    const stored = this.mockStore.getItems().find((i) => i.id === itemId);
    const base = stored || this.items().find((i) => i.id === itemId) || this.selectedItem();
    if (base) {
      const updated = { ...base, status: newStatus };
      this.mockStore.saveItem(updated);
    }

    this.items.update((list) =>
      list.map((item) => (item.id === itemId ? { ...item, status: newStatus } : item)),
    );

    const currentSel = this.selectedItem();
    if (currentSel && currentSel.id === itemId) {
      this.selectedItem.set({ ...currentSel, status: newStatus });
    }

    await this.logActivity(itemId, newStatus, notes || `Status geändert auf: ${newStatus}`);

    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client
          .from('inventory_items')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', itemId);

        if (error) {
          return { error: this.syncStatus.melde('Aktualisieren des Artikelstatus', error) };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Aktualisieren des Artikelstatus', e) };
      }
    }

    return { error: null };
  }

  async addItemCost(
    itemId: string,
    type: string,
    amount: number,
    description?: string,
  ): Promise<{ error: Error | null }> {
    const newCost: ItemCost = {
      id: `cost-${Date.now()}`,
      inventory_item_id: itemId,
      type,
      amount,
      description: description?.trim() || null,
      created_at: new Date().toISOString(),
    };

    this.mockStore.saveItemCost(newCost);
    this.itemCosts.update((costs) => [...costs, newCost]);

    // Update item costs
    this.items.update((list) =>
      list.map((i) => {
        if (i.id === itemId) {
          const updatedCosts = [...(i.costs || []), newCost];
          const updatedItem = this.enrichItemTotals({ ...i, costs: updatedCosts });
          this.mockStore.saveItem(updatedItem);
          return updatedItem;
        }
        return i;
      }),
    );

    await this.logActivity(
      itemId,
      'cost_added',
      `Kosten hinzugefügt: ${amount.toFixed(2)} € (${type})`,
    );

    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client.from('item_costs').insert({
          inventory_item_id: itemId,
          type,
          amount,
          description: description?.trim() || null,
        });

        if (error) {
          return { error: this.syncStatus.melde('Hinzufügen der Artikelkosten', error) };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Hinzufügen der Artikelkosten', e) };
      }
    }

    return { error: null };
  }

  async deleteItemCost(costId: string, itemId: string): Promise<{ error: Error | null }> {
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

    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client.from('item_costs').delete().eq('id', costId);
        if (error) {
          return { error: this.syncStatus.melde('Löschen der Artikelkosten', error) };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Löschen der Artikelkosten', e) };
      }
    }

    return { error: null };
  }

  async logActivity(itemId: string, action: string, notes?: string): Promise<void> {
    const wsId = this.workspaceService.currentWorkspace()?.id || 'demo-workspace-1';
    const newLog: ActivityLog = {
      id: `log-${Date.now()}`,
      workspace_id: wsId,
      inventory_item_id: itemId,
      action,
      notes: notes || null,
      created_at: new Date().toISOString(),
    };

    this.mockStore.saveActivityLog(newLog);
    this.activityLogs.update((logs) => [newLog, ...logs]);

    if (!this.mockStore.isDemoMode() && !this.mockStore?.isDemoMode()) {
      try {
        const { error } = await this.supabase.client.from('activity_logs').insert({
          workspace_id: wsId,
          inventory_item_id: itemId,
          action,
          notes: notes || null,
        });

        if (error) {
          this.syncStatus.melde('Speichern des Aktivitätsprotokolls', error);
        }
      } catch (e: unknown) {
        this.syncStatus.melde('Speichern des Aktivitätsprotokolls', e);
      }
    }
  }

  async deleteItem(itemId: string): Promise<{ error: Error | null }> {
    this.mockStore.deleteItem(itemId);
    this.items.update((list) => list.filter((i) => i.id !== itemId));
    if (this.selectedItem()?.id === itemId) {
      this.selectedItem.set(null);
    }

    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client
          .from('inventory_items')
          .delete()
          .eq('id', itemId);
        if (error) {
          return { error: this.syncStatus.melde('Löschen des Artikels', error) };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Löschen des Artikels', e) };
      }
    }

    return { error: null };
  }
}
