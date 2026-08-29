import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  InventoryItem,
  StockLot,
  StockMovement,
  StockPosition,
} from '../../../../core/models/flipbase.models';
import { StockPositionListComponent } from './stock-position-list.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

function createList(
  positions: readonly StockPosition[],
  individualItems: readonly InventoryItem[] = [],
  lots: readonly StockLot[] = [],
  movements: readonly StockMovement[] = [],
) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [StockPositionListComponent],
  }).createComponent(StockPositionListComponent);

  Object.assign(fixture.componentInstance, {
    positions: signal(positions),
    individualItems: signal(individualItems),
    lots: signal(lots),
    movements: signal(movements),
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
  status: 'received',
  allocated_purchase_cost: 12,
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
  it('zeigt zwei Lose desselben Mengenartikels als eine verfügbare Bestandsposition', () => {
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
    const rows = Array.from(host.querySelectorAll<HTMLElement>('table [data-stock-row]'));

    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('LED Schreibtischlampe');
    expect(rows[0].textContent).toContain('8 Stück verfügbar');
    expect(rows[0].textContent).toContain('8 Stück im Bestand');
  });

  it('zeigt vorhandene Einzelstücke weiterhin als eigene Zeile mit Menge eins', () => {
    const fixture = createList([], [einzelstueck]);

    const host = fixture.nativeElement as HTMLElement;
    const rows = Array.from(host.querySelectorAll<HTMLElement>('table [data-individual-row]'));

    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Mystery-Fundstück');
    expect(rows[0].textContent).toContain('1 Stück verfügbar');
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

  it('zeigt Lose auch in der mobilen Bestandskarte aufklappbar an', () => {
    const fixture = createList([ledLampe], [], [lot('old', '2026-08-01T09:00:00.000Z', 10)]);

    const toggle = fixture.nativeElement.querySelector(
      '[data-stock-lot-toggle="catalog-led-lamp"]',
    );

    expect(toggle).not.toBeNull();
    toggle.click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-mobile-stock-lot="old"]')?.textContent,
    ).toContain('10,00 €');
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
  });
});
