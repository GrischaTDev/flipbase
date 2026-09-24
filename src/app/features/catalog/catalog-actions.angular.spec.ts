import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../../core/services/catalog.service';
import type { InventoryItem, StockPosition } from '../../core/models/flipbase.models';
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
  const positions = signal<StockPosition[]>([]);
  const navigate = vi.fn().mockResolvedValue(true);
  const routeParams = convertToParamMap({});
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: routeParams }, queryParamMap: of(routeParams) },
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
          products: empty,
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
    positions,
    navigate,
  };
}

describe('Artikelaktionen', () => {
  afterEach(() => TestBed.resetTestingModule());
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
