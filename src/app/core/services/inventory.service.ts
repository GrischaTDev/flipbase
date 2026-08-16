import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
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

  readonly items = signal<InventoryItem[]>([]);
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
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const enriched = (data as unknown[]).map((item: any) => this.enrichItemTotals(item));
        this.items.set(enriched);
      }
    } catch (err) {
      console.error('Error loading inventory:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async getItemById(itemId: string): Promise<InventoryItem | null> {
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

      // Load activity logs
      await this.loadActivityLogs(itemId);

      return item;
    } catch (err) {
      console.error('Error loading item details:', err);
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadActivityLogs(itemId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('activity_logs')
        .select('*')
        .eq('inventory_item_id', itemId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        this.activityLogs.set(data as ActivityLog[]);
      }
    } catch (err) {
      console.error('Error loading activity logs:', err);
    }
  }

  private enrichItemTotals(raw: any): InventoryItem {
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

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
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

      if (error || !data) return { data: null, error };

      const newItem = this.enrichItemTotals(data);

      // Log creation activity
      await this.logActivity(newItem.id, 'received', `Artikel angelegt (${newItem.title})`);

      await this.loadInventory(ws.id);
      return { data: newItem, error: null };
    } catch (err: unknown) {
      return { data: null, error: err as Error };
    } finally {
      this.isLoading.set(false);
    }
  }

  async updateItem(
    itemId: string,
    updates: Partial<InventoryItem>
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client
        .from('inventory_items')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) return { error };

      await this.getItemById(itemId);
      const ws = this.workspaceService.currentWorkspace();
      if (ws) await this.loadInventory(ws.id);

      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }

  async updateItemStatus(
    itemId: string,
    newStatus: ItemStatus,
    notes?: string
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client
        .from('inventory_items')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) return { error };

      // Log activity
      await this.logActivity(
        itemId,
        newStatus,
        notes || `Status geändert auf: ${newStatus}`
      );

      await this.getItemById(itemId);
      const ws = this.workspaceService.currentWorkspace();
      if (ws) await this.loadInventory(ws.id);

      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }

  async addItemCost(
    itemId: string,
    type: string,
    amount: number,
    description?: string
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client
        .from('item_costs')
        .insert({
          inventory_item_id: itemId,
          type,
          amount,
          description: description?.trim() || null,
        });

      if (error) return { error };

      await this.logActivity(itemId, 'cost_added', `Kosten hinzugefügt: ${amount.toFixed(2)} € (${type})`);
      await this.getItemById(itemId);

      const ws = this.workspaceService.currentWorkspace();
      if (ws) await this.loadInventory(ws.id);

      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }

  async deleteItemCost(costId: string, itemId: string): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client
        .from('item_costs')
        .delete()
        .eq('id', costId);

      if (error) return { error };

      await this.getItemById(itemId);
      const ws = this.workspaceService.currentWorkspace();
      if (ws) await this.loadInventory(ws.id);

      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }

  async logActivity(itemId: string, action: string, notes?: string): Promise<void> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return;

    try {
      await this.supabase.client.from('activity_logs').insert({
        workspace_id: ws.id,
        inventory_item_id: itemId,
        action,
        notes: notes || null,
      });
      await this.loadActivityLogs(itemId);
    } catch (err) {
      console.error('Error logging activity:', err);
    }
  }

  async deleteItem(itemId: string): Promise<{ error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    try {
      const { error } = await this.supabase.client
        .from('inventory_items')
        .delete()
        .eq('id', itemId);

      if (error) return { error };

      if (ws) await this.loadInventory(ws.id);
      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }
}
