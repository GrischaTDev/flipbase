import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import {
  Purchase,
  PurchaseCost,
  PurchaseType,
  CostAllocationMode,
  InventoryItem,
  ItemCondition,
} from '../models/reflip.models';

export interface CreatePurchasePayload {
  type: PurchaseType;
  title: string;
  source_id?: string | null;
  supplier_id?: string | null;
  purchase_date: string;
  purchase_price: number;
  cost_allocation_mode?: CostAllocationMode;
  original_url?: string | null;
  notes?: string | null;
  initial_costs?: { type: string; amount: number; description?: string }[];
  single_item_title?: string;
  single_item_condition?: ItemCondition;
  single_item_expected_value?: number;
}

@Injectable({
  providedIn: 'root',
})
export class PurchaseService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly profitEngine = inject(ProfitEngineService);

  readonly purchases = signal<Purchase[]>([]);
  readonly selectedPurchase = signal<Purchase | null>(null);
  readonly purchaseItems = signal<InventoryItem[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    effect(() => {
      const ws = this.workspaceService.currentWorkspace();
      if (ws) {
        this.loadPurchases(ws.id);
      } else {
        this.purchases.set([]);
        this.selectedPurchase.set(null);
        this.purchaseItems.set([]);
      }
    });
  }

  async loadPurchases(workspaceId: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('purchases')
        .select(`
          *,
          source:sources(*),
          supplier:suppliers(*),
          costs:purchase_costs(*),
          items:inventory_items(id, title, status, allocated_purchase_cost, expected_value)
        `)
        .eq('workspace_id', workspaceId)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (!error && data) {
        const enriched = (data as unknown[]).map((p: any) => {
          const costsSum = (p.costs || []).reduce((acc: number, c: any) => acc + Number(c.amount || 0), 0);
          const totalCost = Number(p.purchase_price || 0) + costsSum;
          return {
            ...p,
            items_count: (p.items || []).length,
            total_purchase_cost: Number(totalCost.toFixed(2)),
          } as Purchase;
        });

        this.purchases.set(enriched);
      }
    } catch (err) {
      console.error('Error loading purchases:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async getPurchaseById(purchaseId: string): Promise<Purchase | null> {
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('purchases')
        .select(`
          *,
          source:sources(*),
          supplier:suppliers(*),
          costs:purchase_costs(*),
          items:inventory_items(
            *,
            costs:item_costs(*),
            media:item_media(*)
          )
        `)
        .eq('id', purchaseId)
        .single();

      if (error || !data) {
        return null;
      }

      const p = data as any;
      const costsSum = (p.costs || []).reduce((acc: number, c: any) => acc + Number(c.amount || 0), 0);
      const totalCost = Number(p.purchase_price || 0) + costsSum;

      const purchase: Purchase = {
        ...p,
        items_count: (p.items || []).length,
        total_purchase_cost: Number(totalCost.toFixed(2)),
      };

      this.selectedPurchase.set(purchase);
      this.purchaseItems.set((p.items || []) as InventoryItem[]);
      return purchase;
    } catch (err) {
      console.error('Error loading purchase details:', err);
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  async createPurchase(payload: CreatePurchasePayload): Promise<{ data: Purchase | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace ausgewählt') };

    this.isLoading.set(true);
    try {
      // 1. Insert Purchase
      const { data: purchaseData, error: pErr } = await this.supabase.client
        .from('purchases')
        .insert({
          workspace_id: ws.id,
          type: payload.type,
          title: payload.title.trim(),
          source_id: payload.source_id || null,
          supplier_id: payload.supplier_id || null,
          purchase_date: payload.purchase_date,
          purchase_price: payload.purchase_price,
          cost_allocation_mode: payload.cost_allocation_mode || 'even',
          original_url: payload.original_url?.trim() || null,
          notes: payload.notes?.trim() || null,
        })
        .select()
        .single();

      if (pErr || !purchaseData) {
        return { data: null, error: pErr };
      }

      const newPurchase = purchaseData as Purchase;

      // 2. Insert initial purchase costs if any
      let totalAdditionalCosts = 0;
      if (payload.initial_costs && payload.initial_costs.length > 0) {
        const costRows = payload.initial_costs.map((c) => ({
          purchase_id: newPurchase.id,
          type: c.type,
          amount: c.amount,
          description: c.description || null,
        }));

        await this.supabase.client.from('purchase_costs').insert(costRows);
        totalAdditionalCosts = payload.initial_costs.reduce((sum, c) => sum + c.amount, 0);
      }

      const totalPurchaseCost = newPurchase.purchase_price + totalAdditionalCosts;

      // 3. For single item purchases, automatically create the 1st inventory item!
      if (payload.type === 'single') {
        const itemTitle = payload.single_item_title?.trim() || payload.title.trim();
        const { data: itemData, error: itemErr } = await this.supabase.client
          .from('inventory_items')
          .insert({
            workspace_id: ws.id,
            purchase_id: newPurchase.id,
            title: itemTitle,
            condition: payload.single_item_condition || 'used',
            status: 'received',
            allocated_purchase_cost: totalPurchaseCost,
            expected_value: payload.single_item_expected_value || null,
          })
          .select()
          .single();

        if (itemErr) {
          console.error('Error creating linked single inventory item:', itemErr);
        } else if (itemData) {
          // Log activity
          await this.supabase.client.from('activity_logs').insert({
            workspace_id: ws.id,
            inventory_item_id: itemData.id,
            action: 'received',
            notes: `Artikel als Einzelkauf erfasst (${itemTitle})`,
          });
        }
      }

      await this.loadPurchases(ws.id);
      return { data: newPurchase, error: null };
    } catch (err: unknown) {
      return { data: null, error: err as Error };
    } finally {
      this.isLoading.set(false);
    }
  }

  async addPurchaseCost(
    purchaseId: string,
    type: string,
    amount: number,
    description?: string
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client
        .from('purchase_costs')
        .insert({
          purchase_id: purchaseId,
          type,
          amount,
          description: description?.trim() || null,
        });

      if (error) return { error };

      // Refresh and reallocate
      await this.getPurchaseById(purchaseId);
      await this.reallocatePurchaseCosts(purchaseId);
      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }

  async deletePurchaseCost(costId: string, purchaseId: string): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client
        .from('purchase_costs')
        .delete()
        .eq('id', costId);

      if (error) return { error };

      await this.getPurchaseById(purchaseId);
      await this.reallocatePurchaseCosts(purchaseId);
      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }

  async addItemToPurchase(
    purchaseId: string,
    itemData: {
      title: string;
      condition: ItemCondition;
      category?: string;
      brand?: string;
      model?: string;
      expected_value?: number;
      allocated_purchase_cost?: number;
    }
  ): Promise<{ data: InventoryItem | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace') };

    try {
      const { data, error } = await this.supabase.client
        .from('inventory_items')
        .insert({
          workspace_id: ws.id,
          purchase_id: purchaseId,
          title: itemData.title.trim(),
          condition: itemData.condition,
          category: itemData.category?.trim() || null,
          brand: itemData.brand?.trim() || null,
          model: itemData.model?.trim() || null,
          status: 'received',
          expected_value: itemData.expected_value || null,
          allocated_purchase_cost: itemData.allocated_purchase_cost || 0,
        })
        .select()
        .single();

      if (error || !data) return { data: null, error };

      // Log activity
      await this.supabase.client.from('activity_logs').insert({
        workspace_id: ws.id,
        inventory_item_id: data.id,
        action: 'received',
        notes: `Artikel zu Einkauf hinzugefügt (${data.title})`,
      });

      await this.getPurchaseById(purchaseId);
      await this.reallocatePurchaseCosts(purchaseId);
      return { data: data as InventoryItem, error: null };
    } catch (err: unknown) {
      return { data: null, error: err as Error };
    }
  }

  async updateCostAllocationMode(
    purchaseId: string,
    mode: CostAllocationMode
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client
        .from('purchases')
        .update({ cost_allocation_mode: mode })
        .eq('id', purchaseId);

      if (error) return { error };

      await this.reallocatePurchaseCosts(purchaseId, mode);
      await this.getPurchaseById(purchaseId);
      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }

  /**
   * Reallocates total purchase costs across all child inventory items according to the selected mode:
   * - even: Total / Item Count
   * - value_weighted: Proportional to expected_value
   * - manual: Preserves manual entries
   */
  async reallocatePurchaseCosts(purchaseId: string, overrideMode?: CostAllocationMode): Promise<void> {
    const purchase = this.selectedPurchase() || (await this.getPurchaseById(purchaseId));
    if (!purchase) return;

    const mode = overrideMode || purchase.cost_allocation_mode;
    const items = this.purchaseItems();
    if (items.length === 0 || mode === 'manual') return;

    const totalCost = purchase.total_purchase_cost ?? purchase.purchase_price;

    if (mode === 'even') {
      const costPerItem = this.profitEngine.allocateCostsEvenly(totalCost, items.length);
      for (const item of items) {
        await this.supabase.client
          .from('inventory_items')
          .update({ allocated_purchase_cost: costPerItem })
          .eq('id', item.id);
      }
    } else if (mode === 'value_weighted') {
      const totalExpectedValue = items.reduce((sum, item) => sum + (Number(item.expected_value) || 0), 0);

      for (const item of items) {
        const itemVal = Number(item.expected_value) || (totalExpectedValue > 0 ? 0 : totalCost / items.length);
        const weighted = totalExpectedValue > 0
          ? this.profitEngine.allocateCostsValueWeighted(totalCost, itemVal, totalExpectedValue)
          : this.profitEngine.allocateCostsEvenly(totalCost, items.length);

        await this.supabase.client
          .from('inventory_items')
          .update({ allocated_purchase_cost: weighted })
          .eq('id', item.id);
      }
    }

    // Refresh state
    await this.getPurchaseById(purchaseId);
  }

  async deletePurchase(purchaseId: string): Promise<{ error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    try {
      const { error } = await this.supabase.client
        .from('purchases')
        .delete()
        .eq('id', purchaseId);

      if (error) return { error };

      if (ws) {
        await this.loadPurchases(ws.id);
      }
      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }
}
