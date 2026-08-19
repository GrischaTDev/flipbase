import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { MockDataStoreService } from './mock-data-store.service';
import { WebhookService } from './webhook.service';
import { SyncStatusService } from './sync-status.service';
import {
  Purchase,
  PurchaseType,
  CostAllocationMode,
  PurchaseCost,
  InventoryItem,
  TrackingCarrier,
  InboundTrackingStatus,
} from '../models/reflip.models';

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

  readonly purchases = signal<Purchase[]>([]);
  readonly selectedPurchase = signal<Purchase | null>(null);
  readonly purchaseItems = signal<InventoryItem[]>([]);
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
          this.loadPurchases(ws.id);
        } else {
          this.purchases.set([]);
          this.selectedPurchase.set(null);
          this.purchaseItems.set([]);
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
          items_count: matchingItems.length > 0 ? matchingItems.length : p.items_count || 1,
        } as Purchase;
      });
      this.purchases.set(enrichedLocal);
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
          items:inventory_items(id, title, status, allocated_purchase_cost, expected_value)
        `,
        )
        .eq('workspace_id', workspaceId)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        this.syncStatus.melde('Laden der Einkäufe', error);
        this.purchases.set([]);
      } else if (data) {
        const enriched = (data as unknown[]).map((p: any) => {
          const costsSum = (p.costs || []).reduce(
            (acc: number, c: any) => acc + Number(c.amount || 0),
            0,
          );
          const totalCost = Number(p.purchase_price || 0) + costsSum;
          return {
            ...p,
            items_count: (p.items || []).length > 0 ? (p.items || []).length : p.items_count || 1,
            total_purchase_cost: Number(totalCost.toFixed(2)),
          } as Purchase;
        });
        this.purchases.set(enriched);
      }
    } catch (err) {
      this.syncStatus.melde('Laden der Einkäufe', err);
      this.purchases.set([]);
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
        items_count: items.length > 0 ? items.length : existing.items_count || 1,
      };
      this.selectedPurchase.set(enriched);
      this.purchaseItems.set(items);
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
        items_count: (data.items || []).length > 0 ? (data.items || []).length : 1,
        total_purchase_cost: Number(totalCost.toFixed(2)),
      };

      this.selectedPurchase.set(enriched);
      this.purchaseItems.set((data.items || []) as InventoryItem[]);
      return enriched;
    } catch (err) {
      this.syncStatus.melde('GetPurchaseById', err);
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  async createPurchase(
    payload: CreatePurchasePayload,
  ): Promise<{ data: Purchase | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace') };

    const mode: CostAllocationMode = payload.cost_allocation_mode || 'even';
    const extraCostsSum = (payload.initial_costs || []).reduce(
      (acc, c) => acc + Number(c.amount || 0),
      0,
    );
    const totalCost = payload.purchase_price + extraCostsSum;

    const localSources = this.mockStore.getSources();
    const localSuppliers = this.mockStore.getSuppliers();
    const source = payload.source_id
      ? localSources.find((s) => s.id === payload.source_id)
      : undefined;
    const supplier = payload.supplier_id
      ? localSuppliers.find((s) => s.id === payload.supplier_id)
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
      items_count: payload.type === 'single' ? 1 : payload.items_count || 0,
      created_at: new Date().toISOString(),
    };

    // 1. Immediately persist locally
    this.mockStore.savePurchase(newPurchase);
    this.purchases.update((list) => [newPurchase, ...list]);
    this.webhookService.sendPurchaseNotification(newPurchase);

    if (this.mockStore.isDemoMode() || ws.id.startsWith('demo-')) {
      return { data: newPurchase, error: null };
    }

    // 2. Sync to Supabase
    try {
      const { data: dbPur, error: dbError } = await this.supabase.client
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
          total_purchase_cost: totalCost,
        })
        .select()
        .single();

      if (dbError) {
        this.verwerfeVorlaeufigenEinkauf(newPurchase.id);
        return { data: null, error: this.syncStatus.melde('Speichern des Einkaufs', dbError) };
      } else if (dbPur) {
        const finalPurchase: Purchase = {
          ...newPurchase,
          id: dbPur.id,
        };
        // Den vorlaeufigen Eintrag entfernen, bevor der endgueltige gespeichert
        // wird. Sonst bleibt er mit seiner Behelfs-Kennung im lokalen Spiegel
        // liegen und der Einkauf taucht doppelt auf - auch in jeder Sicherung.
        this.mockStore.deletePurchase(newPurchase.id);
        this.mockStore.savePurchase(finalPurchase);
        this.purchases.update((list) => [
          finalPurchase,
          ...list.filter((p) => p.id !== newPurchase.id && p.id !== finalPurchase.id),
        ]);
        return { data: finalPurchase, error: null };
      }
    } catch (err: unknown) {
      this.verwerfeVorlaeufigenEinkauf(newPurchase.id);
      return { data: null, error: this.syncStatus.melde('Erstellen des Einkaufs', err) };
    }

    return { data: newPurchase, error: null };
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
    this.purchases.update((list) => list.filter((p) => p.id !== vorlaeufigeId));
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

    this.mockStore.savePurchase(updated);
    this.purchases.update((list) => list.map((p) => (p.id === purchaseId ? updated : p)));
    if (this.selectedPurchase()?.id === purchaseId) {
      this.selectedPurchase.set(updated);
    }

    if (!this.mockStore.isDemoMode() && !existing.workspace_id.startsWith('demo-')) {
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

    return { data: updated, error: null };
  }

  async markPurchaseDeliveredAndSyncItems(
    purchaseId: string,
  ): Promise<{ updatedCount: number; error: Error | null }> {
    const existing = this.purchases().find((p) => p.id === purchaseId);
    if (!existing) return { updatedCount: 0, error: new Error('Einkauf nicht gefunden') };

    // 1. Update purchase tracking status to delivered
    await this.updatePurchaseTracking(
      purchaseId,
      existing.tracking_number || null,
      existing.tracking_carrier,
      'delivered',
    );

    // 2. Find and update all associated items to 'received'
    const allItems = this.mockStore.getItems(existing.workspace_id);
    const purchaseItems = allItems.filter((i) => i.purchase_id === purchaseId);
    let updatedCount = 0;

    for (const item of purchaseItems) {
      if (item.status === 'needs_review' || !item.status) {
        const updatedItem: InventoryItem = {
          ...item,
          status: 'received',
          updated_at: new Date().toISOString(),
        };
        this.mockStore.saveItem(updatedItem);
        updatedCount++;
      }
    }

    // Refresh selected purchase items list
    if (this.selectedPurchase()?.id === purchaseId) {
      const refreshedItems = this.mockStore
        .getItems(existing.workspace_id)
        .filter((i) => i.purchase_id === purchaseId);
      this.purchaseItems.set(refreshedItems);
    }

    return { updatedCount, error: null };
  }

  async deletePurchase(purchaseId: string): Promise<{ error: Error | null }> {
    this.mockStore.deletePurchase(purchaseId);
    this.purchases.update((list) => list.filter((p) => p.id !== purchaseId));
    if (this.selectedPurchase()?.id === purchaseId) {
      this.selectedPurchase.set(null);
    }

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

    return { error: null };
  }

  async addPurchaseCost(
    purchaseId: string,
    type: string,
    amount: number,
    description?: string,
  ): Promise<{ error: Error | null }> {
    const current = this.selectedPurchase();
    if (current && current.id === purchaseId) {
      const updatedTotal = (current.total_purchase_cost || current.purchase_price) + amount;
      this.selectedPurchase.set({ ...current, total_purchase_cost: updatedTotal });
    }

    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client.from('purchase_costs').insert({
          purchase_id: purchaseId,
          type,
          amount,
          description: description?.trim() || null,
        });

        if (error) {
          return { error: this.syncStatus.melde('Hinzufügen der Einkaufskosten', error) };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Hinzufügen der Einkaufskosten', e) };
      }
    }

    return { error: null };
  }

  async updateCostAllocationMode(
    purchaseId: string,
    mode: CostAllocationMode,
  ): Promise<{ error: Error | null }> {
    const current = this.selectedPurchase();
    if (current && current.id === purchaseId) {
      const updated = { ...current, cost_allocation_mode: mode };
      this.selectedPurchase.set(updated);
      this.mockStore.savePurchase(updated);
    }
    this.purchases.update((list) =>
      list.map((p) => {
        if (p.id === purchaseId) {
          const updated = { ...p, cost_allocation_mode: mode };
          this.mockStore.savePurchase(updated);
          return updated;
        }
        return p;
      }),
    );

    if (!this.mockStore.isDemoMode()) {
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
    }
    return { error: null };
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

    this.purchaseItems.set(updatedItems);
    updatedItems.forEach((it) => this.mockStore.saveItem(it));
    await this.updateCostAllocationMode(purchaseId, mode);

    if (!this.mockStore.isDemoMode()) {
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

  async addItemToPurchase(
    purchaseId: string,
    itemData: {
      title: string;
      category?: string;
      condition: any;
      allocated_purchase_cost?: number;
      expected_value?: number;
    },
  ): Promise<{ data: InventoryItem | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    const newItem: InventoryItem = {
      id: `item-${Date.now()}`,
      workspace_id: ws?.id || 'demo-workspace-1',
      purchase_id: purchaseId,
      title: itemData.title,
      category: itemData.category || null,
      condition: itemData.condition,
      status: 'received',
      allocated_purchase_cost: itemData.allocated_purchase_cost || 0,
      expected_value: itemData.expected_value || null,
      created_at: new Date().toISOString(),
    };

    this.mockStore.saveItem(newItem);
    this.purchaseItems.update((items) => [...items, newItem]);

    const totalCount = this.mockStore.getItems().filter((i) => i.purchase_id === purchaseId).length;
    this.purchases.update((list) =>
      list.map((p) => (p.id === purchaseId ? { ...p, items_count: totalCount } : p)),
    );
    const storedP = this.mockStore.getPurchases().find((p) => p.id === purchaseId);
    if (storedP) {
      this.mockStore.savePurchase({ ...storedP, items_count: totalCount });
    }

    const wsId = ws?.id;
    if (!this.mockStore.isDemoMode() && wsId && !wsId.startsWith('demo-')) {
      try {
        const { data: dbData, error } = await this.supabase.client
          .from('inventory_items')
          .insert({
            workspace_id: wsId,
            purchase_id: purchaseId,
            title: itemData.title,
            category: itemData.category || null,
            condition: itemData.condition,
            status: 'received',
            allocated_purchase_cost: itemData.allocated_purchase_cost || 0,
            expected_value: itemData.expected_value || null,
          })
          .select()
          .single();

        if (error) {
          return {
            data: null,
            error: this.syncStatus.melde('Hinzufügen des Artikels zum Einkauf', error),
          };
        } else if (dbData) {
          const finalItem = { ...newItem, id: dbData.id };
          this.mockStore.saveItem(finalItem);
          this.purchaseItems.update((items) => [
            finalItem,
            ...items.filter((i) => i.id !== newItem.id),
          ]);
          return { data: finalItem, error: null };
        }
      } catch (e: unknown) {
        return {
          data: null,
          error: this.syncStatus.melde('Hinzufügen des Artikels zum Einkauf', e),
        };
      }
    }

    return { data: newItem, error: null };
  }
}
