import '@angular/compiler';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  InventoryItem,
  ItemStatus,
  Purchase,
  Sale,
  StockLot,
  StockMovement,
  StockPosition,
} from '../../core/models/flipbase.models';
import { InventoryService } from '../../core/services/inventory.service';
import { StockService } from '../../core/services/stock.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { SalesService } from '../../core/services/sales.service';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { InventoryComponent } from './inventory.component';
import { CatalogService } from '../../core/services/catalog.service';
import { MediaService } from '../../core/services/media.service';

const artikel: InventoryItem = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: '11111111-1111-4111-8111-111111111111',
  purchase_id: null,
  title: 'Testartikel',
  condition: 'used',
  status: 'received',
  sale_state: 'no_active_sale',
  is_public_store: false,
  allocated_purchase_cost: 10,
  created_at: '2026-08-24T10:00:00.000Z',
};

function erstelleKomponente(ergebnis: { readonly error: Error | null }) {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const inventoryService = {
    items: signal<InventoryItem[]>([{ ...artikel }]),
    updateItemStatus: vi.fn(async (_id: string, _status: ItemStatus) => ergebnis),
    updateItem: vi.fn(async () => ergebnis),
    resolveLegacySoldItem: vi.fn(async () => ergebnis),
  };
  const dialog = { frage: vi.fn(async () => true) };
  const komponente = Object.create(InventoryComponent.prototype) as InventoryComponent;
  Object.assign(komponente, { inventoryService, toast, syncStatus, dialog });

  return { komponente, inventoryService, dialog, syncStatus, toast };
}

function klickEvent(): Event {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as Event;
}

function erstelleInventarAnsicht(input: {
  items?: InventoryItem[];
  positions?: StockPosition[];
  lots?: StockLot[];
  movements?: StockMovement[];
  purchases?: Purchase[];
  sales?: Sale[];
  inventoryLoading?: boolean;
}): InventoryComponent {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: CatalogService,
        useValue: {
          imageUrls: signal({ 'catalog-one': 'catalog-image.webp' }),
          loadProducts: vi.fn(),
          invalidateProductImage: vi.fn(),
        },
      },
      {
        provide: MediaService,
        useValue: {
          getMediaUrl: vi.fn((path: string) => `media:${path}`),
          reportMediaFailure: vi.fn(),
        },
      },
      {
        provide: InventoryService,
        useValue: {
          items: signal(input.items ?? []),
          loadedWorkspaceId: signal(artikel.workspace_id),
          isLoading: signal(input.inventoryLoading ?? false),
          loadError: signal(null),
          loadInventory: vi.fn(async () => undefined),
        },
      },
      {
        provide: StockService,
        useValue: {
          positions: signal(input.positions ?? []),
          lots: signal(input.lots ?? []),
          movements: signal(input.movements ?? []),
          loadedWorkspaceId: signal(artikel.workspace_id),
          isLoading: signal(false),
          loadError: signal(null),
          loadPositions: vi.fn(async () => undefined),
        },
      },
      {
        provide: PurchaseService,
        useValue: {
          purchases: signal(input.purchases ?? []),
          loadedWorkspaceId: signal(artikel.workspace_id),
          isLoading: signal(false),
          loadError: signal(null),
          loadPurchases: vi.fn(async () => undefined),
        },
      },
      {
        provide: SalesService,
        useValue: {
          sales: signal(input.sales ?? []),
          loadedWorkspaceId: signal(artikel.workspace_id),
          isLoading: signal(false),
          loadError: signal(null),
          loadSales: vi.fn(async () => undefined),
        },
      },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: ConfirmDialogService, useValue: { frage: vi.fn() } },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: artikel.workspace_id }) },
      },
      { provide: SyncStatusService, useValue: new SyncStatusService() },
      { provide: ToastService, useValue: new ToastService() },
    ],
  });
  return TestBed.runInInjectionContext(() => new InventoryComponent());
}

describe('InventoryComponent – Aktionsmeldungen', () => {
  it('zeigt echte Stückbilder neben Katalogbildern und behandelt Fehler am passenden Bild', () => {
    const component = erstelleInventarAnsicht({
      items: [
        {
          ...artikel,
          media: [
            {
              id: 'secondary',
              inventory_item_id: artikel.id,
              is_primary: false,
              storage_path: 'secondary.webp',
            },
            {
              id: 'primary',
              inventory_item_id: artikel.id,
              is_primary: true,
              storage_path: 'primary.webp',
            },
          ],
        },
      ],
    });
    expect(component.imageUrls()).toEqual({
      'catalog-one': 'catalog-image.webp',
      [artikel.id]: 'media:primary.webp',
    });
    component.onImageFailed(artikel.id);
    expect(TestBed.inject(MediaService).reportMediaFailure).toHaveBeenCalledWith('primary.webp');
    component.onImageFailed('catalog-one');
    expect(TestBed.inject(CatalogService).invalidateProductImage).toHaveBeenCalledWith(
      'catalog-one',
    );
  });
  it('stellt Suche und Filter beim erneuten Öffnen der Liste wieder her', () => {
    const component = erstelleInventarAnsicht({
      items: [{ ...artikel, title: 'Tasse', status: 'ready' }],
    });
    component.searchQuery.set('Tasse');
    component.filtersExpanded.set(true);
    component.selectedStatus.set('available');
    component.selectedCondition.set('used');
    const reopened = TestBed.runInInjectionContext(() => new InventoryComponent());
    expect(reopened.searchQuery()).toBe('Tasse');
    expect(reopened.filtersExpanded()).toBe(true);
    expect(reopened.selectedStatus()).toBe('available');
    expect(reopened.selectedCondition()).toBe('used');
    expect(reopened.activeFilterCount()).toBe(2);
    expect(reopened.filteredItems().map((item) => item.title)).toEqual(['Tasse']);
  });

  it('zeigt zuerst anwesende Ware und Konflikte und macht Verkäufe gesondert zugänglich', () => {
    const component = erstelleInventarAnsicht({
      items: [
        { ...artikel, id: 'ready', status: 'ready' },
        { ...artikel, id: 'reserved', status: 'reserved' },
        { ...artikel, id: 'sold', status: 'sold', sale_state: 'sold' },
        { ...artikel, id: 'conflict', status: 'ready', sale_state: 'sale_status_conflict' },
        { ...artikel, id: 'retired', status: 'archived' },
      ],
    });
    const ids = () =>
      component
        .filteredPresentationRows()
        .map((row) => row.actionId)
        .sort();
    expect(ids()).toEqual(['conflict', 'ready', 'reserved']);
    expect(component.filteredUnitCount()).toBeNull();
    component.setStockView('sold');
    expect(ids()).toEqual(['conflict', 'sold']);
    component.setStockView('all');
    expect(ids()).toEqual(['conflict', 'ready', 'reserved', 'retired', 'sold']);
    component.resetView();
    expect(component.stockView()).toBe('stock');
    expect(ids()).toEqual(['conflict', 'ready', 'reserved']);
  });

  it('erhält Archiv und Etikettenauswahl und summiert nur physisch anwesende Ware', () => {
    const component = erstelleInventarAnsicht({
      items: [
        { ...artikel, id: 'ready', status: 'ready' },
        { ...artikel, id: 'received' },
        { ...artikel, id: 'sold', status: 'sold', sale_state: 'sold' },
        {
          ...artikel,
          id: 'archived',
          status: 'sold',
          sale_state: 'sold',
          archived_at: '2026-09-01',
        },
      ],
    });
    expect(component.filteredUnitCount()).toBe(2);
    component.toggleSelectAll();
    expect(
      component
        .itemsToPrint()
        .map((item) => item.id)
        .sort(),
    ).toEqual(['ready', 'received']);
    component.setStockView('sold');
    expect(component.selectedItemIds().size).toBe(0);
    expect(component.filteredUnitCount()).toBe(0);
    component.archiveView.set('archive');
    expect(component.filteredItems().map((item) => item.id)).toEqual(['archived']);
  });

  it('öffnet die Einkaufserfassung', () => {
    const navigate = vi.fn();
    const komponente = Object.create(InventoryComponent.prototype) as InventoryComponent;
    Object.assign(komponente, { router: { navigate } });

    komponente.openCreatePage();

    expect(navigate).toHaveBeenCalledWith(['/purchases/new']);
  });

  it('verwendet eine gemeinsame Ansicht ohne Bestand- und Einzelstück-Tabs', () => {
    const template = readFileSync('src/app/features/inventory/inventory.component.html', 'utf8');

    expect(template).not.toContain('role="tablist"');
    expect(template).not.toContain('activeTab');
    expect(template).toContain('[presentationRows]="filteredPresentationRows()"');
    expect(template).toContain('Weitere Filter');
    expect(template).not.toContain('Altdaten prüfen');
    expect(template).toContain('inventoryPresentation().sourceState');
    expect(template).toContain('link="/purchases/new"');
    expect(template).toContain('title="Artikel"');
    expect(template).toContain('subtitle="Bestand"');
  });

  it('lädt bei Wiederholung alle Inventarquellen neu', async () => {
    const loadInventory = vi.fn(async () => undefined);
    const loadPositions = vi.fn(async () => undefined);
    const loadPurchases = vi.fn(async () => undefined);
    const loadSales = vi.fn(async () => undefined);
    const komponente = Object.create(InventoryComponent.prototype) as InventoryComponent;
    Object.assign(komponente, {
      workspaceService: { currentWorkspace: signal({ id: artikel.workspace_id }) },
      inventoryService: { loadInventory },
      stockService: { loadPositions },
      purchaseService: { loadPurchases },
      salesService: { loadSales },
    });

    await komponente.reloadInventorySources();

    expect(loadInventory).toHaveBeenCalledWith(artikel.workspace_id);
    expect(loadPositions).toHaveBeenCalledWith(artikel.workspace_id);
    expect(loadPurchases).toHaveBeenCalledWith(artikel.workspace_id);
    expect(loadSales).toHaveBeenCalledWith(artikel.workspace_id);
  });

  it('zählt vorhandene und verkaufte Einheiten in der gemeinsamen Ansicht', () => {
    const items = signal<InventoryItem[]>([
      { ...artikel, id: 'ready', status: 'ready', sale_state: 'no_active_sale' },
      { ...artikel, id: 'listed', status: 'listed', sale_state: 'no_active_sale' },
      { ...artikel, id: 'sold', status: 'sold', sale_state: 'sold' },
      { ...artikel, id: 'legacy', status: 'sold', sale_state: 'legacy_sold_unverified' },
      {
        ...artikel,
        id: 'header-without-line',
        status: 'sold',
        sale_state: 'legacy_sale_header_without_line',
      },
      {
        ...artikel,
        id: 'multiple-sales',
        status: 'sold',
        sale_state: 'multiple_active_sales',
      },
      {
        ...artikel,
        id: 'status-conflict',
        status: 'ready',
        sale_state: 'sale_status_conflict',
      },
    ]);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: InventoryService,
          useValue: {
            items,
            loadedWorkspaceId: signal(artikel.workspace_id),
            isLoading: signal(false),
            loadError: signal(null),
          },
        },
        {
          provide: StockService,
          useValue: {
            positions: signal([
              {
                catalog_product_id: 'catalog-1',
                title: 'Mengenartikel',
                available_quantity: 5,
                reserved_quantity: 0,
                on_hand_quantity: 5,
                oldest_available_unit_cost: 2,
                is_public_store: false,
              },
            ]),
            loadPositions: vi.fn(),
            lots: signal([
              {
                id: 'sold-lot',
                workspace_id: artikel.workspace_id,
                purchase_id: 'sold-purchase',
                purchase_line_id: 'sold-purchase-line',
                catalog_product_id: 'catalog-sold',
                received_quantity: 2,
                remaining_quantity: 0,
                unit_cost: 5,
                received_at: '2026-08-01T10:00:00.000Z',
                catalog_product: {
                  id: 'catalog-sold',
                  title: 'Ausverkaufte Test-Tassen',
                  is_public_store: false,
                },
              },
            ]),
            movements: signal([
              {
                id: 'sold-movement',
                workspace_id: artikel.workspace_id,
                stock_lot_id: 'sold-lot',
                direction: 'out',
                quantity: 2,
                reason: 'sale',
              },
            ]),
            loadedWorkspaceId: signal(artikel.workspace_id),
            isLoading: signal(false),
            loadError: signal(null),
          },
        },
        {
          provide: PurchaseService,
          useValue: {
            purchases: signal([
              {
                id: 'sold-purchase',
                workspace_id: artikel.workspace_id,
                type: 'single',
                title: 'Tassen-Einkauf',
                purchase_date: '2026-08-01',
                purchase_price: 10,
                cost_allocation_mode: 'manual',
                entry_status: 'finalized',
                finalized_at: '2026-08-01T12:00:00.000Z',
              },
            ]),
            loadedWorkspaceId: signal(artikel.workspace_id),
            isLoading: signal(false),
            loadError: signal(null),
          },
        },
        {
          provide: SalesService,
          useValue: {
            sales: signal([]),
            loadedWorkspaceId: signal(artikel.workspace_id),
            isLoading: signal(false),
            loadError: signal(null),
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ConfirmDialogService, useValue: { frage: vi.fn() } },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal({ id: artikel.workspace_id }) },
        },
        { provide: SyncStatusService, useValue: new SyncStatusService() },
        { provide: ToastService, useValue: new ToastService() },
      ],
    });

    const komponente = TestBed.runInInjectionContext(() => new InventoryComponent());

    expect(komponente.filteredUnitCount()).toBeNull();
    komponente.selectedStatus.set('sold');
    expect(komponente.filteredPresentationRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'quantity:catalog-sold',
          title: 'Ausverkaufte Test-Tassen',
        }),
      ]),
    );
  });

  it('berechnet den Bestandswert ausschließlich aus den sichtbaren Such- und Filterergebnissen', () => {
    const komponente = erstelleInventarAnsicht({
      items: [
        {
          ...artikel,
          id: 'alpha',
          title: 'Alpha-Tasse',
          status: 'ready',
          allocated_purchase_cost: 10,
        },
        {
          ...artikel,
          id: 'beta',
          title: 'Beta-Teller',
          status: 'listed',
          allocated_purchase_cost: 20,
        },
        {
          ...artikel,
          id: 'open',
          title: 'Offene Kosten',
          status: 'ready',
          allocated_purchase_cost: 0,
        },
      ],
    });
    const filteredValue = () =>
      (
        komponente as InventoryComponent & {
          filteredInventoryValue?: () => { kind: string; amount?: number };
        }
      ).filteredInventoryValue?.();

    komponente.searchQuery.set('Alpha');
    expect(komponente.filteredPresentationRows().map((row) => row.id)).toEqual([
      'individual:alpha',
    ]);
    expect(filteredValue()).toEqual({ kind: 'known', amount: 10 });

    komponente.searchQuery.set('');
    komponente.selectedStatus.set('listed');
    expect(komponente.filteredPresentationRows().map((row) => row.id)).toEqual(['individual:beta']);
    expect(filteredValue()).toEqual({ kind: 'known', amount: 20 });

    komponente.selectedStatus.set('all');
    komponente.searchQuery.set('Offene');
    expect(filteredValue()).toEqual({ kind: 'open' });

    const loading = erstelleInventarAnsicht({ inventoryLoading: true });
    const loadingValue = (
      loading as InventoryComponent & {
        filteredInventoryValue?: () => { kind: string; amount?: number };
      }
    ).filteredInventoryValue?.();
    expect(loadingValue).toEqual({ kind: 'open' });
  });

  it('filtert Mengenware anhand ihrer verfügbaren, reservierten und verkauften Mengen', () => {
    const purchases: Purchase[] = [
      {
        id: 'purchase-filter',
        workspace_id: artikel.workspace_id,
        type: 'single',
        title: 'Filter-Einkauf',
        purchase_date: '2026-08-01',
        purchase_price: 18,
        cost_allocation_mode: 'manual',
        entry_status: 'finalized',
        finalized_at: '2026-08-01T12:00:00.000Z',
      },
    ];
    const positions: StockPosition[] = [
      {
        catalog_product_id: 'fully-reserved',
        title: 'Voll reserviert',
        available_quantity: 0,
        reserved_quantity: 2,
        on_hand_quantity: 2,
        oldest_available_unit_cost: 4,
        is_public_store: false,
      },
      {
        catalog_product_id: 'partly-sold',
        title: 'Teilverkauft',
        available_quantity: 2,
        reserved_quantity: 0,
        on_hand_quantity: 2,
        oldest_available_unit_cost: 5,
        is_public_store: false,
      },
    ];
    const lots: StockLot[] = [
      {
        id: 'lot-reserved-filter',
        workspace_id: artikel.workspace_id,
        purchase_id: 'purchase-filter',
        purchase_line_id: 'line-reserved-filter',
        catalog_product_id: 'fully-reserved',
        received_quantity: 2,
        remaining_quantity: 2,
        unit_cost: 4,
        received_at: '2026-08-01T13:00:00.000Z',
      },
      {
        id: 'lot-sold-filter',
        workspace_id: artikel.workspace_id,
        purchase_id: 'purchase-filter',
        purchase_line_id: 'line-sold-filter',
        catalog_product_id: 'partly-sold',
        received_quantity: 3,
        remaining_quantity: 2,
        unit_cost: 5,
        received_at: '2026-08-01T13:00:00.000Z',
      },
    ];
    const movements: StockMovement[] = [
      {
        id: 'movement-reserved-filter',
        workspace_id: artikel.workspace_id,
        stock_lot_id: 'lot-reserved-filter',
        direction: 'out',
        quantity: 2,
        reason: 'reservation',
        created_at: '2026-08-02T10:00:00.000Z',
      },
      {
        id: 'movement-sold-filter',
        workspace_id: artikel.workspace_id,
        stock_lot_id: 'lot-sold-filter',
        direction: 'out',
        quantity: 1,
        reason: 'sale',
        created_at: '2026-08-02T10:00:00.000Z',
      },
    ];
    const komponente = erstelleInventarAnsicht({ positions, lots, movements, purchases });

    komponente.selectedStatus.set('available');
    expect(komponente.filteredPresentationRows().map((row) => row.id)).toEqual([
      'quantity:partly-sold',
    ]);

    komponente.selectedStatus.set('sold');
    expect(komponente.filteredPresentationRows().map((row) => row.id)).toEqual([
      'quantity:partly-sold',
    ]);

    komponente.selectedStatus.set('reserved');
    expect(komponente.filteredPresentationRows().map((row) => row.id)).toEqual([
      'quantity:fully-reserved',
    ]);
  });

  it('bestätigt einen erfolgreichen Statuswechsel', async () => {
    const { komponente, toast } = erstelleKomponente({ error: null });

    await komponente.onChangeItemStatus({ ...artikel }, 'ready');

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikelstatus wurde geändert.',
    });
  });

  it('bestätigt eine erfolgreiche Shop-Freigabe', async () => {
    const { komponente, toast } = erstelleKomponente({ error: null });

    await komponente.onTogglePublicStore({ ...artikel }, klickEvent());

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde im Shop veröffentlicht.',
    });
  });

  it('meldet das Entfernen aus dem Shop', async () => {
    const { komponente, toast } = erstelleKomponente({ error: null });

    await komponente.onTogglePublicStore({ ...artikel, is_public_store: true }, klickEvent());

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde aus dem Shop entfernt.',
    });
  });

  it('behält die Shop-Freigabe bei einem lokalen Fehler bei und meldet ihn persistent', async () => {
    const fehler = new Error('Freigabe nicht möglich');
    const { komponente, toast } = erstelleKomponente({ error: fehler });
    const unveroeffentlicht = { ...artikel };

    await komponente.onTogglePublicStore(unveroeffentlicht, klickEvent());

    expect(unveroeffentlicht.is_public_store).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Shop-Freigabe konnte nicht geändert werden.',
      description: fehler.message,
      persistent: true,
    });
  });

  it('erzeugt bei einem bereits zentral gemeldeten Statusfehler keinen zweiten Toast', async () => {
    const { komponente, inventoryService, syncStatus, toast } = erstelleKomponente({
      error: null,
    });
    inventoryService.updateItemStatus.mockImplementation(async () => ({
      error: syncStatus.melde('Aktualisieren des Artikelstatus', new Error('offline')),
    }));

    await komponente.onChangeItemStatus({ ...artikel }, 'ready');

    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toEqual([]);
  });

  it('meldet einen lokalen Fehler trotz gleichlautendem zentralen Fehlertext', async () => {
    const { komponente, inventoryService, syncStatus, toast } = erstelleKomponente({
      error: null,
    });
    const zentralerFehler = syncStatus.melde(
      'Aktualisieren des Artikelstatus',
      new Error('offline'),
    );
    inventoryService.updateItemStatus.mockResolvedValue({
      error: new Error(zentralerFehler.message),
    });

    await komponente.onChangeItemStatus({ ...artikel }, 'ready');

    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Artikelstatus konnte nicht geändert werden.',
      description: zentralerFehler.message,
      persistent: true,
    });
  });

  it('nimmt einen ungeklärten Artikel nur nach Bestätigung wieder in den Bestand auf', async () => {
    const { komponente, inventoryService, dialog, toast } = erstelleKomponente({ error: null });
    const legacy = {
      ...artikel,
      status: 'sold' as const,
      sale_state: 'legacy_sold_unverified' as const,
    };
    dialog.frage.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await komponente.onRestoreLegacyItem(legacy);

    expect(inventoryService.resolveLegacySoldItem).not.toHaveBeenCalled();

    await komponente.onRestoreLegacyItem(legacy);

    expect(dialog.frage).toHaveBeenCalledWith(
      expect.objectContaining({
        titel: 'Artikel wieder in Bestand nehmen?',
        bestaetigenText: 'Artikel ist noch vorhanden',
      }),
    );
    expect(inventoryService.resolveLegacySoldItem).toHaveBeenCalledWith(legacy.id);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde wieder in den Bestand aufgenommen.',
    });
  });

  it('kennzeichnet Verkauf nachtragen ausdrücklich als Legacy-Abgleich im Route-State', async () => {
    const navigate = vi.fn(async () => true);
    const komponente = Object.create(InventoryComponent.prototype) as InventoryComponent;
    Object.assign(komponente, { router: { navigate } });
    const legacy = {
      ...artikel,
      status: 'sold' as const,
      sale_state: 'legacy_sold_unverified' as const,
    };

    komponente.openLegacySaleReconciliation(legacy);

    expect(navigate).toHaveBeenCalledWith(['/sales/new'], {
      state: {
        legacyReconciliation: {
          kind: 'legacy_sold_unverified',
          inventoryItemId: artikel.id,
        },
        saleTarget: {
          kind: 'inventory_item',
          inventoryItemId: legacy.id,
          title: legacy.title,
        },
        returnUrl: '/inventory',
      },
    });
  });
});
