import '@angular/compiler';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, ItemStatus } from '../../core/models/flipbase.models';
import { InventoryService } from '../../core/services/inventory.service';
import { StockService } from '../../core/services/stock.service';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { InventoryComponent } from './inventory.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

const artikel: InventoryItem = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: '11111111-1111-4111-8111-111111111111',
  purchase_id: null,
  title: 'Testartikel',
  condition: 'used',
  status: 'received',
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
  };
  const komponente = Object.create(InventoryComponent.prototype) as InventoryComponent;
  Object.assign(komponente, { inventoryService, toast, syncStatus });

  return { komponente, inventoryService, syncStatus, toast };
}

function klickEvent(): Event {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as Event;
}

describe('InventoryComponent – Aktionsmeldungen', () => {
  it('verwendet eine gemeinsame Ansicht ohne Bestand- und Einzelstück-Tabs', () => {
    const template = readFileSync('src/app/features/inventory/inventory.component.html', 'utf8');

    expect(template).not.toContain('role="tablist"');
    expect(template).not.toContain('activeTab');
    expect(template).toContain('[individualItems]="filteredItems()"');
    expect(template).toContain('[positions]="filteredStockPositions()"');
    expect(template).toContain('Altdaten prüfen');
  });

  it('zählt im gefilterten Bestand nur zentral verkaufbare Einzelstücke', () => {
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
        { provide: InventoryService, useValue: { items } },
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
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ConfirmDialogService, useValue: { frage: vi.fn() } },
        { provide: WorkspaceService, useValue: { currentWorkspace: signal(null) } },
        { provide: SyncStatusService, useValue: new SyncStatusService() },
        { provide: ToastService, useValue: new ToastService() },
      ],
    });

    const komponente = TestBed.runInInjectionContext(() => new InventoryComponent());

    expect(komponente.filteredUnitCount()).toBe(7);
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

  it('bestätigt die Rücknahme eines ungeklärten Altartikels und verlangt einen Grund', async () => {
    const { komponente, inventoryService, toast } = erstelleKomponente({ error: null });
    const resolveLegacySoldItem = vi.fn(async () => ({ error: null }));
    Object.assign(inventoryService, { resolveLegacySoldItem });
    Object.assign(komponente, { dialog: { frage: vi.fn(async () => true) } });
    const legacy = {
      ...artikel,
      status: 'sold' as const,
      sale_state: 'legacy_sold_unverified' as const,
    };

    await komponente.onRestoreLegacyItem({ item: legacy, reason: 'Historischer Verkauf fehlt' });

    expect(resolveLegacySoldItem).toHaveBeenCalledWith(legacy.id, 'Historischer Verkauf fehlt');
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

    expect(navigate).toHaveBeenCalledWith(['/sales'], {
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
      },
    });
  });
});
