import { Injectable, signal } from '@angular/core';
import {
  Workspace,
  Source,
  Supplier,
  Purchase,
  InventoryItem,
  ItemCondition,
  Sale,
  ActivityLog,
  ItemCost,
  ItemMedia,
  CatalogProductMedia,
  CatalogProduct,
  PurchaseLine,
  StockLot,
  StockMovement,
  SaleLine,
  SaleLineLotAllocation,
  TaxCostAllocation,
} from '../models/flipbase.models';
import type { ReceivePurchaseLineInput } from './stock.service';
import { createLocalDemoId } from '../utils/client-identity';
import { isSellableInventoryItem } from '../models/inventory-sellability';
import type { BusinessEvent, PurchaseCostingResult } from '../models/purchase-costing.models';
import type {
  PackageContentInput,
  PackageCaptureResult,
} from '../../features/purchases/services/purchase-package.service';
import type { DemoRecordComment } from '../models/record-comment.models';
import { buildProductCostPlan } from '../utils/product-cost-plan';
import { Brand, CategoryBrandRecord, brandNameKey } from '../models/product-category.models';
import { DEMO_PRODUCT_CATEGORIES } from './demo-product-categories';

const DEMO_WS_ID = 'ws-1';

const STORAGE_KEY_PURCHASES = 'flipbase_local_purchases';
const STORAGE_KEY_ITEMS = 'flipbase_local_inventory';
const STORAGE_KEY_SALES = 'flipbase_local_sales';
const STORAGE_KEY_SOURCES = 'flipbase_local_sources';
const STORAGE_KEY_SUPPLIERS = 'flipbase_local_suppliers';
const STORAGE_KEY_ITEM_COSTS = 'flipbase_local_item_costs';
const STORAGE_KEY_ACTIVITY_LOGS = 'flipbase_local_activity_logs';
const STORAGE_KEY_MEDIA = 'flipbase_local_media';
const STORAGE_KEY_PRODUCT_MEDIA = 'flipbase_local_catalog_product_media';
const STORAGE_KEY_CATALOG_PRODUCTS = 'flipbase_local_catalog_products';
const STORAGE_KEY_PURCHASE_LINES = 'flipbase_local_purchase_lines';
const STORAGE_KEY_STOCK_LOTS = 'flipbase_local_stock_lots';
const STORAGE_KEY_STOCK_MOVEMENTS = 'flipbase_local_stock_movements';
const STORAGE_KEY_PRODUCT_RECEIPTS = 'flipbase_local_product_receipts';
const STORAGE_KEY_RECEIPT_JOURNAL = 'flipbase_local_individual_receipt_journal';
const STORAGE_KEY_RECORD_COMMENTS = 'flipbase_local_record_comments';
const STORAGE_KEY_PACKAGE_CAPTURES = 'flipbase_local_package_captures';
const STORAGE_KEY_BRANDS = 'flipbase_local_brands';

interface DemoBrandRecord {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
}

interface PackageCaptureRequest {
  readonly id: string;
  readonly workspace_id: string;
  readonly line_id: string;
  readonly input: string;
  readonly result: PackageCaptureResult;
  readonly event: BusinessEvent;
}

interface DemoSaleLineLotAllocation extends SaleLineLotAllocation {
  tax_purchase_cost?: number | null;
  tax_cost_allocations?: TaxCostAllocation[] | null;
  active_tax_unit_costs?: number[] | null;
  active_unit_costs?: number[] | null;
}

/** Gleiche Stückpreise werden in der Reihenfolge ihres ersten Auftretens zusammengefasst. */
function groupTaxUnitCosts(costs: readonly number[] | null): TaxCostAllocation[] | null {
  if (costs === null) return null;
  const groups = new Map<number, number>();
  for (const cost of costs) {
    const unitCents = Math.round(cost * 100);
    groups.set(unitCents, (groups.get(unitCents) ?? 0) + 1);
  }
  return [...groups].map(([unitCents, quantity]) => ({
    quantity,
    tax_purchase_cost: (unitCents * quantity) / 100,
  }));
}

function totalTaxUnitCosts(costs: readonly number[] | null): number | null {
  return costs === null ? null : costs.reduce((sum, cost) => sum + Math.round(cost * 100), 0) / 100;
}

function invalidPackageLine(line: PurchaseLine): boolean {
  return (
    Boolean(line.is_package) &&
    (line.is_package !== true ||
      line.line_kind !== 'individual' ||
      line.catalog_product_id !== null ||
      line.ordered_quantity !== 1 ||
      (line.price_mode ?? 'priced') !== 'priced' ||
      line.unit_purchase_price === null ||
      !Number.isFinite(line.unit_purchase_price) ||
      line.unit_purchase_price < 0 ||
      line.line_total !== line.unit_purchase_price ||
      line.unit_purchase_price !== Number(line.unit_purchase_price.toFixed(2)))
  );
}

interface AtomicStorageChange {
  readonly key: string;
  readonly previous: string | null;
  readonly value: string;
}

interface ProductReceiptRequest {
  readonly id: string;
  readonly workspace_id: string;
  readonly purchase_id: string;
  readonly input: string;
  readonly purchaseLines: PurchaseLine[];
  readonly stockLots: StockLot[];
}

interface ReceiptJournal {
  readonly phase: 'prepared' | 'committed';
  readonly changes: readonly Pick<AtomicStorageChange, 'key' | 'previous'>[];
}

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
  /**
   * Schaltet den lokalen Zwischenspeicher scharf.
   *
   * Seit der Umstellung auf Supabase ist die Datenbank die alleinige Quelle
   * der Wahrheit. Dieser Speicher hält nur noch die Daten des Demo-Modus.
   * Alle Schreibmethoden prüfen dieses Signal und tun bei einem angemeldeten
   * Nutzer nichts – sonst würde sich im Browser eine zweite, veraltende Kopie
   * der Geschäftsdaten ansammeln.
   */
  /**
   * Ob der Demo-Modus laeuft.
   *
   * Der lokale Spiegel ist ausschliesslich dafuer da: Alle Lese- und
   * Schreibmethoden steigen ausserhalb des Demo-Modus sofort aus. Angemeldet
   * ist die Datenbank die Quelle, und die Anzeige haengt an den Signalen der
   * Fachdienste. Ohne diese Sperre wurden Anzeigen aus einem Speicher
   * berechnet, der angemeldet leer bleibt - so entstand z. B. die Kachel mit
   * "0 Artikel", obwohl gerade ein Artikel erfasst worden war.
   */
  readonly isDemoMode = signal<boolean>(false);

  getRecordComments(
    workspaceId: string,
    entityType: DemoRecordComment['entityType'],
    entityId: string,
  ): DemoRecordComment[] {
    return this.getWorkspaceRecords<DemoRecordComment>(
      STORAGE_KEY_RECORD_COMMENTS,
      workspaceId,
    ).filter((comment) => comment.entityType === entityType && comment.entityId === entityId);
  }

  addRecordComment(comment: DemoRecordComment): void {
    if (!this.isDemoMode()) throw new Error('Lokale Kommentare sind nur im Demo-Modus verfügbar.');
    const error = this.saveRecordsAtomically([
      {
        key: STORAGE_KEY_RECORD_COMMENTS,
        records: [
          ...this.getWorkspaceRecords<DemoRecordComment>(STORAGE_KEY_RECORD_COMMENTS),
          comment,
        ],
      },
    ]);
    if (error)
      throw new Error(
        'Der Kommentar konnte lokal nicht gespeichert werden. Dein Text bleibt erhalten.',
      );
  }

  readonly demoWorkspace: Workspace = {
    id: DEMO_WS_ID,
    name: 'Mein Reselling Business (Demo)',
    currency: 'EUR',
    min_roi_percent: 30,
    min_profit_amount: 15,
    created_at: '2026-08-01T10:00:00.000Z',
  };

  readonly defaultSources: Source[] = [
    {
      id: 'src-1',
      workspace_id: DEMO_WS_ID,
      name: 'Kleinanzeigen',
      type: 'online_marketplace',
      is_active: true,
    },
    {
      id: 'src-2',
      workspace_id: DEMO_WS_ID,
      name: 'eBay',
      type: 'online_marketplace',
      is_active: true,
    },
    {
      id: 'src-3',
      workspace_id: DEMO_WS_ID,
      name: 'Vinted',
      type: 'online_marketplace',
      is_active: true,
    },
    {
      id: 'src-4',
      workspace_id: DEMO_WS_ID,
      name: 'Flohmarkt Mauerpark',
      type: 'flea_market',
      is_active: true,
    },
    {
      id: 'src-5',
      workspace_id: DEMO_WS_ID,
      name: 'Haushaltsauflösung',
      type: 'private_seller',
      is_active: true,
    },
    {
      id: 'src-6',
      workspace_id: DEMO_WS_ID,
      name: 'B-Stock Retourenhandel',
      type: 'b2b_wholesaler',
      is_active: true,
    },
  ];

  readonly defaultSuppliers: Supplier[] = [
    {
      id: 'sup-1',
      workspace_id: DEMO_WS_ID,
      name: 'Privatverkäufer (Kleinanzeigen)',
      contact_info: 'Berlin & Umland',
    },
    {
      id: 'sup-2',
      workspace_id: DEMO_WS_ID,
      name: 'Flohmarkt Mauerpark Funde',
      contact_info: 'Sonntags-Sourcing',
    },
    {
      id: 'sup-3',
      workspace_id: DEMO_WS_ID,
      name: 'B-Ware & Restposten Nord GmbH',
      contact_info: 'b2b@restposten-nord.de',
    },
  ];

  // Bewusst kein Konstruktor: Beispieldaten duerfen NUR im Demo-Modus entstehen.
  //
  // Zuvor lief das Befuellen ungeschuetzt im Konstruktor. Da dieser Dienst von
  // elf Services injiziert wird, bekam damit jeder Nutzer - auch ein echt
  // angemeldeter mit leerem Bestand - vier erfundene Einkaeufe und neun Artikel
  // in den Browser geschrieben. Die landeten anschliessend in jeder Sicherung.

  /**
   * Legt Beispieldaten an, falls noch keine vorhanden sind.
   *
   * Darf ausschliesslich im Demo-Modus aufgerufen werden. Bereits vorhandene
   * Daten bleiben unangetastet, damit im Demo-Modus erfasste Eingaben eines
   * Nutzers nicht bei jedem Start verloren gehen.
   */
  ensureShowcaseData(): void {
    const storage = getStorage();
    if (!storage) return;

    const einkaeufe = this.sicherLesen(STORAGE_KEY_PURCHASES);
    const artikel = this.sicherLesen(STORAGE_KEY_ITEMS);
    if (einkaeufe.length === 0 && artikel.length === 0) {
      this.populateShowcaseData();
    }
  }

  /**
   * Setzt die Demo-Daten auf das vollstaendige Beispielszenario zurueck und
   * ueberschreibt dabei den vorhandenen lokalen Bestand.
   *
   * Nur fuer die ausdrueckliche Aktion "Beispieldaten neu laden" im
   * Demo-Banner gedacht - niemals automatisch aufrufen.
   */
  resetToDemoShowcase(): void {
    this.populateShowcaseData();
  }

  private sicherLesen(schluessel: string): unknown[] {
    try {
      const roh = this.readStorageValue(schluessel);
      const wert: unknown = roh ? JSON.parse(roh) : [];
      return Array.isArray(wert) ? wert : [];
    } catch {
      return [];
    }
  }

  private populateShowcaseData(): void {
    const storage = getStorage();
    if (!storage) return;

    const demoPurchases: Purchase[] = [
      {
        id: 'pur-demo-1',
        entry_status: 'finalized',
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
        entry_status: 'finalized',
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
        entry_status: 'finalized',
        workspace_id: DEMO_WS_ID,
        type: 'lot',
        title: "Vintage Streetwear Kleidungspaket (Carhartt, Nike, Levi's)",
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
        entry_status: 'finalized',
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
      {
        id: 'pur-demo-5',
        entry_status: 'finalized',
        workspace_id: DEMO_WS_ID,
        type: 'lot',
        title: '5× USB-C Ladegerät 30 W Händlerposten',
        purchase_date: '2026-08-17',
        purchase_price: 40.0,
        shipping_cost: 0.0,
        source_id: 'src-6',
        supplier_id: 'sup-3',
        cost_allocation_mode: 'manual',
        receiving_status: 'received',
        items_count: 5,
        total_purchase_cost: 40.0,
        created_at: '2026-08-17T09:15:00.000Z',
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
        sale_state: 'no_active_sale',
        active_sale_count: 0,
        active_sale_id: null,
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
        title: "Levi's 501 Made in USA Vintage Jeans (W32 L34)",
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
        inventory_item: demoItems[0],
        sale_date: '2026-08-14',
        platform: 'ebay',
        sale_price: 379.0,
        platform_fee: 37.9,
        shipping_cost: 6.99,
        packaging_cost: 1.5,
        other_costs: 0.0,
        external_order_id: 'EBAY-994812-DE',
        buyer_notes: 'Zahlung per eBay Managed Payments erhalten. Sendung per DHL Paket versandt.',
        net_profit: 95.62,
        roi: 33.74,
        holding_duration_days: 6,
        created_at: '2026-08-14T18:00:00.000Z',
      },
      {
        id: 'sale-demo-2',
        workspace_id: DEMO_WS_ID,
        inventory_item_id: 'item-demo-3',
        inventory_item: demoItems[2],
        sale_date: '2026-08-16',
        platform: 'kleinanzeigen',
        sale_price: 110.0,
        platform_fee: 0.0,
        shipping_cost: 4.5,
        packaging_cost: 1.0,
        other_costs: 0.0,
        external_order_id: 'KA-88129-BERLIN',
        buyer_notes: 'Sicher bezahlen Funktion Kleinanzeigen genutzt.',
        net_profit: 59.5,
        roi: 117.82,
        holding_duration_days: 5,
        created_at: '2026-08-16T12:30:00.000Z',
      },
      {
        id: 'sale-demo-3',
        workspace_id: DEMO_WS_ID,
        inventory_item_id: 'item-demo-6',
        inventory_item: demoItems[5],
        sale_date: '2026-08-18',
        platform: 'vinted',
        sale_price: 135.0,
        platform_fee: 0.0,
        shipping_cost: 4.99,
        packaging_cost: 1.2,
        other_costs: 0.0,
        external_order_id: 'VINTED-772184-FR',
        buyer_notes: 'Verkauf über Vinted System nach Frankreich.',
        net_profit: 98.65,
        roi: 271.39,
        holding_duration_days: 5,
        created_at: '2026-08-18T15:45:00.000Z',
      },
    ];

    const demoCatalogProducts: CatalogProduct[] = [
      {
        id: 'catalog-demo-usb-c-charger',
        workspace_id: DEMO_WS_ID,
        title: 'USB-C Ladegerät 30 W',
        brand: 'Anker',
        category: 'Elektronik-Zubehör',
        tracking_mode: 'quantity',
        is_public_store: true,
        listing_price: 24.9,
        created_at: '2026-08-17T09:20:00.000Z',
      },
    ];
    const demoPurchaseLines: PurchaseLine[] = [
      {
        id: 'purchase-line-demo-usb-c-charger',
        workspace_id: DEMO_WS_ID,
        purchase_id: 'pur-demo-5',
        catalog_product_id: 'catalog-demo-usb-c-charger',
        title_snapshot: 'USB-C Ladegerät 30 W',
        line_kind: 'quantity',
        ordered_quantity: 5,
        received_quantity: 5,
        unit_purchase_price: 8,
        line_total: 40,
        allocated_additional_cost: 0,
        created_at: '2026-08-17T09:20:00.000Z',
      },
    ];
    const demoStockLots: StockLot[] = [
      {
        id: 'stock-lot-demo-usb-c-charger',
        workspace_id: DEMO_WS_ID,
        purchase_id: 'pur-demo-5',
        purchase_line_id: 'purchase-line-demo-usb-c-charger',
        catalog_product_id: 'catalog-demo-usb-c-charger',
        received_quantity: 5,
        remaining_quantity: 5,
        unit_cost: 8,
        received_at: '2026-08-17T09:30:00.000Z',
        created_at: '2026-08-17T09:30:00.000Z',
      },
    ];
    const demoStockMovements: StockMovement[] = [
      {
        id: 'stock-movement-demo-usb-c-charger',
        workspace_id: DEMO_WS_ID,
        stock_lot_id: 'stock-lot-demo-usb-c-charger',
        direction: 'in',
        quantity: 5,
        reason: 'receipt',
        created_at: '2026-08-17T09:30:00.000Z',
      },
    ];

    storage.setItem(STORAGE_KEY_PURCHASES, JSON.stringify(demoPurchases));
    storage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(demoItems));
    storage.setItem(STORAGE_KEY_SALES, JSON.stringify(demoSales));
    storage.setItem(STORAGE_KEY_SOURCES, JSON.stringify(this.defaultSources));
    storage.setItem(STORAGE_KEY_SUPPLIERS, JSON.stringify(this.defaultSuppliers));
    storage.setItem(STORAGE_KEY_CATALOG_PRODUCTS, JSON.stringify(demoCatalogProducts));
    storage.setItem(STORAGE_KEY_PURCHASE_LINES, JSON.stringify(demoPurchaseLines));
    storage.setItem(STORAGE_KEY_STOCK_LOTS, JSON.stringify(demoStockLots));
    storage.setItem(STORAGE_KEY_STOCK_MOVEMENTS, JSON.stringify(demoStockMovements));
    storage.setItem(STORAGE_KEY_PACKAGE_CAPTURES, '[]');
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

  // --- Marken und Kategorien (nur Demo-Modus) ---
  getBrands(workspaceId: string): Brand[] {
    return this.getWorkspaceRecords<DemoBrandRecord>(STORAGE_KEY_BRANDS, workspaceId)
      .map((record) => ({ id: record.id, workspaceId: record.workspace_id, name: record.name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'de-DE'));
  }

  /** Liefert die Demo-Marke gleicher Vergleichsform oder legt sie an. */
  ensureBrand(workspaceId: string, name: string): Brand | null {
    const trimmed = name.trim().slice(0, 120).trim();
    if (!trimmed || !this.isDemoMode()) return null;
    const existing = this.getBrands(workspaceId).find(
      (brand) => brandNameKey(brand.name) === brandNameKey(trimmed),
    );
    if (existing) return existing;
    const record: DemoBrandRecord = {
      id: createLocalDemoId('brand'),
      workspace_id: workspaceId,
      name: trimmed,
    };
    this.saveWorkspaceRecord(STORAGE_KEY_BRANDS, record);
    return { id: record.id, workspaceId, name: trimmed };
  }

  /**
   * Bildet public.sync_category_brand_text() nach: Die Kennung hat Vorrang, Markentext
   * zählt nur beim Anlegen ohne Kennung oder bei geändertem Text mit gleicher Kennung.
   * Kategorietext folgt immer der Kennung.
   */
  applyCategoryBrandText<T extends CategoryBrandRecord>(
    record: T,
    previous?: CategoryBrandRecord,
  ): T {
    let brandId = record.brand_id ?? null;
    const resolveText =
      previous === undefined
        ? brandId === null
        : brandId === (previous.brand_id ?? null) &&
          (record.brand ?? null) !== (previous.brand ?? null);
    if (resolveText) {
      brandId = record.brand?.trim()
        ? (this.ensureBrand(record.workspace_id, record.brand)?.id ?? null)
        : null;
    }
    const brand = brandId
      ? (this.getBrands(record.workspace_id).find((entry) => entry.id === brandId)?.name ?? null)
      : null;
    const categoryId = record.category_id ?? null;
    const category = categoryId
      ? (DEMO_PRODUCT_CATEGORIES.find((entry) => entry.id === categoryId)?.fullName ?? null)
      : null;
    return { ...record, brand_id: brandId, brand, category_id: categoryId, category };
  }

  // --- Mengenartikel, Einkaufspositionen und Lose (nur Demo-Modus) ---
  getCatalogProducts(workspaceId?: string): CatalogProduct[] {
    return this.getWorkspaceRecords<CatalogProduct>(STORAGE_KEY_CATALOG_PRODUCTS, workspaceId);
  }

  saveCatalogProduct(product: CatalogProduct): void {
    this.saveWorkspaceRecord(STORAGE_KEY_CATALOG_PRODUCTS, product);
  }

  getPurchaseLines(workspaceId?: string): PurchaseLine[] {
    return this.getWorkspaceRecords<PurchaseLine>(STORAGE_KEY_PURCHASE_LINES, workspaceId);
  }

  savePurchaseLine(line: PurchaseLine): void {
    if (invalidPackageLine(line))
      throw new Error(
        'Ein Paket benötigt Menge eins und einen bekannten, übereinstimmenden Paketpreis.',
      );
    this.saveWorkspaceRecord(STORAGE_KEY_PURCHASE_LINES, line);
  }

  /**
   * Speichert einen Demo-Einkauf gemeinsam mit seiner vollständigen Positionsliste.
   * Der Journal-gestützte Schreibvorgang stellt bei Speicherfehlern den
   * vorherigen Zustand wieder her, damit kein positionsloser Einkauf entsteht.
   */
  savePurchaseWithLines(purchase: Purchase, lines: readonly PurchaseLine[]): Error | null {
    if (!this.isDemoMode()) return new Error('Der Demo-Modus ist nicht aktiv.');
    if (lines.some(invalidPackageLine))
      return new Error(
        'Ein Paket benötigt Menge eins und einen bekannten, übereinstimmenden Paketpreis.',
      );

    const purchases = this.upsertRecord(this.getPurchases(), purchase);
    let purchaseLines = this.getPurchaseLines().filter(
      (line) => line.purchase_id !== purchase.id || line.workspace_id !== purchase.workspace_id,
    );
    for (const line of lines) purchaseLines = this.upsertRecord(purchaseLines, line);

    return this.saveRecordsAtomically([
      { key: STORAGE_KEY_PURCHASES, records: purchases },
      { key: STORAGE_KEY_PURCHASE_LINES, records: purchaseLines },
    ]);
  }

  getStockLots(workspaceId?: string): StockLot[] {
    return this.getWorkspaceRecords<StockLot>(STORAGE_KEY_STOCK_LOTS, workspaceId);
  }

  getStockMovements(workspaceId?: string): StockMovement[] {
    return this.getWorkspaceRecords<StockMovement>(STORAGE_KEY_STOCK_MOVEMENTS, workspaceId);
  }

  receivePurchaseLines(
    workspaceId: string,
    purchaseId: string,
    inputs: readonly ReceivePurchaseLineInput[],
    requestId = createLocalDemoId('receipt'),
  ): { purchaseLines: PurchaseLine[]; stockLots: StockLot[]; error: Error | null } {
    const failure = (message: string) => ({
      purchaseLines: [],
      stockLots: [],
      error: new Error(message),
    });
    if (!this.isDemoMode()) return failure('Der Demo-Modus ist nicht aktiv.');
    const requests = this.getWorkspaceRecords<ProductReceiptRequest>(STORAGE_KEY_PRODUCT_RECEIPTS);
    const inputJson = JSON.stringify(inputs);
    const previous = requests.find(
      (request) => request.workspace_id === workspaceId && request.id === requestId,
    );
    if (previous) {
      return previous.purchase_id === purchaseId && previous.input === inputJson
        ? { purchaseLines: previous.purchaseLines, stockLots: previous.stockLots, error: null }
        : failure('Die Request-ID wurde bereits für einen anderen Wareneingang verwendet.');
    }
    const purchase = this.getPurchases(workspaceId).find((entry) => entry.id === purchaseId);
    if (!purchase || purchase.entry_status === 'finalized')
      return failure('Der Einkauf kann keinen weiteren Wareneingang erhalten.');
    if (
      inputs.length === 0 ||
      inputs.length > 1000 ||
      inputs.reduce((sum, input) => sum + input.receivedQuantity, 0) > 100000
    ) {
      return failure('Die Wareneingangsdaten sind ungültig.');
    }
    const allLines = this.getPurchaseLines();
    const updatedLines: PurchaseLine[] = [];
    const newLots: StockLot[] = [];

    for (const input of inputs) {
      const line = allLines.find(
        (entry) =>
          entry.id === input.purchaseLineId &&
          entry.workspace_id === workspaceId &&
          entry.purchase_id === purchaseId,
      );
      if (!line || line.is_package || line.line_kind !== 'quantity' || !line.catalog_product_id) {
        return {
          purchaseLines: [],
          stockLots: [],
          error: new Error('Die Einkaufsposition wurde nicht gefunden.'),
        };
      }
      if (
        !this.getCatalogProducts(workspaceId).some(
          (product) => product.id === line.catalog_product_id,
        ) ||
        (input.receivedAt !== undefined && !Number.isFinite(Date.parse(input.receivedAt)))
      ) {
        return failure('Produktreferenz oder Empfangszeitpunkt ist ungültig.');
      }
      if (
        !Number.isInteger(input.receivedQuantity) ||
        input.receivedQuantity <= 0 ||
        line.received_quantity + input.receivedQuantity > line.ordered_quantity
      ) {
        return {
          purchaseLines: [],
          stockLots: [],
          error: new Error('Die empfangene Menge überschreitet die bestellte Menge.'),
        };
      }
      const updated = {
        ...line,
        received_quantity: line.received_quantity + input.receivedQuantity,
      };
      const lot: StockLot = {
        id: this.newId('lot'),
        workspace_id: workspaceId,
        purchase_id: purchaseId,
        purchase_line_id: line.id,
        catalog_product_id: line.catalog_product_id,
        received_quantity: input.receivedQuantity,
        remaining_quantity: input.receivedQuantity,
        unit_cost: null,
        received_at: input.receivedAt ?? new Date().toISOString(),
      };
      const index = allLines.findIndex((entry) => entry.id === line.id);
      allLines[index] = updated;
      updatedLines.push(updated);
      newLots.push(lot);
    }

    const movements = [
      ...this.getStockMovements(),
      ...newLots.map((lot): StockMovement => ({
        id: this.newId('movement'),
        workspace_id: workspaceId,
        stock_lot_id: lot.id,
        direction: 'in',
        quantity: lot.received_quantity,
        reason: 'receipt',
        created_at: lot.received_at,
      })),
    ];
    const purchaseLines = allLines.filter(
      (line) => line.workspace_id === workspaceId && line.purchase_id === purchaseId,
    );
    const updatedPurchase: Purchase = {
      ...purchase,
      receiving_status: purchaseLines.every(
        (line) => line.received_quantity === line.ordered_quantity,
      )
        ? 'received'
        : 'partially_received',
    };
    const persistenceError = this.saveRecordsAtomically([
      {
        key: STORAGE_KEY_PURCHASES,
        records: this.upsertRecord(this.getPurchases(), updatedPurchase),
      },
      { key: STORAGE_KEY_PURCHASE_LINES, records: allLines },
      { key: STORAGE_KEY_STOCK_LOTS, records: [...this.getStockLots(), ...newLots] },
      { key: STORAGE_KEY_STOCK_MOVEMENTS, records: movements },
      {
        key: STORAGE_KEY_PRODUCT_RECEIPTS,
        records: [
          ...requests,
          {
            id: requestId,
            workspace_id: workspaceId,
            purchase_id: purchaseId,
            input: inputJson,
            purchaseLines: updatedLines,
            stockLots: newLots,
          },
        ],
      },
    ]);
    if (persistenceError) return { purchaseLines: [], stockLots: [], error: persistenceError };
    return { purchaseLines: updatedLines, stockLots: newLots, error: null };
  }

  getPackageCaptureEvents(workspaceId: string, purchaseId: string): BusinessEvent[] {
    return this.getWorkspaceRecords<PackageCaptureRequest>(
      STORAGE_KEY_PACKAGE_CAPTURES,
      workspaceId,
    )
      .filter((request) => request.event.entityId === purchaseId)
      .map((request) => request.event);
  }

  capturePurchasePackageContents(
    workspaceId: string,
    lineId: string,
    inputs: readonly PackageContentInput[],
    requestId: string,
  ): { data: PackageCaptureResult | null; error: Error | null } {
    const fail = (message: string) => ({ data: null, error: new Error(message) });
    if (!this.isDemoMode() || !workspaceId || !lineId || !requestId)
      return fail('Die Paketerfassung ist nicht verfügbar.');
    const conditions: readonly ItemCondition[] = [
      'new',
      'like_new',
      'very_good',
      'used',
      'heavily_used',
      'defective',
    ];
    if (
      !Array.isArray(inputs) ||
      inputs.length === 0 ||
      inputs.length > 100 ||
      inputs.some(
        (input) =>
          !input ||
          typeof input.title !== 'string' ||
          !input.title.trim() ||
          input.title.length > 300 ||
          !conditions.includes(input.condition) ||
          [input.brand, input.model, input.description].some(
            (value) => value != null && typeof value !== 'string',
          ) ||
          (input.description?.length ?? 0) > 5000 ||
          (input.expected_value != null &&
            (typeof input.expected_value !== 'number' ||
              !Number.isFinite(input.expected_value) ||
              input.expected_value < 0 ||
              input.expected_value !== Number(input.expected_value.toFixed(2)))),
      )
    )
      return fail(
        'Jeder Paketinhalt benötigt einen Titel, einen gültigen Zustand und einen gültigen optionalen Wert.',
      );
    const normalized = inputs.map((input) => ({
      title: input.title.trim(),
      condition: input.condition,
      brand: input.brand?.trim() || null,
      model: input.model?.trim() || null,
      description: input.description?.trim() || null,
      expected_value: input.expected_value ?? null,
    }));
    const input = JSON.stringify(normalized);
    const requests = this.getWorkspaceRecords<PackageCaptureRequest>(STORAGE_KEY_PACKAGE_CAPTURES);
    const previous = requests.find(
      (request) => request.id === requestId && request.workspace_id === workspaceId,
    );
    if (previous)
      return previous.line_id === lineId && previous.input === input
        ? { data: previous.result, error: null }
        : fail('Diese Anfrage wurde bereits mit anderem Inhalt verwendet.');
    const lines = this.getPurchaseLines();
    const line = lines.find((entry) => entry.id === lineId && entry.workspace_id === workspaceId);
    const purchase = this.getPurchases(workspaceId).find((entry) => entry.id === line?.purchase_id);
    if (!line?.is_package || invalidPackageLine(line) || !purchase)
      return fail('Die Paketposition wurde nicht gefunden oder ist ungültig.');
    if (purchase.shipment_status !== 'arrived')
      return fail('Der Einkauf muss vor der Paketerfassung angekommen sein.');
    const createdAt = new Date().toISOString();
    const inventoryItems: InventoryItem[] = normalized.map((entry) =>
      this.applyCategoryBrandText<InventoryItem>({
        ...entry,
        id: this.newId('item'),
        workspace_id: workspaceId,
        purchase_id: purchase.id,
        purchase_line_id: null,
        source_package_line_id: lineId,
        is_public_store: false,
        status: purchase.entry_status === 'finalized' ? 'ready' : 'received',
        allocated_purchase_cost: null,
        tax_purchase_cost: null,
        sale_state: 'no_active_sale',
        active_sale_count: 0,
        active_sale_id: null,
        created_at: createdAt,
      }),
    );
    const updatedLine = { ...line, received_quantity: 1 };
    const updatedLines = lines.map((entry) =>
      entry.id === lineId && entry.workspace_id === workspaceId ? updatedLine : entry,
    );
    const purchaseLines = updatedLines.filter(
      (entry) => entry.purchase_id === purchase.id && entry.workspace_id === workspaceId,
    );
    const updatedItems = [...this.getItems(), ...inventoryItems];
    const updatedPurchase: Purchase = {
      ...purchase,
      purchase_lines: purchaseLines,
      receiving_status: purchaseLines.every(
        (entry) => entry.received_quantity >= entry.ordered_quantity,
      )
        ? 'received'
        : 'partially_received',
      items_count:
        purchaseLines.reduce(
          (sum, entry) => sum + (entry.is_package ? 0 : entry.ordered_quantity),
          0,
        ) +
        updatedItems.filter(
          (entry) =>
            entry.workspace_id === workspaceId &&
            entry.purchase_id === purchase.id &&
            (entry.source_package_line_id ||
              !purchaseLines.some((position) => position.id === entry.purchase_line_id)),
        ).length,
    };
    const result: PackageCaptureResult = {
      inventory_items: inventoryItems,
      purchase_line: updatedLine,
    };
    const event: BusinessEvent = {
      id: this.newId('event'),
      workspaceId,
      entityType: 'purchase',
      entityId: purchase.id,
      eventType: 'purchase_package_contents_captured',
      actorId: null,
      reason: null,
      changes: {
        source_package_line_id: lineId,
        request_id: requestId,
        inventory_items: inventoryItems,
      },
      correlationId: requestId,
      createdAt,
    };
    const error = this.saveRecordsAtomically([
      { key: STORAGE_KEY_ITEMS, records: updatedItems },
      { key: STORAGE_KEY_PURCHASE_LINES, records: updatedLines },
      {
        key: STORAGE_KEY_PURCHASES,
        records: this.upsertRecord(this.getPurchases(), updatedPurchase),
      },
      {
        key: STORAGE_KEY_PACKAGE_CAPTURES,
        records: [
          ...requests,
          {
            id: requestId,
            workspace_id: workspaceId,
            line_id: lineId,
            input,
            result,
            event,
          } satisfies PackageCaptureRequest,
        ],
      },
    ]);
    return error ? { data: null, error } : { data: result, error: null };
  }

  receiveIndividualPurchaseLine(
    workspaceId: string,
    purchaseId: string,
    purchaseLineId: string,
    input: { title: string; condition: ItemCondition },
  ): {
    purchaseLine: PurchaseLine | null;
    inventoryItem: InventoryItem | null;
    purchase: Purchase | null;
    error: Error | null;
  } {
    const lines = this.getPurchaseLines();
    const index = lines.findIndex(
      (line) =>
        line.id === purchaseLineId &&
        line.workspace_id === workspaceId &&
        line.purchase_id === purchaseId &&
        line.line_kind === 'individual' &&
        !line.is_package &&
        line.received_quantity < line.ordered_quantity,
    );
    const purchase = this.getPurchases(workspaceId).find((entry) => entry.id === purchaseId);
    if (index < 0 || !purchase) {
      return {
        purchaseLine: null,
        inventoryItem: null,
        purchase: null,
        error: new Error('Die Einzelartikelposition ist nicht offen.'),
      };
    }

    const line = lines[index];
    const validConditions = new Set<ItemCondition>([
      'new',
      'like_new',
      'very_good',
      'used',
      'heavily_used',
      'defective',
    ]);
    const condition =
      line.condition_snapshot && validConditions.has(line.condition_snapshot as ItemCondition)
        ? (line.condition_snapshot as ItemCondition)
        : 'used';
    const purchaseLine = { ...line, received_quantity: line.received_quantity + 1 };
    const inventoryItem: InventoryItem = {
      id: this.newId('item'),
      workspace_id: workspaceId,
      purchase_id: purchaseId,
      purchase_line_id: purchaseLineId,
      title: input.title.trim(),
      condition,
      status: 'received',
      allocated_purchase_cost: 0,
      expected_value: line.estimated_market_value ?? null,
      created_at: new Date().toISOString(),
    };
    lines[index] = purchaseLine;
    const hasOpen = lines.some(
      (line) =>
        line.workspace_id === workspaceId &&
        line.purchase_id === purchaseId &&
        line.received_quantity < line.ordered_quantity,
    );
    const hasReceived = lines.some(
      (line) =>
        line.workspace_id === workspaceId &&
        line.purchase_id === purchaseId &&
        line.received_quantity > 0,
    );
    const updatedPurchase: Purchase = {
      ...purchase,
      receiving_status: hasOpen ? (hasReceived ? 'partially_received' : 'ordered') : 'received',
    };
    const allItems = this.getItems();
    const itemIndex = allItems.findIndex((item) => item.id === inventoryItem.id);
    if (itemIndex === -1) allItems.unshift(inventoryItem);
    else allItems[itemIndex] = inventoryItem;
    const allPurchases = this.getPurchases();
    const purchaseIndex = allPurchases.findIndex((entry) => entry.id === updatedPurchase.id);
    if (purchaseIndex === -1) allPurchases.unshift(updatedPurchase);
    else allPurchases[purchaseIndex] = updatedPurchase;
    const persistenceError = this.saveRecordsAtomically([
      { key: STORAGE_KEY_PURCHASE_LINES, records: lines },
      { key: STORAGE_KEY_ITEMS, records: allItems },
      { key: STORAGE_KEY_PURCHASES, records: allPurchases },
    ]);
    if (persistenceError) {
      return {
        purchaseLine: null,
        inventoryItem: null,
        purchase: null,
        error: persistenceError,
      };
    }
    return { purchaseLine, inventoryItem, purchase: updatedPurchase, error: null };
  }

  finalizePurchaseCosting(
    workspaceId: string,
    purchaseId: string,
  ): { data: PurchaseCostingResult | null; error: Error | null } {
    const purchase = this.getPurchases(workspaceId).find((entry) => entry.id === purchaseId);
    const lines = this.getPurchaseLines(workspaceId).filter(
      (line) => line.purchase_id === purchaseId,
    );
    if (!purchase || lines.length === 0 || purchase.entry_status === 'finalized') {
      return { data: null, error: new Error('Der Demo-Einkauf kann nicht finalisiert werden.') };
    }
    if (lines.some(invalidPackageLine))
      return {
        data: null,
        error: new Error('Die Paketposition benötigt einen gültigen bekannten Preis.'),
      };
    if (purchase.content_status === 'unknown' && lines.some((line) => !line.is_package)) {
      return {
        data: null,
        error: new Error('Der Inhalt muss vor dem Abschluss vollständig erfasst werden.'),
      };
    }
    if (
      !purchase.content_status &&
      !lines.some((line) => line.is_package) &&
      purchase.type !== 'mystery_pack' &&
      lines.every((line) => line.line_kind === 'individual')
    ) {
      return {
        data: null,
        error: new Error('In der Demo können aktuell nur Mystery Boxen abgeschlossen werden.'),
      };
    }
    if (
      (purchase.request_id || lines.some((line) => line.is_package)) &&
      purchase.shipment_status !== 'arrived'
    ) {
      return {
        data: null,
        error: new Error('Der Einkauf muss vor dem Abschluss als angekommen markiert sein.'),
      };
    }
    if (lines.some((line) => line.line_kind !== 'individual')) {
      return this.finalizeProductPurchase(purchase, lines);
    }
    if (purchase.purchase_price === null || !Number.isFinite(purchase.purchase_price)) {
      return { data: null, error: new Error('Die Gesamtkosten des Einkaufs sind noch offen.') };
    }

    let plan: ReturnType<typeof buildProductCostPlan>;
    try {
      plan = buildProductCostPlan(purchase, lines);
    } catch (cause: unknown) {
      return {
        data: null,
        error: cause instanceof Error ? cause : new Error('Kostenabschluss fehlgeschlagen.'),
      };
    }
    const totalCents = plan.reduce((sum, entry) => sum + entry.totalCents, 0);
    const allocatedTotalCentsByLine = new Map<string, number>();
    const allocatedAdditionalCentsByLine = new Map<string, number>();
    const allItems = this.getItems();
    const updatedPurchaseItems: InventoryItem[] = [];

    for (const entry of plan) {
      const line = entry.line;
      if (line.is_package) {
        allocatedTotalCentsByLine.set(line.id, entry.totalCents);
        allocatedAdditionalCentsByLine.set(line.id, entry.additionalCents);
        continue;
      }
      let lineAllocatedCents = 0;
      const lineAdditionalCents = entry.additionalCents;
      const existingItems = allItems
        .filter(
          (item) =>
            item.workspace_id === workspaceId &&
            item.purchase_id === purchaseId &&
            item.purchase_line_id === line.id,
        )
        .sort(
          (left, right) =>
            (left.created_at ?? '').localeCompare(right.created_at ?? '') ||
            left.id.localeCompare(right.id),
        );
      if (existingItems.length > line.ordered_quantity) {
        return {
          data: null,
          error: new Error('Die Zahl erfasster Einzelstücke überschreitet die Positionsmenge.'),
        };
      }
      const condition: ItemCondition =
        line.condition_snapshot === 'new' ||
        line.condition_snapshot === 'like_new' ||
        line.condition_snapshot === 'very_good' ||
        line.condition_snapshot === 'used' ||
        line.condition_snapshot === 'heavily_used' ||
        line.condition_snapshot === 'defective'
          ? line.condition_snapshot
          : 'used';
      for (let position = 0; position < line.ordered_quantity; position += 1) {
        const existing = existingItems[position];
        const allocatedCents = entry.unitCents[position];
        lineAllocatedCents += allocatedCents;
        updatedPurchaseItems.push({
          ...(existing ?? {
            id: this.newId('item'),
            workspace_id: workspaceId,
            purchase_id: purchaseId,
            purchase_line_id: line.id,
            title: line.title_snapshot,
            condition,
          }),
          status: 'ready',
          sale_state: 'no_active_sale',
          active_sale_count: 0,
          active_sale_id: null,
          allocated_purchase_cost: allocatedCents / 100,
          tax_purchase_cost:
            entry.unitTaxPurchaseCents === null ? null : entry.unitTaxPurchaseCents[position] / 100,
          expected_value: existing?.expected_value ?? line.estimated_market_value ?? null,
          updated_at: new Date().toISOString(),
        });
      }
      allocatedTotalCentsByLine.set(line.id, lineAllocatedCents);
      allocatedAdditionalCentsByLine.set(line.id, lineAdditionalCents);
    }

    const purchaseItemIds = new Set(updatedPurchaseItems.map((item) => item.id));
    const updatedItems = [
      ...updatedPurchaseItems,
      ...allItems
        .filter((item) => !purchaseItemIds.has(item.id))
        .map((item) =>
          item.workspace_id === workspaceId &&
          item.purchase_id === purchaseId &&
          item.source_package_line_id &&
          item.status === 'received'
            ? { ...item, status: 'ready' as const }
            : item,
        ),
    ];
    const updatedLines = this.getPurchaseLines().map((line) =>
      line.workspace_id === workspaceId && line.purchase_id === purchaseId
        ? {
            ...line,
            received_quantity: line.ordered_quantity,
            allocated_additional_cost: (allocatedAdditionalCentsByLine.get(line.id) ?? 0) / 100,
            allocated_total_cost: (allocatedTotalCentsByLine.get(line.id) ?? 0) / 100,
          }
        : line,
    );
    const finalizedAt = new Date().toISOString();
    const updatedPurchase: Purchase = {
      ...purchase,
      entry_status: 'finalized',
      receiving_status: 'received',
      finalized_at: finalizedAt,
      total_purchase_cost: totalCents / 100,
      updated_at: finalizedAt,
    };
    const updatedPurchases = this.getPurchases().map((entry) =>
      entry.id === purchaseId && entry.workspace_id === workspaceId ? updatedPurchase : entry,
    );
    const persistenceError = this.saveRecordsAtomically([
      { key: STORAGE_KEY_ITEMS, records: updatedItems },
      { key: STORAGE_KEY_PURCHASE_LINES, records: updatedLines },
      { key: STORAGE_KEY_PURCHASES, records: updatedPurchases },
    ]);
    if (persistenceError) return { data: null, error: persistenceError };

    return {
      data: {
        purchaseId,
        totalPurchaseCost: totalCents / 100,
        allocatedTotalCost: totalCents / 100,
        entryStatus: 'finalized',
        eventId: createLocalDemoId('event'),
      },
      error: null,
    };
  }

  private finalizeProductPurchase(
    purchase: Purchase,
    lines: readonly PurchaseLine[],
  ): { data: PurchaseCostingResult | null; error: Error | null } {
    try {
      if (
        lines.some((line) => !line.is_package && line.received_quantity !== line.ordered_quantity)
      )
        throw new Error('Alle Produkte müssen vor dem Kostenabschluss vollständig erhalten sein.');
      const plan = buildProductCostPlan(purchase, lines);
      const allLots = this.getStockLots();
      const allItems = this.getItems();
      const updatedLots = new Map<string, StockLot>();
      const updatedItems = new Map<string, InventoryItem>();
      for (const item of allItems) {
        if (
          item.workspace_id === purchase.workspace_id &&
          item.purchase_id === purchase.id &&
          item.source_package_line_id &&
          item.status === 'received'
        )
          updatedItems.set(item.id, { ...item, status: 'ready' });
      }
      for (const entry of plan) {
        if (entry.line.is_package) continue;
        if (entry.line.line_kind === 'quantity') {
          const lots = allLots
            .filter(
              (lot) =>
                lot.workspace_id === purchase.workspace_id &&
                lot.purchase_id === purchase.id &&
                lot.purchase_line_id === entry.line.id,
            )
            .sort(
              (left, right) =>
                left.received_at.localeCompare(right.received_at) ||
                left.id.localeCompare(right.id),
            );
          if (
            lots.reduce((sum, lot) => sum + lot.received_quantity, 0) !==
              entry.line.ordered_quantity ||
            lots.some((lot) => lot.remaining_quantity !== lot.received_quantity)
          )
            throw new Error('Die Losmengen stimmen nicht mit dem Wareneingang überein.');
          let offset = 0;
          for (const lot of lots) {
            const pool = entry.unitCents
              .slice(offset, offset + lot.received_quantity)
              .reduce((sum, value) => sum + value, 0);
            const taxPool =
              entry.unitTaxPurchaseCents
                ?.slice(offset, offset + lot.received_quantity)
                .reduce((sum, value) => sum + value, 0) ?? null;
            updatedLots.set(lot.id, {
              ...lot,
              unit_cost: pool / 100 / lot.received_quantity,
              remaining_unit_costs: entry.unitCents
                .slice(offset, offset + lot.received_quantity)
                .map((cost) => cost / 100),
              unit_tax_purchase_cost:
                taxPool === null ? null : taxPool / 100 / lot.received_quantity,
              remaining_tax_unit_costs:
                entry.unitTaxPurchaseCents
                  ?.slice(offset, offset + lot.received_quantity)
                  .map((cost) => cost / 100) ?? null,
            });
            offset += lot.received_quantity;
          }
        } else {
          const items = allItems
            .filter(
              (item) =>
                item.workspace_id === purchase.workspace_id &&
                item.purchase_id === purchase.id &&
                item.purchase_line_id === entry.line.id,
            )
            .sort(
              (left, right) =>
                (left.created_at ?? '').localeCompare(right.created_at ?? '') ||
                left.id.localeCompare(right.id),
            );
          if (
            items.length !== entry.line.ordered_quantity ||
            items.some((item) => item.status === 'sold')
          )
            throw new Error('Die vorhandenen Artikel stimmen nicht mit dem Wareneingang überein.');
          items.forEach((item, index) =>
            updatedItems.set(item.id, {
              ...item,
              status: 'ready',
              allocated_purchase_cost: entry.unitCents[index] / 100,
              tax_purchase_cost:
                entry.unitTaxPurchaseCents === null
                  ? null
                  : entry.unitTaxPurchaseCents[index] / 100,
            }),
          );
        }
      }
      const linePlans = new Map(plan.map((entry) => [entry.line.id, entry]));
      const total = plan.reduce((sum, entry) => sum + entry.totalCents, 0) / 100;
      const goodsAmount =
        purchase.purchase_price ??
        lines.reduce((sum, line) => sum + Math.round((line.line_total ?? 0) * 100), 0) / 100;
      const updatedPurchase: Purchase = {
        ...purchase,
        purchase_price: goodsAmount,
        entry_status: 'finalized',
        receiving_status: 'received',
        total_purchase_cost: total,
        finalized_at: new Date().toISOString(),
      };
      const error = this.saveRecordsAtomically([
        {
          key: STORAGE_KEY_STOCK_LOTS,
          records: allLots.map((lot) => updatedLots.get(lot.id) ?? lot),
        },
        {
          key: STORAGE_KEY_ITEMS,
          records: allItems.map((item) => updatedItems.get(item.id) ?? item),
        },
        {
          key: STORAGE_KEY_PURCHASES,
          records: this.getPurchases().map((entry) =>
            entry.id === purchase.id && entry.workspace_id === purchase.workspace_id
              ? updatedPurchase
              : entry,
          ),
        },
        {
          key: STORAGE_KEY_PURCHASE_LINES,
          records: this.getPurchaseLines().map((line) => {
            const cost =
              line.workspace_id === purchase.workspace_id && line.purchase_id === purchase.id
                ? linePlans.get(line.id)
                : null;
            return cost
              ? {
                  ...line,
                  received_quantity: line.is_package ? 1 : line.received_quantity,
                  allocated_total_cost: cost.totalCents / 100,
                  allocated_additional_cost: cost.additionalCents / 100,
                }
              : line;
          }),
        },
      ]);
      return error
        ? { data: null, error }
        : {
            data: {
              purchaseId: purchase.id,
              totalPurchaseCost: total,
              allocatedTotalCost: total,
              entryStatus: 'finalized',
              eventId: createLocalDemoId('event'),
            },
            error: null,
          };
    } catch (cause: unknown) {
      return {
        data: null,
        error: cause instanceof Error ? cause : new Error('Kostenabschluss fehlgeschlagen.'),
      };
    }
  }

  bookSaleAtomically(
    workspaceId: string,
    sale: Sale,
    saleLines: readonly SaleLine[],
  ): {
    sale: Sale | null;
    saleLines: SaleLine[];
    allocations: SaleLineLotAllocation[];
    movements: StockMovement[];
    error: Error | null;
  } {
    const lots = this.getStockLots();
    const updatedLots = lots.map((lot) => ({ ...lot }));
    const items = this.getItems();
    const updatedItems = items.map((item) => ({ ...item }));
    const activeSales = this.getSales(workspaceId).filter(
      (sale) => !sale.returned_at && !sale.voided_at,
    );
    const allocations: DemoSaleLineLotAllocation[] = [];
    const movements: StockMovement[] = [];
    const updatedLines: SaleLine[] = [];

    for (const line of saleLines) {
      if (!line.catalog_product_id) {
        if (!line.inventory_item_id || line.quantity !== 1) {
          return {
            sale: null,
            saleLines: [],
            allocations: [],
            movements: [],
            error: new Error('Eine Einzelartikelposition ist ungültig.'),
          };
        }
        const item = updatedItems.find(
          (entry) => entry.id === line.inventory_item_id && entry.workspace_id === workspaceId,
        );
        const alreadySold = activeSales.some(
          (sale) =>
            sale.inventory_item_id === line.inventory_item_id ||
            sale.lines?.some((saleLine) => saleLine.inventory_item_id === line.inventory_item_id),
        );
        if (!item || !isSellableInventoryItem(item) || alreadySold) {
          return {
            sale: null,
            saleLines: [],
            allocations: [],
            movements: [],
            error: new Error('Der Einzelartikel ist nicht verkaufbar.'),
          };
        }
        item.status = 'sold';
        item.sale_state = 'sold';
        item.active_sale_count = 1;
        item.active_sale_id = line.sale_id;
        const itemCosts = this.getItemCosts(item.id);
        const additionalItemCosts = (itemCosts.length ? itemCosts : (item.costs ?? [])).reduce(
          (sum, cost) => sum + Math.round(cost.amount * 100),
          0,
        );
        updatedLines.push({
          ...line,
          cost_of_goods_sold:
            item.allocated_purchase_cost === null
              ? null
              : (Math.round(item.allocated_purchase_cost * 100) + additionalItemCosts) / 100,
          tax_purchase_cost: item.tax_purchase_cost ?? null,
          tax_cost_allocations: groupTaxUnitCosts(
            item.tax_purchase_cost == null ? null : [item.tax_purchase_cost],
          ),
        });
        continue;
      }
      let remaining = line.quantity;
      let costOfGoodsSold = 0;
      let lineTaxCosts: number[] | null = [];
      const lotsForProduct = updatedLots
        .filter(
          (lot) =>
            lot.workspace_id === workspaceId &&
            lot.catalog_product_id === line.catalog_product_id &&
            lot.remaining_quantity > 0 &&
            this.getPurchases(workspaceId).some(
              (purchase) =>
                purchase.id === lot.purchase_id && purchase.entry_status === 'finalized',
            ),
        )
        .sort(
          (left, right) =>
            left.received_at.localeCompare(right.received_at) || left.id.localeCompare(right.id),
        );

      for (const lot of lotsForProduct) {
        if (remaining === 0) break;
        if (lot.unit_cost === null) {
          return {
            sale: null,
            saleLines: [],
            allocations: [],
            movements: [],
            error: new Error('Die Kosten des Bestands sind noch offen.'),
          };
        }
        const quantity = Math.min(remaining, lot.remaining_quantity);
        const previousAllocatedCost = [
          ...this.getSales(workspaceId).flatMap((sale) => sale.lot_allocations ?? []),
          ...allocations,
        ]
          .filter((allocation) => allocation.stock_lot_id === lot.id)
          .reduce(
            (sum, allocation) =>
              sum +
              (allocation.active_allocated_cost ??
                allocation.allocated_cost ??
                allocation.quantity * allocation.unit_cost),
            0,
          );
        const remainingCents =
          Math.round(lot.unit_cost * lot.received_quantity * 100) -
          Math.round(previousAllocatedCost * 100);
        if (remainingCents < 0 || !Number.isSafeInteger(remainingCents)) {
          return {
            sale: null,
            saleLines: [],
            allocations: [],
            movements: [],
            error: new Error('Die aktiven Kosten des Bestands sind ungültig.'),
          };
        }
        let allocatedCost =
          (quantity * Math.floor(remainingCents / lot.remaining_quantity) +
            Math.min(quantity, remainingCents % lot.remaining_quantity)) /
          100;
        const availableUnitCosts = lot.remaining_unit_costs;
        if (availableUnitCosts != null && availableUnitCosts.length !== lot.remaining_quantity) {
          return {
            sale: null,
            saleLines: [],
            allocations: [],
            movements: [],
            error: new Error('Die Stückkostenfolge des Loses ist unvollständig.'),
          };
        }
        const allocatedUnitCosts = availableUnitCosts?.slice(0, quantity) ?? null;
        if (allocatedUnitCosts !== null) {
          allocatedCost =
            allocatedUnitCosts.reduce((sum, cost) => sum + Math.round(cost * 100), 0) / 100;
        }
        lot.remaining_unit_costs = availableUnitCosts?.slice(quantity) ?? null;
        const availableTaxCosts = lot.remaining_tax_unit_costs;
        const allocatedTaxCosts =
          availableTaxCosts?.length === lot.remaining_quantity
            ? availableTaxCosts.slice(0, quantity)
            : null;
        lot.remaining_tax_unit_costs =
          allocatedTaxCosts === null ? null : availableTaxCosts!.slice(quantity);
        lineTaxCosts =
          lineTaxCosts === null || allocatedTaxCosts === null
            ? null
            : [...lineTaxCosts, ...allocatedTaxCosts];
        lot.remaining_quantity -= quantity;
        remaining -= quantity;
        costOfGoodsSold += allocatedCost;
        allocations.push({
          id: this.newId('allocation'),
          workspace_id: workspaceId,
          sale_line_id: line.id,
          stock_lot_id: lot.id,
          quantity,
          unit_cost: lot.unit_cost,
          allocated_cost: allocatedCost,
          active_allocated_cost: allocatedCost,
          tax_purchase_cost: totalTaxUnitCosts(allocatedTaxCosts),
          tax_cost_allocations: groupTaxUnitCosts(allocatedTaxCosts),
          active_tax_unit_costs: allocatedTaxCosts,
          active_unit_costs: allocatedUnitCosts,
        });
        movements.push({
          id: this.newId('movement'),
          workspace_id: workspaceId,
          stock_lot_id: lot.id,
          sale_line_id: line.id,
          direction: 'out',
          quantity,
          reason: 'sale',
          created_at: new Date().toISOString(),
        });
      }
      if (remaining !== 0) {
        return {
          sale: null,
          saleLines: [],
          allocations: [],
          movements: [],
          error: new Error('Nicht genügend verfügbarer Bestand'),
        };
      }
      updatedLines.push({
        ...line,
        cost_of_goods_sold: Number(costOfGoodsSold.toFixed(2)),
        tax_purchase_cost: totalTaxUnitCosts(lineTaxCosts),
        tax_cost_allocations: groupTaxUnitCosts(lineTaxCosts),
      });
    }

    const lineRevenue = updatedLines.reduce((sum, line) => sum + line.line_total, 0);
    const grossRevenue = Number((lineRevenue + Number(sale.shipping_revenue ?? 0)).toFixed(2));
    const persistedSale: Sale = {
      ...sale,
      sale_price: grossRevenue,
      sale_price_total: grossRevenue,
      lines: updatedLines,
      has_persisted_lines: true,
      lot_allocations: allocations,
      stock_movements: movements,
    };
    const persistenceError = this.saveRecordsAtomically([
      { key: STORAGE_KEY_ITEMS, records: updatedItems },
      { key: STORAGE_KEY_STOCK_LOTS, records: updatedLots },
      {
        key: STORAGE_KEY_STOCK_MOVEMENTS,
        records: [...this.getStockMovements(), ...movements],
      },
      { key: STORAGE_KEY_SALES, records: this.upsertRecord(this.getSales(), persistedSale) },
    ]);
    if (persistenceError) {
      return {
        sale: null,
        saleLines: [],
        allocations: [],
        movements: [],
        error: persistenceError,
      };
    }
    return { sale: persistedSale, saleLines: updatedLines, allocations, movements, error: null };
  }

  returnSaleAtomically(
    workspaceId: string,
    sale: Sale,
    restock: boolean,
  ): {
    sale: Sale | null;
    movements: StockMovement[];
    restockedQuantity: number;
    error: Error | null;
  } {
    const allocations: DemoSaleLineLotAllocation[] = sale.lot_allocations ?? [];
    const lots = this.getStockLots();
    const updatedLots = lots.map((lot) => ({ ...lot }));
    const items = this.getItems();
    const updatedItems = items.map((item) => ({ ...item }));
    const movements: StockMovement[] = [];
    let restockedQuantity = 0;

    for (const line of sale.lines ?? []) {
      if (line.catalog_product_id || !line.inventory_item_id) continue;
      const item = updatedItems.find(
        (entry) => entry.id === line.inventory_item_id && entry.workspace_id === workspaceId,
      );
      if (!item) {
        return {
          sale: null,
          movements: [],
          restockedQuantity: 0,
          error: new Error('Der retournierte Einzelartikel wurde nicht gefunden.'),
        };
      }
      item.status = restock ? 'ready' : 'returned';
      item.sale_state = 'no_active_sale';
      item.active_sale_count = 0;
      item.active_sale_id = null;
      if (restock) restockedQuantity += 1;
    }

    for (const allocation of allocations) {
      const lot = updatedLots.find(
        (entry) => entry.id === allocation.stock_lot_id && entry.workspace_id === workspaceId,
      );
      if (!lot) {
        return {
          sale: null,
          movements: [],
          restockedQuantity: 0,
          error: new Error('Das zugeordnete Bestandslos wurde nicht gefunden.'),
        };
      }
      if (restock) {
        const returnedUnitCosts = allocation.active_unit_costs;
        lot.remaining_unit_costs =
          returnedUnitCosts?.length !== allocation.quantity ||
          (lot.remaining_quantity > 0 && lot.remaining_unit_costs == null)
            ? null
            : [...(lot.remaining_unit_costs ?? []), ...returnedUnitCosts];
        const returnedTaxCosts = allocation.active_tax_unit_costs;
        lot.remaining_tax_unit_costs =
          returnedTaxCosts?.length !== allocation.quantity ||
          (lot.remaining_quantity > 0 && lot.remaining_tax_unit_costs == null)
            ? null
            : [...(lot.remaining_tax_unit_costs ?? []), ...returnedTaxCosts];
        lot.remaining_quantity += allocation.quantity;
        restockedQuantity += allocation.quantity;
      }
      movements.push({
        id: this.newId('movement'),
        workspace_id: workspaceId,
        stock_lot_id: lot.id,
        sale_line_id: allocation.sale_line_id,
        direction: 'in',
        quantity: allocation.quantity,
        reason: 'return',
        created_at: new Date().toISOString(),
      });
      if (!restock) {
        movements.push({
          id: this.newId('movement'),
          workspace_id: workspaceId,
          stock_lot_id: lot.id,
          sale_line_id: allocation.sale_line_id,
          direction: 'out',
          quantity: allocation.quantity,
          reason: 'damage',
          created_at: new Date().toISOString(),
        });
      }
    }

    const persistedSale: Sale = {
      ...sale,
      stock_movements: movements,
      lot_allocations: allocations.map((allocation) => ({
        ...allocation,
        active_tax_unit_costs: restock ? [] : allocation.active_tax_unit_costs,
        active_unit_costs: restock ? [] : allocation.active_unit_costs,
        active_allocated_cost: restock
          ? 0
          : (allocation.active_allocated_cost ??
            allocation.allocated_cost ??
            allocation.quantity * allocation.unit_cost),
      })),
    };
    const persistenceError = this.saveRecordsAtomically([
      { key: STORAGE_KEY_ITEMS, records: updatedItems },
      { key: STORAGE_KEY_STOCK_LOTS, records: updatedLots },
      {
        key: STORAGE_KEY_STOCK_MOVEMENTS,
        records: [...this.getStockMovements(), ...movements],
      },
      { key: STORAGE_KEY_SALES, records: this.upsertRecord(this.getSales(), persistedSale) },
    ]);
    if (persistenceError) {
      return { sale: null, movements: [], restockedQuantity: 0, error: persistenceError };
    }
    return { sale: persistedSale, movements, restockedQuantity, error: null };
  }

  private getWorkspaceRecords<T extends { workspace_id: string }>(
    key: string,
    workspaceId?: string,
  ): T[] {
    if (!this.isDemoMode()) return [];
    try {
      const raw = this.readStorageValue(key);
      const records: T[] = raw ? JSON.parse(raw) : [];
      return workspaceId
        ? records.filter((record) => record.workspace_id === workspaceId)
        : records;
    } catch {
      return [];
    }
  }

  private saveWorkspaceRecord<T extends { id: string; workspace_id: string }>(
    key: string,
    record: T,
  ): void {
    if (!this.isDemoMode()) return;
    const records = this.getWorkspaceRecords<T>(key);
    const index = records.findIndex((entry) => entry.id === record.id);
    if (index === -1) records.unshift(record);
    else records[index] = record;
    this.saveWorkspaceRecords(key, records);
  }

  private upsertRecord<T extends { id: string }>(records: readonly T[], record: T): T[] {
    const index = records.findIndex((entry) => entry.id === record.id);
    if (index === -1) return [record, ...records];
    return records.map((entry, current) => (current === index ? record : entry));
  }

  private saveWorkspaceRecords<T>(key: string, records: readonly T[]): void {
    if (!this.isDemoMode()) return;
    try {
      getStorage()?.setItem(key, JSON.stringify(records));
    } catch {}
  }

  private saveRecordsAtomically(
    records: readonly { key: string; records: readonly unknown[] }[],
  ): Error | null {
    if (!this.isDemoMode()) return null;
    const storage = getStorage();
    if (!storage) return new Error('Der lokale Speicher ist nicht verfügbar.');

    const pendingRecovery = this.recoverPendingReceipt(storage);
    if (pendingRecovery) {
      return new Error('Ein vorheriger lokaler Wareneingang wird noch wiederhergestellt.');
    }

    let changes: AtomicStorageChange[];
    try {
      changes = records.map(({ key, records: value }) => ({
        key,
        previous: storage.getItem(key),
        value: JSON.stringify(value),
      }));
    } catch (error: unknown) {
      return error instanceof Error
        ? error
        : new Error('Der lokale Wareneingang konnte nicht vorbereitet werden.');
    }

    try {
      storage.setItem(
        STORAGE_KEY_RECEIPT_JOURNAL,
        JSON.stringify({
          phase: 'prepared',
          changes: changes.map(({ key, previous }) => ({ key, previous })),
        } satisfies ReceiptJournal),
      );
      for (const change of changes) storage.setItem(change.key, change.value);
    } catch (error: unknown) {
      this.recoverPendingReceipt(storage);
      return error instanceof Error
        ? error
        : new Error('Der lokale Wareneingang konnte nicht gespeichert werden.');
    }

    try {
      storage.setItem(
        STORAGE_KEY_RECEIPT_JOURNAL,
        JSON.stringify({
          phase: 'committed',
          changes: changes.map(({ key, previous }) => ({ key, previous })),
        } satisfies ReceiptJournal),
      );
    } catch (error: unknown) {
      this.recoverPendingReceipt(storage);
      return error instanceof Error
        ? error
        : new Error('Der lokale Wareneingang konnte nicht abgeschlossen werden.');
    }

    try {
      storage.removeItem(STORAGE_KEY_RECEIPT_JOURNAL);
    } catch {}
    return null;
  }

  private readStorageValue(key: string): string | null {
    const storage = getStorage();
    if (!storage) return null;

    const recoverySnapshot = this.recoverPendingReceipt(storage);
    if (recoverySnapshot?.has(key)) return recoverySnapshot.get(key) ?? null;
    return storage.getItem(key);
  }

  private recoverPendingReceipt(storage: Storage): ReadonlyMap<string, string | null> | null {
    let journal: ReceiptJournal | null;
    try {
      journal = this.readReceiptJournal(storage);
    } catch {
      return null;
    }
    if (!journal) return null;

    if (journal.phase === 'committed') {
      try {
        storage.removeItem(STORAGE_KEY_RECEIPT_JOURNAL);
      } catch {}
      return null;
    }

    const snapshot = new Map(journal.changes.map((change) => [change.key, change.previous]));
    let recovered = true;
    for (const change of journal.changes) {
      try {
        if (change.previous === null) storage.removeItem(change.key);
        else storage.setItem(change.key, change.previous);
      } catch {
        recovered = false;
      }
    }
    if (recovered) {
      try {
        storage.removeItem(STORAGE_KEY_RECEIPT_JOURNAL);
      } catch {}
    }
    return snapshot;
  }

  private readReceiptJournal(storage: Storage): ReceiptJournal | null {
    const raw = storage.getItem(STORAGE_KEY_RECEIPT_JOURNAL);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      !('phase' in value) ||
      (value.phase !== 'prepared' && value.phase !== 'committed') ||
      !('changes' in value) ||
      !Array.isArray(value.changes) ||
      !value.changes.every(
        (change: unknown) =>
          !!change &&
          typeof change === 'object' &&
          'key' in change &&
          typeof change.key === 'string' &&
          'previous' in change &&
          (typeof change.previous === 'string' || change.previous === null),
      )
    ) {
      return null;
    }
    return value as ReceiptJournal;
  }

  private newId(prefix: string): string {
    return createLocalDemoId(prefix);
  }

  // --- Purchases Persistent API ---
  getPurchases(workspaceId?: string): Purchase[] {
    if (!this.isDemoMode()) return [];
    try {
      const stored = this.readStorageValue(STORAGE_KEY_PURCHASES);
      if (stored) {
        const list: Purchase[] = JSON.parse(stored);
        return workspaceId
          ? list.filter(
              (p) =>
                !p.workspace_id ||
                p.workspace_id === workspaceId ||
                ((p.workspace_id === 'ws-1' || p.workspace_id === 'demo-workspace-1') &&
                  (workspaceId === 'ws-1' || workspaceId === 'demo-workspace-1')),
            )
          : list;
      }
    } catch {}
    return [];
  }

  savePurchase(purchase: Purchase): void {
    if (!this.isDemoMode()) return;
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
      const other = this.getPurchases().filter(
        (p) => p.workspace_id && p.workspace_id !== workspaceId,
      );
      const combined = [...purchases, ...other];
      getStorage()?.setItem(STORAGE_KEY_PURCHASES, JSON.stringify(combined));
    } catch {}
  }

  deletePurchase(id: string): void {
    if (!this.isDemoMode()) return;
    try {
      const all = this.getPurchases().filter((p) => p.id !== id);
      getStorage()?.setItem(STORAGE_KEY_PURCHASES, JSON.stringify(all));
    } catch {}
  }

  // --- Inventory Items Persistent API ---
  getItems(workspaceId?: string): InventoryItem[] {
    if (!this.isDemoMode()) return [];
    try {
      const stored = this.readStorageValue(STORAGE_KEY_ITEMS);
      if (stored) {
        const list: InventoryItem[] = JSON.parse(stored);
        return workspaceId
          ? list.filter(
              (i) =>
                !i.workspace_id ||
                i.workspace_id === workspaceId ||
                ((i.workspace_id === 'ws-1' || i.workspace_id === 'demo-workspace-1') &&
                  (workspaceId === 'ws-1' || workspaceId === 'demo-workspace-1')),
            )
          : list;
      }
    } catch {}
    return [];
  }

  saveItem(item: InventoryItem): void {
    if (!this.isDemoMode()) return;
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

  setItemArchived(
    workspaceId: string,
    itemId: string,
    archived: boolean,
    actorId: string,
  ): Pick<InventoryItem, 'archived_at' | 'archived_by'> {
    if (!this.isDemoMode()) throw new Error('Nur im Demomodus verfügbar.');
    const items = this.getItems();
    const item = items.find((value) => value.id === itemId && value.workspace_id === workspaceId);
    if (!item) throw new Error('Artikel nicht gefunden.');
    const activeSales = this.getSales(workspaceId).filter(
      (sale) =>
        !sale.returned_at &&
        !sale.voided_at &&
        (sale.inventory_item_id === itemId ||
          sale.lines?.some((line) => line.inventory_item_id === itemId)),
    );
    if (
      archived &&
      (item.status !== 'sold' ||
        activeSales.length !== 1 ||
        !activeSales[0].lines?.some((line) => line.inventory_item_id === itemId))
    )
      throw new Error('Nur eindeutig verkaufte Einzelartikel können archiviert werden.');
    const metadata = {
      archived_at: archived ? (item.archived_at ?? new Date().toISOString()) : null,
      archived_by: archived ? (item.archived_by ?? actorId) : null,
    };
    const storage = getStorage();
    if (!storage) throw new Error('Der Demospeicher ist nicht verfügbar.');
    storage.setItem(
      STORAGE_KEY_ITEMS,
      JSON.stringify(
        items.map((value) =>
          value.id === itemId && value.workspace_id === workspaceId
            ? { ...value, ...metadata }
            : value,
        ),
      ),
    );
    return metadata;
  }

  setItems(workspaceId: string, items: InventoryItem[]): void {
    try {
      const other = this.getItems().filter((i) => i.workspace_id && i.workspace_id !== workspaceId);
      const combined = [...items, ...other];
      getStorage()?.setItem(STORAGE_KEY_ITEMS, JSON.stringify(combined));
    } catch {}
  }

  deleteItem(id: string): void {
    if (!this.isDemoMode()) return;
    try {
      const all = this.getItems().filter((i) => i.id !== id);
      getStorage()?.setItem(STORAGE_KEY_ITEMS, JSON.stringify(all));
    } catch {}
  }

  // --- Sales Persistent API ---
  getSales(workspaceId?: string): Sale[] {
    if (!this.isDemoMode()) return [];
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
                  (workspaceId === 'ws-1' || workspaceId === 'demo-workspace-1')),
            )
          : list;
      }
    } catch {}
    return [];
  }

  saveSale(sale: Sale): void {
    if (!this.isDemoMode()) return;
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
    if (!this.isDemoMode()) return;
    try {
      const all = this.getSales().filter((s) => s.id !== id);
      getStorage()?.setItem(STORAGE_KEY_SALES, JSON.stringify(all));
    } catch {}
  }

  // --- Sources & Suppliers API ---
  getSources(workspaceId?: string): Source[] {
    if (!this.isDemoMode()) return [];
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_SOURCES);
      if (stored) {
        const list: Source[] = JSON.parse(stored);
        return workspaceId
          ? list.filter((s) => !s.workspace_id || s.workspace_id === workspaceId)
          : list;
      }
    } catch {}
    return this.defaultSources;
  }

  saveSource(source: Source): void {
    if (!this.isDemoMode()) return;
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
    if (!this.isDemoMode()) return;
    try {
      const all = this.getSources().filter((s) => s.id !== id);
      getStorage()?.setItem(STORAGE_KEY_SOURCES, JSON.stringify(all));
    } catch {}
  }

  setSources(workspaceId: string, sources: Source[]): void {
    try {
      const other = this.getSources().filter(
        (s) => s.workspace_id && s.workspace_id !== workspaceId,
      );
      const combined = [...sources, ...other];
      getStorage()?.setItem(STORAGE_KEY_SOURCES, JSON.stringify(combined));
    } catch {}
  }

  getSuppliers(workspaceId?: string): Supplier[] {
    if (!this.isDemoMode()) return [];
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_SUPPLIERS);
      if (stored) {
        const list: Supplier[] = JSON.parse(stored);
        return workspaceId
          ? list.filter((s) => !s.workspace_id || s.workspace_id === workspaceId)
          : list;
      }
    } catch {}
    return this.defaultSuppliers;
  }

  saveSupplier(supplier: Supplier): void {
    if (!this.isDemoMode()) return;
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
    if (!this.isDemoMode()) return;
    try {
      const all = this.getSuppliers().filter((s) => s.id !== id);
      getStorage()?.setItem(STORAGE_KEY_SUPPLIERS, JSON.stringify(all));
    } catch {}
  }

  setSuppliers(workspaceId: string, suppliers: Supplier[]): void {
    try {
      const other = this.getSuppliers().filter(
        (s) => s.workspace_id && s.workspace_id !== workspaceId,
      );
      const combined = [...suppliers, ...other];
      getStorage()?.setItem(STORAGE_KEY_SUPPLIERS, JSON.stringify(combined));
    } catch {}
  }

  // --- Item Costs API ---
  getItemCosts(itemId: string): ItemCost[] {
    if (!this.isDemoMode()) return [];
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
    if (!this.isDemoMode()) return;
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
    if (!this.isDemoMode()) return;
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_ITEM_COSTS);
      if (stored) {
        const all: ItemCost[] = JSON.parse(stored);
        getStorage()?.setItem(
          STORAGE_KEY_ITEM_COSTS,
          JSON.stringify(all.filter((c) => c.id !== id)),
        );
      }
    } catch {}
  }

  // --- Activity Logs API ---
  getActivityLogs(itemId: string): ActivityLog[] {
    if (!this.isDemoMode()) return [];
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
    if (!this.isDemoMode()) return;
    try {
      const stored = getStorage()?.getItem(STORAGE_KEY_ACTIVITY_LOGS);
      const all: ActivityLog[] = stored ? JSON.parse(stored) : [];
      all.unshift(log);
      getStorage()?.setItem(STORAGE_KEY_ACTIVITY_LOGS, JSON.stringify(all.slice(0, 500)));
    } catch {}
  }

  // --- Media Persistent API ---
  getCatalogProductMedia(productId?: string): CatalogProductMedia[] {
    if (!this.isDemoMode()) return [];
    const value = getStorage()?.getItem(STORAGE_KEY_PRODUCT_MEDIA);
    const media: CatalogProductMedia[] = value ? JSON.parse(value) : [];
    return media
      .filter((entry) => !productId || entry.catalog_product_id === productId)
      .sort(
        (left, right) =>
          Number(right.is_primary) - Number(left.is_primary) ||
          left.sort_order - right.sort_order ||
          (left.created_at ?? '').localeCompare(right.created_at ?? '') ||
          left.id.localeCompare(right.id),
      );
  }

  replaceCatalogProductMedia(
    productId: string,
    workspaceId: string,
    media: readonly CatalogProductMedia[],
  ): void {
    if (!this.isDemoMode()) throw new Error('Lokaler Bildspeicher ist nur im Demomodus verfügbar.');
    if (
      media.some(
        (entry) => entry.catalog_product_id !== productId || entry.workspace_id !== workspaceId,
      )
    )
      throw new Error('Die Bilder gehören nicht zu diesem Produkt.');
    const storage = getStorage();
    if (!storage) throw new Error('Lokaler Bildspeicher ist nicht verfügbar.');
    const other = this.getCatalogProductMedia().filter(
      (entry) => entry.catalog_product_id !== productId || entry.workspace_id !== workspaceId,
    );
    storage.setItem(STORAGE_KEY_PRODUCT_MEDIA, JSON.stringify([...other, ...media]));
  }

  saveCatalogProductMedia(media: CatalogProductMedia): void {
    if (!this.isDemoMode()) return;
    const storage = getStorage();
    if (!storage) throw new Error('Lokaler Bildspeicher ist nicht verfügbar.');
    const existing = this.getCatalogProductMedia().filter((entry) => entry.id !== media.id);
    const updated = existing.map((entry) =>
      media.is_primary && entry.catalog_product_id === media.catalog_product_id
        ? { ...entry, is_primary: false }
        : entry,
    );
    storage.setItem(STORAGE_KEY_PRODUCT_MEDIA, JSON.stringify([...updated, media]));
  }

  getItemMedia(itemId?: string): ItemMedia[] {
    if (!this.isDemoMode()) return [];
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
    if (!this.isDemoMode()) return;
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
    if (!this.isDemoMode()) return;
    try {
      const all = this.getItemMedia().filter((m) => m.id !== id);
      getStorage()?.setItem(STORAGE_KEY_MEDIA, JSON.stringify(all));
    } catch {}
  }

  setItemMediaPrimary(itemId: string, mediaId: string): void {
    if (!this.isDemoMode()) return;
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
  async withTimeout<T>(promiseLike: T | PromiseLike<T>, fallback: T, ms = 800): Promise<T> {
    const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
    try {
      return await Promise.race([Promise.resolve(promiseLike), timeout]);
    } catch {
      return fallback;
    }
  }
}
