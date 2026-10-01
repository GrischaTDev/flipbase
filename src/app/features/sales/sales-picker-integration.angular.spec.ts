import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogProduct, InventoryItem } from '../../core/models/flipbase.models';
import { SALES_TABLE_CONFIG } from '../../core/config/table-defaults.config';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { InventoryService } from '../../core/services/inventory.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { SalesService } from '../../core/services/sales.service';
import { StockService } from '../../core/services/stock.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { TablePreferencesService } from '../../core/services/table-preferences.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { SaleCreateModalComponent } from './components/sale-create-modal/sale-create-modal.component';

const product: CatalogProduct = {
  id: 'p36',
  workspace_id: 'ws',
  title: 'Sneaker',
  size: '36,5',
  color: 'Schwarz',
  tracking_mode: 'quantity',
  is_public_store: false,
};
const item = (id: string, purchase: string, line: string): InventoryItem => ({
  id,
  workspace_id: 'ws',
  title: id,
  purchase_id: purchase,
  purchase_line_id: line,
  status: 'ready',
  sale_state: 'no_active_sale',
  condition: 'used',
  allocated_purchase_cost: 10,
});
const loadState = () => ({
  loadedWorkspaceId: signal('ws'),
  isLoading: signal(false),
  loadError: signal(null),
});
function createSaleForm() {
  const items = signal([item('i1', 'buy1', 'line1'), item('i2', 'buy2', 'line2')]);
  const purchases = signal([
    {
      id: 'buy1',
      workspace_id: 'ws',
      purchase_lines: [
        { id: 'line1', workspace_id: 'ws', purchase_id: 'buy1', catalog_product_id: 'p36' },
      ],
    },
    {
      id: 'buy2',
      workspace_id: 'ws',
      purchase_lines: [
        { id: 'line2', workspace_id: 'ws', purchase_id: 'buy2', catalog_product_id: 'p36' },
      ],
    },
  ]);
  const recordSale = vi.fn(async (_input: unknown) => ({ data: null, error: null }));
  TestBed.configureTestingModule({
    providers: [
      { provide: SalesService, useValue: { recordSale } },
      {
        provide: InventoryService,
        useValue: { ...loadState(), items, loadInventory: vi.fn(async () => undefined) },
      },
      {
        provide: PurchaseService,
        useValue: {
          ...loadState(),
          purchases,
          purchaseLines: signal(purchases()[1].purchase_lines),
          loadPurchases: vi.fn(async () => undefined),
        },
      },
      {
        provide: CatalogService,
        useValue: {
          ...loadState(),
          products: signal([product]),
          imageUrls: signal({}),
          loadProducts: vi.fn(async () => undefined),
        },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: signal({ id: 'ws' }) } },
      {
        provide: StockService,
        useValue: {
          ...loadState(),
          positions: signal([
            {
              catalog_product_id: 'p36',
              title: 'Sneaker',
              available_quantity: 3,
              on_hand_quantity: 3,
              reserved_quantity: 0,
              oldest_available_unit_cost: 10,
              is_public_store: false,
            },
          ]),
          loadPositions: vi.fn(async () => undefined),
        },
      },
    ],
  });
  return {
    component: TestBed.runInInjectionContext(() => new SaleCreateModalComponent()),
    items,
    recordSale,
  };
}
function preferences() {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal(null) } },
      {
        provide: SupabaseService,
        useValue: {
          client: { auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } },
        },
      },
    ],
  });
  return TestBed.inject(TablePreferencesService);
}
const legacyIds = [
  'title',
  'quantity',
  'platform',
  'sale_date',
  'revenue',
  'cost_of_goods_sold',
  'selling_costs',
  'profit',
  'margin',
  'holding_days',
  'actions',
];
const saveColumns = (ids: string[]) =>
  localStorage.setItem(
    'flipbase:table_prefs:ws:sales',
    JSON.stringify({
      version: 1,
      columns: ids.map((id, order) => ({ id, order, visible: id !== 'margin' })),
      sort: { field: 'profit', direction: 'asc' },
    }),
  );

afterEach(() => {
  TestBed.resetTestingModule();
  localStorage.clear();
});
describe('Verkaufsmaske und Tabellenregistrierung', () => {
  it('bietet Einzelstücke aus allen Einkäufen unabhängig von der letzten Detailansicht an', () => {
    const { component } = createSaleForm();
    expect(component.availableItems().map(({ id }) => id)).toEqual(['i1', 'i2']);
  });
  it('schließt fremde Arbeitsbereiche vor der Auswahl aus', () => {
    const { component, items } = createSaleForm();
    items.set([
      { ...item('fremd', 'buy1', 'line1'), workspace_id: 'other', purchase_line_id: null },
    ]);
    expect(component.availableItems()).toEqual([]);
  });
  it('reduziert die erlaubte Menge um weitere Zeilen derselben Variante', () => {
    const { component } = createSaleForm();
    component.onTargetChange(0, 'catalog:p36');
    component.addLine();
    component.onTargetChange(1, 'catalog:p36');
    component.lines.at(1).controls.quantity.setValue(2);
    expect(component.availableQuantity(component.lines.at(0))).toBe(1);
  });
  it('speichert die konkrete Variante mit Größe im Verkaufstext', async () => {
    const { component, recordSale } = createSaleForm();
    component.onTargetChange(0, 'catalog:p36');
    component.lines.at(0).controls.unitSalePrice.setValue(40);
    await component.onSubmit();
    expect(recordSale).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            catalogProductId: 'p36',
            quantity: 1,
            titleSnapshot: expect.stringContaining('Größe 36,5'),
          }),
        ],
      }),
    );
  });
  it('registriert Nummer und Datum zuerst und verwendet einfache Begriffe im echten Tabellenvertrag', () => {
    expect(SALES_TABLE_CONFIG.defaultColumns.slice(0, 3).map(({ id }) => id)).toEqual([
      'record_number',
      'sale_date',
      'title',
    ]);
    expect(
      SALES_TABLE_CONFIG.defaultColumns.find(({ id }) => id === 'cost_of_goods_sold')?.label,
    ).toBe('Einkaufskosten');
  });
  it('übernimmt die alte Standardfolge und erhält ausgeblendete Spalten sowie Sortierung', () => {
    saveColumns(legacyIds);
    const state = preferences().getTablePreferences('sales', 'ws')();
    expect(state.columns.slice(0, 3).map(({ id }) => id)).toEqual([
      'record_number',
      'sale_date',
      'title',
    ]);
    expect(state.columns.find(({ id }) => id === 'margin')?.visible).toBe(false);
    expect(state.sort).toEqual({ field: 'profit', direction: 'asc' });
  });
  it('erhält die relative Reihenfolge persönlich sortierter Spalten', () => {
    const personal = ['profit', ...legacyIds.filter((id) => id !== 'profit')];
    saveColumns(personal);
    const state = preferences().getTablePreferences('sales', 'ws')();
    expect(state.columns.filter(({ id }) => id !== 'record_number').map(({ id }) => id)).toEqual(
      personal,
    );
  });
});
