import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { provideRouter } from '@angular/router';
import localeDe from '@angular/common/locales/de';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InventoryItem,
  StockLot,
  StockMovement,
  StockPosition,
} from '../../../../core/models/flipbase.models';
import { StockPositionListComponent } from './stock-position-list.component';
beforeAll(async () => {
  registerLocaleData(localeDe);
  const resources: Record<string, string> = {
    './stock-position-list.component.html':
      'src/app/features/inventory/components/stock-position-list/stock-position-list.component.html',
  };
  await ɵresolveComponentResources((url) => {
    const resource = resources[url];
    if (!resource) throw new Error(`Unbekannte Test-Ressource: ${url}`);
    return readFile(resolve(resource), 'utf8');
  });
});
beforeEach(() => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [StockPositionListComponent],
    providers: [provideRouter([])],
  });
});

function createList(
  positions: readonly StockPosition[],
  individualItems: readonly InventoryItem[] = [],
  lots: readonly StockLot[] = [],
  movements: readonly StockMovement[] = [],
) {
  const fixture = TestBed.createComponent(StockPositionListComponent);

  Object.assign(fixture.componentInstance, {
    positions: signal(positions),
    individualItems: signal(individualItems),
    lots: signal(lots),
    movements: signal(movements),
    selectedItemIds: signal<ReadonlySet<string>>(new Set()),
  });
  fixture.detectChanges();
  return fixture;
}

const ledLampe: StockPosition = {
  catalog_product_id: 'catalog-led-lamp',
  title: 'LED Schreibtischlampe',
  available_quantity: 3,
  reserved_quantity: 0,
  on_hand_quantity: 3,
  oldest_available_unit_cost: 4.5,
  is_public_store: true,
};

const einzelstueck: InventoryItem = {
  id: 'inventory-mystery-1',
  workspace_id: 'workspace-1',
  title: 'Mystery-Fundstück',
  condition: 'used',
  status: 'ready',
  sale_state: 'no_active_sale',
  allocated_purchase_cost: 12,
  total_item_cost: 12,
  is_public_store: false,
};

const lot = (id: string, receivedAt: string, unitCost: number): StockLot => ({
  id,
  workspace_id: 'workspace-1',
  purchase_id: `purchase-${id}`,
  purchase_line_id: `line-${id}`,
  catalog_product_id: ledLampe.catalog_product_id,
  received_quantity: 1,
  remaining_quantity: 1,
  unit_cost: unitCost,
  received_at: receivedAt,
});

describe('StockPositionListComponent', () => {
  it('zeigt Mengenposition fünf und Einzelstück eins in derselben Inventartabelle', () => {
    const fixture = createList(
      [{ ...ledLampe, available_quantity: 5, on_hand_quantity: 5 }],
      [einzelstueck],
    );
    const table = fixture.nativeElement.querySelector('[data-unified-inventory-table]');

    expect(table).not.toBeNull();
    expect(table.querySelector('[data-stock-row]')?.textContent).toContain('5 Stück');
    expect(table.querySelector('[data-individual-row]')?.textContent).toContain('1 Stück');
  });

  it('zeigt aggregierte Stückzahlen statt der Anzahl von Datenzeilen', () => {
    const fixture = createList(
      [
        ledLampe,
        {
          ...ledLampe,
          available_quantity: 5,
          on_hand_quantity: 5,
          oldest_available_unit_cost: 5.2,
        },
      ],
      [einzelstueck],
    );

    const host = fixture.nativeElement as HTMLElement;
    const rows = Array.from(
      host.querySelectorAll<HTMLElement>('[data-unified-inventory-table] [data-stock-row]'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('LED Schreibtischlampe');
    expect(rows[0].textContent).toContain('8 Stück verfügbar');
    expect(rows[0].textContent).toContain('8 Stück im Bestand');
  });

  it('erhält Details, Verkauf, Auswahl, Etiketten, Store und Status für Einzelstücke', () => {
    const fixture = createList([], [einzelstueck]);

    const host = fixture.nativeElement as HTMLElement;
    const rows = Array.from(
      host.querySelectorAll<HTMLElement>('[data-unified-inventory-table] [data-individual-row]'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Mystery-Fundstück');
    expect(rows[0].textContent).toContain('1 Stück verfügbar');
    expect(rows[0].querySelector('[data-item-details]')).not.toBeNull();
    expect(rows[0].querySelector('[data-item-select]')).not.toBeNull();
    expect(rows[0].querySelector('[data-item-label]')).not.toBeNull();
    expect(rows[0].querySelector('[data-item-store-toggle]')).not.toBeNull();
    expect(rows[0].querySelector('[data-item-status]')).not.toBeNull();
    expect(rows[0].querySelector('[data-item-sell]')).not.toBeNull();
  });

  it('verwendet für den ältesten EK das älteste verfügbare Los statt des günstigsten', () => {
    const fixture = createList(
      [{ ...ledLampe, available_quantity: 2, on_hand_quantity: 2, oldest_available_unit_cost: 5 }],
      [],
      [lot('old', '2026-08-01T09:00:00.000Z', 10), lot('new', '2026-08-20T09:00:00.000Z', 5)],
    );

    const row = fixture.nativeElement.querySelector('table [data-stock-row]');

    expect(row.textContent).toContain('10,00 €');
  });

  it('nennt die aufklappbare Herkunft Wareneingänge und Einstandskosten', () => {
    const fixture = createList([ledLampe], [], [lot('old', '2026-08-01T09:00:00.000Z', 10)]);

    const toggle = fixture.nativeElement.querySelector(
      '[data-stock-origin-toggle="catalog-led-lamp"]',
    );

    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('Wareneingänge und Einstandskosten');
    expect((fixture.nativeElement as HTMLElement).innerHTML).not.toMatch(/\bLose\b/);
    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-stock-origin="old"]')?.textContent).toContain(
      '10,00 €',
    );
  });

  it('zeigt einen gebuchten Verkauf fest als verkauft und niemals als leere Statusauswahl', () => {
    const fixture = createList(
      [],
      [{ ...einzelstueck, status: 'sold', sale_state: 'sold', active_sale_count: 1 }],
    );
    const row = fixture.nativeElement.querySelector('[data-individual-row]') as HTMLElement;

    const badge = row.querySelector('[data-sold-badge]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Verkauft');
    expect(row.querySelector('[data-item-status]')).toBeNull();
    expect(row.textContent).not.toContain('Status bitte wählen');
    expect(row.querySelector('[data-item-sell]')).toBeNull();
  });

  it('zeigt einen Mehrfachverkauf als Integritätskonflikt vor dem sold-Fallback', () => {
    const fixture = createList(
      [],
      [
        {
          ...einzelstueck,
          status: 'sold',
          sale_state: 'multiple_active_sales',
          active_sale_count: 2,
        },
      ],
    );
    const row = fixture.nativeElement.querySelector('[data-individual-row]') as HTMLElement;

    expect(row.querySelector('[data-integrity-conflict]')?.textContent).toContain(
      'Integrität prüfen',
    );
    expect(row.querySelector('[data-sold-badge]')).toBeNull();
    expect(row.querySelector('[data-item-status]')).toBeNull();
    expect(row.querySelector('[data-item-store-toggle]')).toBeNull();
    expect(row.querySelector('[data-item-sell]')).toBeNull();
  });

  it.each([
    ['sold', 'sold'],
    ['legacy sold', 'legacy_sold_unverified'],
    ['header without line', 'legacy_sale_header_without_line'],
    ['status conflict', 'sale_status_conflict'],
    ['multiple sales', 'multiple_active_sales'],
  ] as const)('blendet direkte Mutationen für %s aus', (_label, saleState) => {
    const fixture = createList([], [{ ...einzelstueck, status: 'sold', sale_state: saleState }]);
    const row = fixture.nativeElement.querySelector('[data-individual-row]') as HTMLElement;

    expect(row.querySelector('[data-item-status]')).toBeNull();
    expect(row.querySelector('[data-item-store-toggle]')).toBeNull();
    expect(row.querySelector('[data-item-sell]')).toBeNull();
  });

  it('bietet bei ungeklärtem Verkauf beide Klärungswege ohne manuelle Grundangabe an', () => {
    const fixture = createList(
      [],
      [{ ...einzelstueck, status: 'sold', sale_state: 'legacy_sold_unverified' }],
    );
    const host = fixture.nativeElement as HTMLElement;
    const row = host.querySelector('[data-individual-row]') as HTMLElement;
    const restoreLegacy = vi.fn();
    fixture.componentInstance.restoreLegacy.subscribe(restoreLegacy);

    expect(row.textContent).toContain('Verkaufsstatus klären');
    expect(row.textContent).toContain('Artikel ist noch vorhanden');
    expect(row.querySelector('[data-reconcile-sale]')?.textContent).toContain('Verkauf nachtragen');
    expect(row.textContent).not.toContain('Altdaten prüfen');
    expect(row.textContent).not.toContain('Prüfgrund');
    expect(host.querySelector('input[id*="legacy-reason"]')).toBeNull();

    row.querySelector<HTMLElement>('[data-restore-stock]')?.click();

    expect(restoreLegacy).toHaveBeenCalledWith({
      ...einzelstueck,
      status: 'sold',
      sale_state: 'legacy_sold_unverified',
    });
  });

  it('zeigt beim Legacy-Verkaufskopf nur Korrektur erforderlich und keinen neuen Verkauf', () => {
    const fixture = createList(
      [],
      [{ ...einzelstueck, status: 'sold', sale_state: 'legacy_sale_header_without_line' }],
    );
    const row = fixture.nativeElement.querySelector('[data-individual-row]') as HTMLElement;

    expect(row.textContent).toContain('Korrektur erforderlich');
    expect(row.querySelector('[data-item-sell]')).toBeNull();
    expect(row.querySelector('[data-restore-stock]')).toBeNull();
    expect(row.querySelector('[data-reconcile-sale]')).toBeNull();
  });

  it('gibt die vollständigen Einzelstückaktionen als typisierte Ereignisse aus', () => {
    const fixture = createList([], [einzelstueck]);
    const selectionChanged = vi.fn();
    const storeToggle = vi.fn();
    const statusChange = vi.fn();
    const sellIndividual = vi.fn();
    expect(fixture.componentInstance.selectionChanged).toBeDefined();
    expect(fixture.componentInstance.storeToggle).toBeDefined();
    expect(fixture.componentInstance.statusChange).toBeDefined();
    expect(fixture.componentInstance.sellIndividual).toBeDefined();
    fixture.componentInstance.selectionChanged.subscribe(selectionChanged);
    fixture.componentInstance.storeToggle.subscribe(storeToggle);
    fixture.componentInstance.statusChange.subscribe(statusChange);
    fixture.componentInstance.sellIndividual.subscribe(sellIndividual);

    fixture.nativeElement.querySelector('[data-item-select] input')?.click();
    fixture.nativeElement.querySelector('[data-item-store-toggle]')?.click();
    fixture.nativeElement.querySelector('[data-item-sell]')?.click();
    fixture.detectChanges();

    expect(selectionChanged).toHaveBeenCalledWith(einzelstueck.id);
    expect(storeToggle).toHaveBeenCalledWith(einzelstueck);
    expect(sellIndividual).toHaveBeenCalledWith(einzelstueck);
    expect(statusChange).not.toHaveBeenCalled();
  });

  it('besteht den strukturellen AXE-Check; Farbkontrast bleibt im DOM-Test ungeprüft', async () => {
    const fixture = createList(
      [{ ...ledLampe, available_quantity: 5, on_hand_quantity: 5 }],
      [einzelstueck],
      [lot('old', '2026-08-01T09:00:00.000Z', 10)],
    );

    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it('zeigt die vollständige Bewegungshistorie auch für ein ausverkauftes Los zugänglich an', () => {
    const soldLot = {
      ...lot('sold', '2026-08-01T09:00:00.000Z', 10),
      remaining_quantity: 0,
      catalog_product: {
        id: ledLampe.catalog_product_id,
        title: ledLampe.title,
        is_public_store: true,
      },
    };
    const movements: StockMovement[] = [
      {
        id: 'movement-receipt',
        workspace_id: 'workspace-1',
        stock_lot_id: soldLot.id,
        direction: 'in',
        quantity: 2,
        reason: 'receipt',
        created_at: '2026-08-01T09:00:00.000Z',
      },
      {
        id: 'movement-sale',
        workspace_id: 'workspace-1',
        stock_lot_id: soldLot.id,
        sale_line_id: 'sale-line-1',
        direction: 'out',
        quantity: 2,
        reason: 'sale',
        created_at: '2026-08-20T09:00:00.000Z',
      },
      {
        id: 'movement-correction',
        workspace_id: 'workspace-1',
        stock_lot_id: soldLot.id,
        direction: 'in',
        quantity: 1,
        reason: 'correction',
        created_at: '2026-08-21T09:00:00.000Z',
      },
      {
        id: 'movement-return',
        workspace_id: 'workspace-1',
        stock_lot_id: soldLot.id,
        sale_line_id: 'sale-line-1',
        direction: 'in',
        quantity: 1,
        reason: 'return',
        created_at: '2026-08-22T09:00:00.000Z',
      },
    ];
    const fixture = createList([], [], [soldLot], movements);
    const history = fixture.nativeElement.querySelector('[data-stock-movement-history]');

    expect(history).not.toBeNull();
    expect(history.getAttribute('aria-labelledby')).toBe('stock-movement-history-title');
    expect(history.textContent).toContain('LED Schreibtischlampe');
    expect(history.textContent).toContain('Wareneingang');
    expect(history.textContent).toContain('Verkauf');
    expect(history.textContent).toContain('Korrektur');
    expect(history.textContent).toContain('Rückgabe');
    expect(history.querySelector('caption')?.textContent).toContain(
      'vollständige Bewegungshistorie',
    );
    expect(history.querySelector('caption')?.textContent).not.toContain('Lose');
  });
});
