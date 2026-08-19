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

const DEMO_WS_ID = 'ws-1';

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
    name: 'Mein Reselling Business (Demo)',
    currency: 'EUR',
    min_roi_percent: 30,
    min_profit_amount: 15,
    created_at: '2026-08-01T10:00:00.000Z',
  };

  readonly defaultSources: Source[] = [
    { id: 'src-1', workspace_id: DEMO_WS_ID, name: 'Kleinanzeigen', type: 'online_marketplace', is_active: true },
    { id: 'src-2', workspace_id: DEMO_WS_ID, name: 'eBay', type: 'online_marketplace', is_active: true },
    { id: 'src-3', workspace_id: DEMO_WS_ID, name: 'Vinted', type: 'online_marketplace', is_active: true },
    { id: 'src-4', workspace_id: DEMO_WS_ID, name: 'Flohmarkt Mauerpark', type: 'flea_market', is_active: true },
    { id: 'src-5', workspace_id: DEMO_WS_ID, name: 'Haushaltsauflösung', type: 'private_seller', is_active: true },
    { id: 'src-6', workspace_id: DEMO_WS_ID, name: 'B-Stock Retourenhandel', type: 'b2b_wholesaler', is_active: true },
  ];

  readonly defaultSuppliers: Supplier[] = [
    { id: 'sup-1', workspace_id: DEMO_WS_ID, name: 'Privatverkäufer (Kleinanzeigen)', contact_info: 'Berlin & Umland' },
    { id: 'sup-2', workspace_id: DEMO_WS_ID, name: 'Flohmarkt Mauerpark Funde', contact_info: 'Sonntags-Sourcing' },
    { id: 'sup-3', workspace_id: DEMO_WS_ID, name: 'B-Ware & Restposten Nord GmbH', contact_info: 'b2b@restposten-nord.de' },
  ];

  constructor() {
    this.ensureInitialShowcaseData();
  }

  /**
   * Stellt sicher, dass im Demo-Modus ein voller, realistischer Beispieldatensatz
   * (Einkäufe, Mystery Box, Einzelartikel, Verkäufe, Margen, Charts) vorhanden ist.
   */
  private ensureInitialShowcaseData(): void {
    const storage = getStorage();
    if (!storage) return;

    const purchases = storage.getItem(STORAGE_KEY_PURCHASES);
    const items = storage.getItem(STORAGE_KEY_ITEMS);
    if (!purchases || !items || JSON.parse(purchases || '[]').length === 0 || JSON.parse(items || '[]').length === 0) {
      this.populateShowcaseData();
    }
  }

  /**
   * Setzt alle Demo-Daten auf ein vollständiges, realistisches Showcase-Szenario zurück.
   */
  public resetToDemoShowcase(): void {
    this.populateShowcaseData();
  }

  private populateShowcaseData(): void {
    const storage = getStorage();
    if (!storage) return;

    const demoPurchases: Purchase[] = [
      {
        id: 'pur-demo-1',
        workspace_id: DEMO_WS_ID,
        type: 'single',
        title: 'Sony PlayStation 5 Digital Edition (CFI-1116B)',
        purchase_date: '2026-08-08',
        purchase_price: 230.0,
        shipping_cost: 6.99,
        source_id: 'src-1',
        supplier_id: 'sup-1',
        cost_allocation_mode: 'manual',
        items_count: 1,
        total_purchase_cost: 236.99,
        created_at: '2026-08-08T14:30:00.000Z',
      },
      {
        id: 'pur-demo-2',
        workspace_id: DEMO_WS_ID,
        type: 'lot',
        title: 'Retro Gaming & Nintendo Konvolut (Mystery Box)',
        purchase_date: '2026-08-11',
        purchase_price: 150.0,
        shipping_cost: 0.0,
        source_id: 'src-4',
        supplier_id: 'sup-2',
        cost_allocation_mode: 'value_weighted',
        items_count: 4,
        total_purchase_cost: 150.0,
        notes: 'Flohmarktfund: 1x Game Boy Color, 2x GBA Spiele, 1x SNES Controller.',
        created_at: '2026-08-11T11:00:00.000Z',
      },
      {
        id: 'pur-demo-3',
        workspace_id: DEMO_WS_ID,
        type: 'lot',
        title: 'Vintage Streetwear Kleidungspaket (Carhartt, Nike, Levi\'s)',
        purchase_date: '2026-08-13',
        purchase_price: 85.0,
        shipping_cost: 5.49,
        source_id: 'src-3',
        supplier_id: 'sup-1',
        cost_allocation_mode: 'even',
        items_count: 3,
        total_purchase_cost: 90.49,
        created_at: '2026-08-13T16:20:00.000Z',
      },
      {
        id: 'pur-demo-4',
        workspace_id: DEMO_WS_ID,
        type: 'single',
        title: 'Canon EOS M50 Mark II Vlogging Kit',
        purchase_date: '2026-08-15',
        purchase_price: 310.0,
        shipping_cost: 0.0,
        source_id: 'src-2',
        supplier_id: 'sup-1',
        cost_allocation_mode: 'manual',
        items_count: 1,
        total_purchase_cost: 310.0,
        created_at: '2026-08-15T09:15:00.000Z',
      },
    ];

    const demoItems: InventoryItem[] = [
      {
        id: 'item-demo-1',
        workspace_id: DEMO_WS_ID,
        purchase_id: 'pur-demo-1',
        sku: 'RF-PS5-001',
        title: 'Sony PlayStation 5 Digital Edition (825 GB SSD)',
        category: 'Konsolen & Gaming',
        condition: 'very_good',
        status: 'sold',
        allocated_purchase_cost: 236.99,
        expected_value: 380.0,
        total_item_cost: 236.99,
        profit_potential: 143.01,
        created_at: '2026-08-08T14:30:00.000Z',
      },
      {
        id: 'item-demo-2',
        workspace_id: DEMO_WS_ID,
        purchase_id: 'pur-demo-2',
        sku: 'RF-GBC-002',
        title: 'Nintendo Game Boy Color (Lila Transparent)',
        category: 'Konsolen & Gaming',
        condition: 'used',
        status: 'listed',
        allocated_purchase_cost: 55.0,
        expected_value: 95.0,
        total_item_cost: 55.0,
        profit_potential: 40.0,
        created_at: '2026-08-11T11:05:00.000Z',
      },
      {
        id: 'item-demo-3',
        workspace_id: DEMO_WS_ID,
        purchase_id: 'pur-demo-2',
        sku: 'RF-POK-003',
        title: 'Pokémon Smaragd Edition (Game Boy Advance Original)',
        category: 'Videospiele',
        condition: 'very_good',
        status: 'sold',
        allocated_purchase_cost: 45.0,
        expected_value: 110.0,
        total_item_cost: 45.0,
        profit_potential: 65.0,
        created_at: '2026-08-11T11:06:00.000Z',
      },
      {
        id: 'item-demo-4',
        workspace_id: DEMO_WS_ID,
        purchase_id: 'pur-demo-2',
        sku: 'RF-SNES-004',
        title: 'Super Nintendo SNES Original Controller',
        category: 'Gaming Zubehör',
        condition: 'used',
        status: 'ready',
        allocated_purchase_cost: 20.0,
        expected_value: 35.0,
        total_item_cost: 20.0,
        profit_potential: 15.0,
        created_at: '2026-08-11T11:07:00.000Z',
      },
      {
        id: 'item-demo-5',
        workspace_id: DEMO_WS_ID,
        purchase_id: 'pur-demo-2',
        sku: 'RF-GBA-005',
        title: 'Super Mario Advance 4: Super Mario Bros 3 (GBA)',
        category: 'Videospiele',
        condition: 'used',
        status: 'received',
        allocated_purchase_cost: 30.0,
        expected_value: 45.0,
        total_item_cost: 30.0,
        profit_potential: 15.0,
        created_at: '2026-08-11T11:08:00.000Z',
      },
      {
        id: 'item-demo-6',
        workspace_id: DEMO_WS_ID,
        purchase_id: 'pur-demo-3',
        sku: 'RF-CAR-006',
        title: 'Carhartt Detroit Jacket Vintage (Größe L, Braun)',
        category: 'Kleidung & Vintage',
        condition: 'very_good',
        status: 'sold',
        allocated_purchase_cost: 30.16,
        expected_value: 135.0,
        total_item_cost: 30.16,
        profit_potential: 104.84,
        created_at: '2026-08-13T16:22:00.000Z',
      },
      {
        id: 'item-demo-7',
        workspace_id: DEMO_WS_ID,
        purchase_id: 'pur-demo-3',
        sku: 'RF-NIK-007',
        title: 'Nike 90s Vintage Spellout Hoodie (Grau, XL)',
        category: 'Kleidung & Vintage',
        condition: 'very_good',
        status: 'listed',
        allocated_purchase_cost: 30.16,
        expected_value: 79.0,
        total_item_cost: 30.16,
        profit_potential: 48.84,
        created_at: '2026-08-13T16:23:00.000Z',
      },
      {
        id: 'item-demo-8',
        workspace_id: DEMO_WS_ID,
        purchase_id: 'pur-demo-3',
        sku: 'RF-LEV-008',
        title: 'Levi\'s 501 Made in USA Vintage Jeans (W32 L34)',
        category: 'Kleidung & Vintage',
        condition: 'used',
        status: 'ready',
        allocated_purchase_cost: 30.17,
        expected_value: 55.0,
        total_item_cost: 30.17,
        profit_potential: 24.83,
        created_at: '2026-08-13T16:24:00.000Z',
      },
      {
        id: 'item-demo-9',
        workspace_id: DEMO_WS_ID,
        purchase_id: 'pur-demo-4',
        sku: 'RF-CAN-009',
        title: 'Canon EOS M50 Mark II mit EF-M 15-45mm STM',
        category: 'Kamera & Foto',
        condition: 'like_new',
        status: 'listed',
        allocated_purchase_cost: 310.0,
        expected_value: 480.0,
        total_item_cost: 310.0,
        profit_potential: 170.0,
        created_at: '2026-08-15T09:20:00.000Z',
      },
    ];

    const demoSales: Sale[] = [
      {
        id: 'sale-demo-1',
        workspace_id: DEMO_WS_ID,
        inventory_item_id: 'item-demo-1',
        sale_date: '2026-08-14',
        platform: 'ebay',
        sale_price: 379.0,
        platform_fee: 37.90,
        shipping_cost: 6.99,
        packaging_cost: 1.50,
        other_costs: 0.0,
        external_order_id: 'EBAY-994812-DE',
        buyer_notes: 'Zahlung per eBay Managed Payments erhalten. Sendung per DHL Paket versandt.',
        net_profit: 102.61,
        roi: 43.3,
        holding_duration_days: 6,
        created_at: '2026-08-14T18:00:00.000Z',
      },
      {
        id: 'sale-demo-2',
        workspace_id: DEMO_WS_ID,
        inventory_item_id: 'item-demo-3',
        sale_date: '2026-08-16',
        platform: 'kleinanzeigen',
        sale_price: 110.0,
        platform_fee: 0.0,
        shipping_cost: 4.50,
        packaging_cost: 1.0,
        other_costs: 0.0,
        external_order_id: 'KA-88129-BERLIN',
        buyer_notes: 'Sicher bezahlen Funktion Kleinanzeigen genutzt.',
        net_profit: 59.50,
        roi: 132.2,
        holding_duration_days: 5,
        created_at: '2026-08-16T12:30:00.000Z',
      },
      {
        id: 'sale-demo-3',
        workspace_id: DEMO_WS_ID,
        inventory_item_id: 'item-demo-6',
        sale_date: '2026-08-18',
        platform: 'vinted',
        sale_price: 135.0,
        platform_fee: 0.0,
        shipping_cost: 4.99,
        packaging_cost: 1.20,
        other_costs: 0.0,
        external_order_id: 'VINTED-772184-FR',
        buyer_notes: 'Verkauf über Vinted System nach Frankreich.',
        net_profit: 98.65,
        roi: 327.1,
        holding_duration_days: 5,
        created_at: '2026-08-18T15:45:00.000Z',
      },
    ];

    storage.setItem(STORAGE_KEY_PURCHASES, JSON.stringify(demoPurchases));
    storage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(demoItems));
    storage.setItem(STORAGE_KEY_SALES, JSON.stringify(demoSales));
    storage.setItem(STORAGE_KEY_SOURCES, JSON.stringify(this.defaultSources));
    storage.setItem(STORAGE_KEY_SUPPLIERS, JSON.stringify(this.defaultSuppliers));
  }

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
        return workspaceId
          ? list.filter(
              (p) =>
                !p.workspace_id ||
                p.workspace_id === workspaceId ||
                ((p.workspace_id === 'ws-1' || p.workspace_id === 'demo-workspace-1') &&
                  (workspaceId === 'ws-1' || workspaceId === 'demo-workspace-1'))
            )
          : list;
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

  setPurchases(workspaceId: string, purchases: Purchase[]): void {
    try {
      const other = this.getPurchases().filter((p) => p.workspace_id && p.workspace_id !== workspaceId);
      const combined = [...purchases, ...other];
      getStorage()?.setItem(STORAGE_KEY_PURCHASES, JSON.stringify(combined));
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
        return workspaceId
          ? list.filter(
              (i) =>
                !i.workspace_id ||
                i.workspace_id === workspaceId ||
                ((i.workspace_id === 'ws-1' || i.workspace_id === 'demo-workspace-1') &&
                  (workspaceId === 'ws-1' || workspaceId === 'demo-workspace-1'))
            )
          : list;
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

  setItems(workspaceId: string, items: InventoryItem[]): void {
    try {
      const other = this.getItems().filter((i) => i.workspace_id && i.workspace_id !== workspaceId);
      const combined = [...items, ...other];
      getStorage()?.setItem(STORAGE_KEY_ITEMS, JSON.stringify(combined));
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
        return workspaceId
          ? list.filter(
              (s) =>
                !s.workspace_id ||
                s.workspace_id === workspaceId ||
                ((s.workspace_id === 'ws-1' || s.workspace_id === 'demo-workspace-1') &&
                  (workspaceId === 'ws-1' || workspaceId === 'demo-workspace-1'))
            )
          : list;
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

  setSales(workspaceId: string, sales: Sale[]): void {
    try {
      const other = this.getSales().filter((s) => s.workspace_id && s.workspace_id !== workspaceId);
      const combined = [...sales, ...other];
      getStorage()?.setItem(STORAGE_KEY_SALES, JSON.stringify(combined));
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
        return workspaceId ? list.filter((s) => !s.workspace_id || s.workspace_id === workspaceId) : list;
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
        all.unshift(source);
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

  setSources(workspaceId: string, sources: Source[]): void {
    try {
      const other = this.getSources().filter((s) => s.workspace_id && s.workspace_id !== workspaceId);
      const combined = [...sources, ...other];
      getStorage()?.setItem(STORAGE_KEY_SOURCES, JSON.stringify(combined));
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
    return this.defaultSuppliers;
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

  deleteSupplier(id: string): void {
    try {
      const all = this.getSuppliers().filter((s) => s.id !== id);
      getStorage()?.setItem(STORAGE_KEY_SUPPLIERS, JSON.stringify(all));
    } catch {}
  }

  setSuppliers(workspaceId: string, suppliers: Supplier[]): void {
    try {
      const other = this.getSuppliers().filter((s) => s.workspace_id && s.workspace_id !== workspaceId);
      const combined = [...suppliers, ...other];
      getStorage()?.setItem(STORAGE_KEY_SUPPLIERS, JSON.stringify(combined));
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
