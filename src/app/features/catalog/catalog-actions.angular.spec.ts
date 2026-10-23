import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../../core/services/catalog.service';
import type {
  CatalogProduct,
  InventoryItem,
  StockPosition,
} from '../../core/models/flipbase.models';
import { InventoryService } from '../../core/services/inventory.service';
import { MediaService } from '../../core/services/media.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { StockService } from '../../core/services/stock.service';
import { TablePreferencesService } from '../../core/services/table-preferences.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { CatalogComponent } from './catalog.component';
import { ArticleLifecycleService } from './services/article-lifecycle.service';
import { ArticleMediaCleanupService } from './services/article-media-cleanup.service';
import { CatalogViewStateService } from './services/catalog-view-state.service';
import type { CatalogOverviewRow } from './utils/catalog-overview';

const row: CatalogOverviewRow = {
  key: 'catalog:product',
  id: 'product',
  kind: 'catalog',
  title: 'Kamera',
  detailLink: '/catalog/product',
  onHand: 3,
  available: 3,
  reserved: 0,
  quantityState: 'known',
  inventoryValue: 45,
  archivedAt: null,
  canOfferDelete: false,
  is_public_store: false,
};

function setup() {
  const workspace = signal<{ id: string } | null>({ id: 'own' });
  const confirm = vi.fn().mockResolvedValue(true);
  const archive = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  const reload = vi.fn().mockResolvedValue(undefined);
  const cleanup = vi.fn().mockResolvedValue({ completed: 0, pending: 0, failed: 0 });
  const empty = signal([]);
  const items = signal<InventoryItem[]>([]);
  const products = signal<CatalogProduct[]>([]);
  const positions = signal<StockPosition[]>([]);
  const navigate = vi.fn().mockResolvedValue(true);
  const routeParams = convertToParamMap({});
  const queryParams = new BehaviorSubject(routeParams);
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: routeParams }, queryParamMap: queryParams },
      },
      { provide: Router, useValue: { navigate } },
      {
        provide: CatalogViewStateService,
        useValue: { searchFor: () => '', rememberSearch: vi.fn() },
      },
      {
        provide: TablePreferencesService,
        useValue: {
          getTableConfig: () => ({ columns: [], sortOptions: [] }),
          getTablePreferences: () =>
            signal({ columns: [], sort: { field: 'title', direction: 'asc' } }),
        },
      },
      {
        provide: CatalogService,
        useValue: {
          products,
          loadProducts: reload,
          isLoading: signal(false),
          loadError: signal(null),
        },
      },
      {
        provide: InventoryService,
        useValue: {
          items,
          loadInventory: reload,
          isLoading: signal(false),
          loadError: signal(null),
        },
      },
      {
        provide: StockService,
        useValue: {
          positions,
          lots: empty,
          movements: empty,
          loadedWorkspaceId: signal('own'),
          loadPositions: reload,
          isLoading: signal(false),
          loadError: signal(null),
        },
      },
      {
        provide: PurchaseService,
        useValue: {
          purchases: empty,
          loadPurchases: reload,
          isLoading: signal(false),
          loadError: signal(null),
        },
      },
      { provide: MediaService, useValue: { getMediaUrl: () => null, reportMediaFailure: vi.fn() } },
      { provide: ConfirmDialogService, useValue: { frage: confirm } },
      {
        provide: ArticleLifecycleService,
        useValue: {
          pendingIds: signal(new Set<string>()),
          setArchived: archive,
          deleteUnused: remove,
        },
      },
      {
        provide: ArticleMediaCleanupService,
        useValue: { status: signal(null), error: signal(null), retry: cleanup },
      },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new CatalogComponent());
  return {
    component,
    workspace,
    confirm,
    archive,
    remove,
    reload,
    cleanup,
    items,
    products,
    queryParams,
    positions,
    navigate,
  };
}

describe('Artikelaktionen', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('zeigt archivierte Stammartikel und Einzelstücke nur im Archiv, auch bei passender Suche', () => {
    const { component, products, items, queryParams } = setup();
    products.set([
      {
        id: 'active-product',
        workspace_id: 'own',
        title: 'Kamera aktiv',
        tracking_mode: 'quantity',
        is_public_store: false,
      },
      {
        id: 'archived-product',
        workspace_id: 'own',
        title: 'Kamera archiviert',
        tracking_mode: 'quantity',
        is_public_store: false,
        archived_at: '2026-10-13',
      },
    ]);
    const item: InventoryItem = {
      id: 'active-item',
      workspace_id: 'own',
      title: 'Kamera Einzelstück',
      condition: 'used',
      status: 'ready',
      sale_state: 'no_active_sale',
      allocated_purchase_cost: 20,
    };
    items.set([item, { ...item, id: 'archived-item', archived_at: '2026-10-13' }]);
    component.searchControl.setValue('Kamera');

    expect(
      component
        .filteredProducts()
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(['active-item', 'active-product']);
    queryParams.next(convertToParamMap({ view: 'archive' }));
    expect(
      component
        .filteredProducts()
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(['archived-item', 'archived-product']);
    queryParams.next(convertToParamMap({ view: 'stock' }));
    expect(component.filteredProducts().map((entry) => entry.id)).toEqual(['active-item']);
    items.set([{ ...item, archived_at: '2026-10-13' }]);
    expect(component.filteredProducts()).toEqual([]);
    queryParams.next(convertToParamMap({}));
    expect(component.filteredProducts().map((entry) => entry.id)).toEqual(['active-product']);
  });

  it('zeigt Auf Lager als Status und hält reservierte Stücke vom Verkauf ausgeschlossen', () => {
    const { component, items } = setup();
    const item: InventoryItem = {
      id: 'reserved',
      workspace_id: 'own',
      title: 'Kamera',
      condition: 'used',
      status: 'reserved',
      sale_state: 'no_active_sale',
      allocated_purchase_cost: 20,
    };
    items.set([item]);
    const reserved = component.overview()[0];
    expect(reserved.onHand).toBe(1);
    expect(reserved.available).toBe(0);
    expect(component.statusLabel(reserved)).toBe('Reserviert');
    expect(component.canSell(reserved)).toBe(false);
    expect(component.statusLabel(row)).toBe('Auf Lager');
  });

  it('nennt Bestand und Wert vor der Archivierung und lädt die Tabelle danach neu', async () => {
    const { component, confirm, archive, reload } = setup();
    await component.setArchived(row);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        titel: 'Artikel archivieren?',
        text: expect.stringContaining('3 Stück Bestand'),
      }),
    );
    expect(confirm.mock.calls[0]?.[0].text).toContain('45,00');
    expect(archive).toHaveBeenCalledWith('own', 'catalog', 'product', true);
    expect(reload).toHaveBeenCalledTimes(4);
    expect(component.actionMessage()).toBe('Artikel archiviert.');
  });

  it('zeigt einen Fehler und lässt den Artikel ohne Erfolgsmeldung stehen', async () => {
    const { component, archive } = setup();
    archive.mockRejectedValueOnce(new Error('Reservierung offen'));
    await component.setArchived(row);
    expect(component.actionError()).toBe('Reservierung offen');
    expect(component.actionMessage()).toBeNull();
  });

  it('ignoriert eine verspätete Antwort nach einem Workspacewechsel', async () => {
    const { component, archive, workspace, reload } = setup();
    let finish!: () => void;
    archive.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const pending = component.setArchived(row);
    await Promise.resolve();
    workspace.set({ id: 'other' });
    finish();
    await pending;
    expect(reload).not.toHaveBeenCalled();
    expect(component.actionMessage()).toBeNull();
  });

  it('bietet Löschen nur für wahrscheinliche Fehleingaben an und startet die Bildbereinigung', async () => {
    const { component, remove, cleanup } = setup();
    await component.deleteUnused(row);
    expect(remove).not.toHaveBeenCalled();
    await component.deleteUnused({ ...row, canOfferDelete: true });
    expect(remove).toHaveBeenCalledWith('own', 'catalog', 'product');
    expect(cleanup).toHaveBeenCalledWith('own');
  });

  it.each(['catalog', 'item'] as const)(
    'entfernt einen bestätigten %s-Artikel aus der Liste ohne erneuten Ladezustand',
    async (kind) => {
      const { component, products, items, remove, reload } = setup();
      const product: CatalogProduct = {
        id: row.id,
        workspace_id: 'own',
        title: row.title,
        tracking_mode: 'quantity',
        is_public_store: false,
      };
      const item: InventoryItem = {
        id: row.id,
        workspace_id: 'own',
        title: row.title,
        condition: 'used',
        status: 'ready',
        allocated_purchase_cost: 0,
      };
      const sibling = { ...product, id: 'sibling', title: 'Weitere Kamera' };
      const otherItem = { ...item, id: 'other-item', title: 'Anderes Einzelstück' };
      products.set([product, sibling]);
      items.set([item, otherItem]);
      component.searchControl.setValue('Kamera');
      let finish!: () => void;
      remove.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));

      const deleting = component.deleteUnused({ ...row, kind, canOfferDelete: true });
      await Promise.resolve();
      expect(products()).toContain(product);
      expect(items()).toContain(item);
      finish();
      await deleting;

      expect(products()).toEqual(kind === 'catalog' ? [sibling] : [product, sibling]);
      expect(items()).toEqual(kind === 'item' ? [otherItem] : [item, otherItem]);
      expect(component.filteredProducts().some((entry) => entry.key === `${kind}:${row.id}`)).toBe(
        false,
      );
      expect(component.searchControl.value).toBe('Kamera');
      expect(component.actionMessage()).toBe('Artikel gelöscht.');
      expect(reload).not.toHaveBeenCalled();
    },
  );

  it('behält einen Artikel bei abgelehntem Löschen und lädt die Liste nicht neu', async () => {
    const { component, products, remove, reload } = setup();
    const product: CatalogProduct = {
      id: row.id,
      workspace_id: 'own',
      title: row.title,
      tracking_mode: 'quantity',
      is_public_store: false,
    };
    products.set([product]);
    remove.mockRejectedValueOnce(new Error('Artikel wird noch verwendet.'));

    await component.deleteUnused({ ...row, canOfferDelete: true });

    expect(products()).toEqual([product]);
    expect(component.actionError()).toBe('Artikel wird noch verwendet.');
    expect(component.actionMessage()).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('ändert nach einem Workspacewechsel keine Liste durch eine verspätete Löschantwort', async () => {
    const { component, products, remove, workspace, reload, cleanup } = setup();
    const product: CatalogProduct = {
      id: row.id,
      workspace_id: 'other',
      title: 'Artikel des anderen Workspace',
      tracking_mode: 'quantity',
      is_public_store: false,
    };
    let finish!: () => void;
    remove.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    const deleting = component.deleteUnused({ ...row, canOfferDelete: true });
    await Promise.resolve();
    workspace.set({ id: 'other' });
    products.set([product]);
    finish();
    await deleting;

    expect(products()).toEqual([product]);
    expect(component.actionMessage()).toBeNull();
    expect(cleanup).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('führt verkaufbare Einzelstücke zum vorbelegten Verkaufsformular', () => {
    const { component, items, navigate } = setup();
    items.set([
      {
        id: 'item-1',
        workspace_id: 'own',
        title: 'Controller',
        condition: 'used',
        status: 'ready',
        allocated_purchase_cost: 20,
        sale_state: 'no_active_sale',
      },
    ]);
    const itemRow = {
      ...row,
      key: 'item:item-1',
      id: 'item-1',
      kind: 'item' as const,
      title: 'Controller',
      available: 1,
    };

    expect(component.canSell(itemRow)).toBe(true);
    component.openSale(itemRow);
    expect(navigate).toHaveBeenCalledWith(['/sales/new'], {
      state: {
        saleTarget: { kind: 'inventory_item', inventoryItemId: 'item-1', title: 'Controller' },
        returnUrl: '/catalog?view=stock',
      },
    });
    expect(component.canSell({ ...itemRow, archivedAt: '2026-09-24T00:00:00Z' })).toBe(false);
  });
});
