import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { MockDataStoreService } from './mock-data-store.service';
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
  private readonly workspaceService = inject(WorkspaceService);
  private readonly profitEngine = inject(ProfitEngineService);
  private readonly mockStore = inject(MockDataStoreService);

  readonly items = signal<InventoryItem[]>(
    this.mockStore.demoItems.map((i) => this.enrichItemTotals(i))
  );
  readonly selectedItem = signal<InventoryItem | null>(null);
  readonly itemCosts = signal<ItemCost[]>([]);
  readonly activityLogs = signal<ActivityLog[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
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
  }

  async loadInventory(workspaceId: string): Promise<void> {
    const localItems = this.mockStore.getItems(workspaceId).map((i) => this.enrichItemTotals(i));
    this.items.set(localItems);

    if (this.mockStore.isDemoMode() || workspaceId.startsWith('demo-')) {
      return;
    }

    this.isLoading.set(true);
    try {
      const queryPromise = this.supabase.client
        .from('inventory_items')
        .select(`
          *,
          purchase:purchases(*, source:sources(*), supplier:suppliers(*)),
          costs:item_costs(*),
          media:item_media(*)
        `)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      const res: any = await this.mockStore.withTimeout(queryPromise, { data: null, error: new Error('Timeout') }, 1000);

      if (res && !res.error && res.data && res.data.length > 0) {
        const enriched = (res.data as unknown[]).map((item: any) => this.enrichItemTotals(item));
        this.items.set(enriched);
        enriched.forEach((i) => this.mockStore.saveItem(i));
      }
    } catch (err) {
      // Keep local items
    } finally {
      this.isLoading.set(false);
    }
  }

  async getItemById(itemId: string): Promise<InventoryItem | null> {
    const existing = this.items().find((i) => i.id === itemId) || this.mockStore.getItems().find((i) => i.id === itemId);
    if (existing) {
      const enriched = this.enrichItemTotals(existing);
      this.selectedItem.set(enriched);
      const costs = this.mockStore.getItemCosts(itemId);
      this.itemCosts.set(costs.length > 0 ? costs : (enriched.costs || []));
      await this.loadActivityLogs(itemId);
      return enriched;
    }

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('inventory_items')
        .select(`
          *,
          purchase:purchases(*, source:sources(*), supplier:suppliers(*)),
          costs:item_costs(*),
          media:item_media(*)
        `)
        .eq('id', itemId)
        .single();

      if (error || !data) {
        return null;
      }

      const item = this.enrichItemTotals(data);
      this.selectedItem.set(item);
      this.itemCosts.set((data.costs || []) as ItemCost[]);

      await this.loadActivityLogs(itemId);
      return item;
    } catch (err) {
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

    try {
      const { data, error } = await this.supabase.client
        .from('activity_logs')
        .select('*')
        .eq('inventory_item_id', itemId)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        this.activityLogs.set(data as ActivityLog[]);
      }
    } catch (err) {
      // Ignore offline
    }
  }

  public enrichItemTotals(raw: any): InventoryItem {
    const additionalCostsSum = (raw.costs || []).reduce(
      (sum: number, c: any) => sum + Number(c.amount || 0),
      0
    );
    const purchaseCost = Number(raw.allocated_purchase_cost || 0);
    const totalCost = Number((purchaseCost + additionalCostsSum).toFixed(2));
    const expectedVal = raw.expected_value ? Number(raw.expected_value) : null;
    const profitPotential = expectedVal !== null ? Number((expectedVal - totalCost).toFixed(2)) : undefined;

    return {
      ...raw,
      total_item_cost: totalCost,
      profit_potential: profitPotential,
    } as InventoryItem;
  }

  async createItem(payload: CreateItemPayload): Promise<{ data: InventoryItem | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace ausgewählt') };

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

    // 1. Immediately persist locally (resilient against page reloads)
    this.mockStore.saveItem(enriched);
    this.items.update((list) => [enriched, ...list]);
    await this.logActivity(newItem.id, 'received', `Artikel angelegt (${newItem.title})`);

    if (payload.purchase_id) {
      const allForPur = this.mockStore.getItems().filter((i) => i.purchase_id === payload.purchase_id);
      const storedPur = this.mockStore.getPurchases().find((p) => p.id === payload.purchase_id);
      if (storedPur) {
        this.mockStore.savePurchase({ ...storedPur, items_count: allForPur.length });
      }
    }

    if (this.mockStore.isDemoMode() || ws.id.startsWith('demo-')) {
      return { data: enriched, error: null };
    }

    // 2. Sync to Supabase in background if connected
    try {
      await this.supabase.client
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
        });
    } catch {
      // Local fallback active
    }

    return { data: enriched, error: null };
  }

  async updateItem(
    itemId: string,
    updates: Partial<InventoryItem>
  ): Promise<{ error: Error | null }> {
    this.items.update((list) =>
      list.map((item) => {
        if (item.id === itemId) {
          const updated = this.enrichItemTotals({ ...item, ...updates });
          this.mockStore.saveItem(updated);
          return updated;
        }
        return item;
      })
    );

    const currentSel = this.selectedItem();
    if (currentSel && currentSel.id === itemId) {
      this.selectedItem.set(this.enrichItemTotals({ ...currentSel, ...updates }));
    }

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client
          .from('inventory_items')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', itemId);
      } catch (e) {
        // ignore
      }
    }

    return { error: null };
  }

  async updateItemStatus(
    itemId: string,
    newStatus: ItemStatus,
    notes?: string
  ): Promise<{ error: Error | null }> {
    this.items.update((list) =>
      list.map((item) => {
        if (item.id === itemId) {
          const updated = { ...item, status: newStatus };
          this.mockStore.saveItem(updated);
          return updated;
        }
        return item;
      })
    );

    const currentSel = this.selectedItem();
    if (currentSel && currentSel.id === itemId) {
      this.selectedItem.set({ ...currentSel, status: newStatus });
    }

    await this.logActivity(itemId, newStatus, notes || `Status geändert auf: ${newStatus}`);

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client
          .from('inventory_items')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', itemId);
      } catch (e) {
        // ignore
      }
    }

    return { error: null };
  }

  async addItemCost(
    itemId: string,
    type: string,
    amount: number,
    description?: string
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
      })
    );

    await this.logActivity(itemId, 'cost_added', `Kosten hinzugefügt: ${amount.toFixed(2)} € (${type})`);

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client.from('item_costs').insert({
          inventory_item_id: itemId,
          type,
          amount,
          description: description?.trim() || null,
        });
      } catch (e) {
        // ignore
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
      })
    );

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client.from('item_costs').delete().eq('id', costId);
      } catch (e) {
        // ignore
      }
    }

    return { error: null };
  }

  async logActivity(itemId: string, action: string, notes?: string): Promise<void> {
    const newLog: ActivityLog = {
      id: `log-${Date.now()}`,
      workspace_id: this.workspaceService.currentWorkspace()?.id || 'demo-workspace-1',
      inventory_item_id: itemId,
      action,
      notes: notes || null,
      created_at: new Date().toISOString(),
    };

    this.mockStore.saveActivityLog(newLog);
    this.activityLogs.update((logs) => [newLog, ...logs]);

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client.from('activity_logs').insert({
          workspace_id: this.workspaceService.currentWorkspace()?.id,
          inventory_item_id: itemId,
          action,
          notes: notes || null,
        });
      } catch (e) {
        // ignore
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
        await this.supabase.client.from('inventory_items').delete().eq('id', itemId);
      } catch (e) {
        // ignore
      }
    }

    return { error: null };
  }
}
