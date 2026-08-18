import { Injectable, signal } from '@angular/core';
import {
  Workspace,
  Source,
  Supplier,
  Purchase,
  InventoryItem,
  Sale,
  ActivityLog,
  ItemCost,
  ItemMedia,
} from '../models/reflip.models';

const DEMO_WS_ID = 'demo-workspace-1';

const STORAGE_KEY_PURCHASES = 'reflip_local_purchases';
const STORAGE_KEY_ITEMS = 'reflip_local_inventory';
const STORAGE_KEY_SALES = 'reflip_local_sales';
const STORAGE_KEY_SOURCES = 'reflip_local_sources';
const STORAGE_KEY_SUPPLIERS = 'reflip_local_suppliers';
const STORAGE_KEY_ITEM_COSTS = 'reflip_local_item_costs';
const STORAGE_KEY_ACTIVITY_LOGS = 'reflip_local_activity_logs';
const STORAGE_KEY_MEDIA = 'reflip_local_media';

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage;
  } catch {}
  return null;
}

@Injectable({
  providedIn: 'root',
})
export class MockDataStoreService {
  readonly isDemoMode = signal<boolean>(false);

  readonly demoWorkspace: Workspace = {
    id: DEMO_WS_ID,
    name: 'Mein Reselling Business',
    currency: 'EUR',
    min_roi_percent: 30,
    min_profit_amount: 15,
    created_at: new Date().toISOString(),
  };

  readonly defaultSources: Source[] = [
    { id: 'src-1', workspace_id: DEMO_WS_ID, name: 'Kleinanzeigen', type: 'online_marketplace', is_active: true },
    { id: 'src-2', workspace_id: DEMO_WS_ID, name: 'eBay', type: 'online_marketplace', is_active: true },
    { id: 'src-3', workspace_id: DEMO_WS_ID, name: 'Vinted', type: 'online_marketplace', is_active: true },
    { id: 'src-4', workspace_id: DEMO_WS_ID, name: 'Flohmarkt', type: 'flea_market', is_active: true },
    { id: 'src-5', workspace_id: DEMO_WS_ID, name: 'B-Stock / Retourenhandel', type: 'b2b_wholesaler', is_active: true },
  ];

  // In-memory accessor for backwards compatibility with tests
  get demoSources(): Source[] {
    return this.getSources();
  }

  get demoSuppliers(): Supplier[] {
    return this.getSuppliers();
  }

  get demoPurchases(): Purchase[] {
    return this.getPurchases();
  }

  get demoItems(): InventoryItem[] {
    return this.getItems();
  }

  get demoSales(): Sale[] {
    return this.getSales();
  }

  // --- Purchases Persistent API ---
  getPurchases(workspaceId?: string): Purchase[] {
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_PURCHASES);
      if (stored) {
        const list: Purchase[] = JSON.parse(stored);
        return workspaceId ? list.filter((p) => !p.workspace_id || p.workspace_id === workspaceId) : list;
      }
    } catch {}
    return [];
  }

  savePurchase(purchase: Purchase): void {
    try {
      const all = this.getPurchases();
      const idx = all.findIndex((p) => p.id === purchase.id);
      if (idx >= 0) {
        all[idx] = purchase;
      } else {
        all.unshift(purchase);
      }
      getStorage()?.setItem(STORAGE_KEY_PURCHASES, JSON.stringify(all));
    } catch {}
  }

  deletePurchase(id: string): void {
    try {
      const all = this.getPurchases().filter((p) => p.id !== id);
      getStorage()?.setItem(STORAGE_KEY_PURCHASES, JSON.stringify(all));
    } catch {}
  }

  // --- Inventory Items Persistent API ---
  getItems(workspaceId?: string): InventoryItem[] {
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_ITEMS);
      if (stored) {
        const list: InventoryItem[] = JSON.parse(stored);
        return workspaceId ? list.filter((i) => !i.workspace_id || i.workspace_id === workspaceId) : list;
      }
    } catch {}
    return [];
  }

  saveItem(item: InventoryItem): void {
    try {
      const all = this.getItems();
      const idx = all.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        all[idx] = item;
      } else {
        all.unshift(item);
      }
      getStorage()?.setItem(STORAGE_KEY_ITEMS, JSON.stringify(all));
    } catch {}
  }

  deleteItem(id: string): void {
    try {
      const all = this.getItems().filter((i) => i.id !== id);
      getStorage()?.setItem(STORAGE_KEY_ITEMS, JSON.stringify(all));
    } catch {}
  }

  // --- Sales Persistent API ---
  getSales(workspaceId?: string): Sale[] {
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_SALES);
      if (stored) {
        const list: Sale[] = JSON.parse(stored);
        return workspaceId ? list.filter((s) => !s.workspace_id || s.workspace_id === workspaceId) : list;
      }
    } catch {}
    return [];
  }

  saveSale(sale: Sale): void {
    try {
      const all = this.getSales();
      const idx = all.findIndex((s) => s.id === sale.id);
      if (idx >= 0) {
        all[idx] = sale;
      } else {
        all.unshift(sale);
      }
      getStorage()?.setItem(STORAGE_KEY_SALES, JSON.stringify(all));
    } catch {}
  }

  deleteSale(id: string): void {
    try {
      const all = this.getSales().filter((s) => s.id !== id);
      getStorage()?.setItem(STORAGE_KEY_SALES, JSON.stringify(all));
    } catch {}
  }

  // --- Sources & Suppliers API ---
  getSources(workspaceId?: string): Source[] {
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_SOURCES);
      if (stored) {
        const list: Source[] = JSON.parse(stored);
        if (list.length > 0) {
          return workspaceId ? list.filter((s) => !s.workspace_id || s.workspace_id === workspaceId) : list;
        }
      }
    } catch {}
    return this.defaultSources;
  }

  saveSource(source: Source): void {
    try {
      const all = this.getSources();
      const idx = all.findIndex((s) => s.id === source.id);
      if (idx >= 0) {
        all[idx] = source;
      } else {
        all.push(source);
      }
      getStorage()?.setItem(STORAGE_KEY_SOURCES, JSON.stringify(all));
    } catch {}
  }

  deleteSource(id: string): void {
    try {
      const all = this.getSources().filter((s) => s.id !== id);
      getStorage()?.setItem(STORAGE_KEY_SOURCES, JSON.stringify(all));
    } catch {}
  }

  getSuppliers(workspaceId?: string): Supplier[] {
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_SUPPLIERS);
      if (stored) {
        const list: Supplier[] = JSON.parse(stored);
        return workspaceId ? list.filter((s) => !s.workspace_id || s.workspace_id === workspaceId) : list;
      }
    } catch {}
    return [];
  }

  saveSupplier(supplier: Supplier): void {
    try {
      const all = this.getSuppliers();
      const idx = all.findIndex((s) => s.id === supplier.id);
      if (idx >= 0) {
        all[idx] = supplier;
      } else {
        all.unshift(supplier);
      }
      getStorage()?.setItem(STORAGE_KEY_SUPPLIERS, JSON.stringify(all));
    } catch {}
  }

  // --- Item Costs API ---
  getItemCosts(itemId: string): ItemCost[] {
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_ITEM_COSTS);
      if (stored) {
        const list: ItemCost[] = JSON.parse(stored);
        return list.filter((c) => c.inventory_item_id === itemId);
      }
    } catch {}
    return [];
  }

  saveItemCost(cost: ItemCost): void {
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_ITEM_COSTS);
      const all: ItemCost[] = stored ? JSON.parse(stored) : [];
      const idx = all.findIndex((c) => c.id === cost.id);
      if (idx >= 0) {
        all[idx] = cost;
      } else {
        all.push(cost);
      }
      getStorage()?.setItem(STORAGE_KEY_ITEM_COSTS, JSON.stringify(all));
    } catch {}
  }

  deleteItemCost(id: string): void {
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_ITEM_COSTS);
      if (stored) {
        const all: ItemCost[] = JSON.parse(stored);
        getStorage()?.setItem(STORAGE_KEY_ITEM_COSTS, JSON.stringify(all.filter((c) => c.id !== id)));
      }
    } catch {}
  }

  // --- Activity Logs API ---
  getActivityLogs(itemId: string): ActivityLog[] {
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_ACTIVITY_LOGS);
      if (stored) {
        const list: ActivityLog[] = JSON.parse(stored);
        return list.filter((l) => l.inventory_item_id === itemId);
      }
    } catch {}
    return [];
  }

  saveActivityLog(log: ActivityLog): void {
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_ACTIVITY_LOGS);
      const all: ActivityLog[] = stored ? JSON.parse(stored) : [];
      all.unshift(log);
      getStorage()?.setItem(STORAGE_KEY_ACTIVITY_LOGS, JSON.stringify(all.slice(0, 500)));
    } catch {}
  }

  // --- Media Persistent API ---
  getItemMedia(itemId?: string): ItemMedia[] {
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_MEDIA);
      if (stored) {
        const list: ItemMedia[] = JSON.parse(stored);
        return itemId ? list.filter((m) => m.inventory_item_id === itemId) : list;
      }
    } catch {}
    return [];
  }

  saveItemMedia(media: ItemMedia): void {
    try {
      const all = this.getItemMedia();
      const idx = all.findIndex((m) => m.id === media.id);
      if (media.is_primary) {
        all.forEach((m) => {
          if (m.inventory_item_id === media.inventory_item_id) {
            m.is_primary = false;
          }
        });
      }
      if (idx >= 0) {
        all[idx] = media;
      } else {
        all.unshift(media);
      }
      getStorage()?.setItem(STORAGE_KEY_MEDIA, JSON.stringify(all));
    } catch {}
  }

  deleteItemMedia(id: string): void {
    try {
      const all = this.getItemMedia().filter((m) => m.id !== id);
      getStorage()?.setItem(STORAGE_KEY_MEDIA, JSON.stringify(all));
    } catch {}
  }

  setItemMediaPrimary(itemId: string, mediaId: string): void {
    try {
      const all = this.getItemMedia();
      all.forEach((m) => {
        if (m.inventory_item_id === itemId) {
          m.is_primary = m.id === mediaId;
        }
      });
      getStorage()?.setItem(STORAGE_KEY_MEDIA, JSON.stringify(all));
    } catch {}
  }

  // Helper with 800ms timeout
  async withTimeout<T>(promiseLike: any, fallback: T, ms: number = 800): Promise<T> {
    const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
    try {
      return await Promise.race([Promise.resolve(promiseLike), timeout]);
    } catch {
      return fallback;
    }
  }
}

