import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { InventoryItem, StockPosition } from '../../../../core/models/flipbase.models';
import { StockPositionListComponent } from './stock-position-list.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

function createList(
  positions: readonly StockPosition[],
  individualItems: readonly InventoryItem[] = [],
) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [StockPositionListComponent],
  }).createComponent(StockPositionListComponent);

  Object.assign(fixture.componentInstance, {
    positions: signal(positions),
    individualItems: signal(individualItems),
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

    const rows = Array.from(fixture.nativeElement.querySelectorAll('table [data-stock-row]'));

    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('LED Schreibtischlampe');
    expect(rows[0].textContent).toContain('8 Stück verfügbar');
  });

  it('zeigt vorhandene Einzelstücke weiterhin als eigene Zeile mit Menge eins', () => {
    const fixture = createList([], [einzelstueck]);

    const rows = Array.from(fixture.nativeElement.querySelectorAll('table [data-individual-row]'));

    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Mystery-Fundstück');
    expect(rows[0].textContent).toContain('1 Stück verfügbar');
  });
});
