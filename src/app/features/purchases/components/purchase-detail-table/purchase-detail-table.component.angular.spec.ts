import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CostStateComponent } from '../../../../shared/components/cost-state/cost-state.component';
import type { PurchaseDetailRow } from '../../models/purchase-presentation.models';
import { PurchaseDetailTableComponent } from './purchase-detail-table.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let costStateInputs: AngularInputMetadata | null = null;

beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
  const metadata = (CostStateComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  costStateInputs = { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs };
  metadata.inputs = { ...metadata.inputs, state: ['state', 1, null] };
  metadata.declaredInputs = { ...metadata.declaredInputs, state: 'state' };
});

afterAll(() => {
  if (!costStateInputs) return;
  const metadata = (CostStateComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  metadata.inputs = costStateInputs.inputs;
  metadata.declaredInputs = costStateInputs.declaredInputs;
});

beforeEach(() => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PurchaseDetailTableComponent],
    providers: [provideRouter([])],
  });
});

function row(overrides: Partial<PurchaseDetailRow> = {}): PurchaseDetailRow {
  return {
    kind: 'normal',
    id: 'line-1',
    title: 'Tasse',
    orderedQuantity: 2,
    receivedQuantity: 1,
    unitPurchasePrice: { kind: 'known', amount: 10 },
    lineTotal: { kind: 'known', amount: 20 },
    inventoryItemId: null,
    inventoryItemLinks: [],
    recordedSales: [],
    salesState: 'loaded',
    quantityState: 'loaded',
    captureRemaining: 0,
    availableUnits: 1,
    soldUnits: 0,
    ...overrides,
  };
}

function render(rows: readonly PurchaseDetailRow[]) {
  const fixture = TestBed.createComponent(PurchaseDetailTableComponent);
  Object.assign(fixture.componentInstance, {
    purchaseId: signal('purchase-normal'),
    rows: signal(rows),
  });
  fixture.detectChanges();
  return fixture;
}

describe('PurchaseDetailTableComponent', () => {
  it('zeigt immer die fünf festen Einkaufsspalten mit Mengen und Preisen', () => {
    const fixture = render([
      row({
        inventoryItemId: 'item-1',
        inventoryItemLinks: [{ id: 'item-1', label: 'Artikel 1' }],
      }),
    ]);
    const host = fixture.nativeElement as HTMLElement;
    const headers = Array.from(host.querySelectorAll('thead th'), (header) =>
      header.textContent?.trim(),
    );
    const cells = Array.from(host.querySelectorAll('tbody td'), (cell) => cell.textContent?.trim());
    const itemLink = host.querySelector<HTMLAnchorElement>('[data-purchase-item-link]');

    expect(headers).toEqual(['Artikel', 'Bestellt', 'Erhalten', 'Stückpreis', 'Gesamt']);
    expect(cells.slice(1)).toEqual(['2', '1', '10,00 €', '20,00 €']);
    expect(host.textContent).not.toContain('Kostenanteil');
    expect(host.textContent).not.toContain('Verfügbar');
    expect(host.textContent).not.toContain('Verkauft');
    expect(itemLink?.getAttribute('href')).toBe(
      '/inventory/item-1?returnTo=%2Fpurchases%2Fpurchase-normal',
    );
  });

  it('zeigt eine historische Mystery-Position in derselben einfachen Struktur', () => {
    const fixture = render([
      row({
        kind: 'mystery',
        title: 'Mystery-Schuhe',
        orderedQuantity: 1,
        receivedQuantity: 1,
        unitPurchasePrice: { kind: 'known', amount: 12 },
        lineTotal: { kind: 'known', amount: 12 },
      }),
    ]);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Mystery-Schuhe');
    expect(host.textContent).toContain('12,00 €');
    expect(host.textContent).not.toContain('Geschätzter Marktwert');
    expect(host.textContent).not.toContain('Zustand');
  });

  it('besteht den strukturellen AXE-Check', async () => {
    const fixture = render([row()]);
    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it('mischt auch bei vorhandenen Verkaufsdaten keine Verkaufswerte in den Einkauf', () => {
    const fixture = render([
      row({
        id: 'line-sold',
        recordedSales: [
          { id: 'sale-1', status: 'active', revenue: 33, directResult: 13 },
          { id: 'sale-2', status: 'active', revenue: 20, directResult: 5 },
        ],
      }),
      row({ id: 'line-open', title: 'Offene Tasse' }),
    ]);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-purchase-sale-link]')).toBeNull();
    expect(host.textContent).not.toContain('Ergebnis');
    expect(host.textContent).not.toContain('Verkaufserlös');
    expect(host.textContent).not.toContain('Verkaufsdaten');
  });

  it('blendet Verkaufsfehler aus und löst die Erfassung genau einmal aus', () => {
    const fixture = render([
      row({
        id: 'line-capture',
        title: 'Noch nicht erfasste Tasse',
        recordedSales: null,
        salesState: 'error',
        captureRemaining: 1,
      }),
    ]);
    const host = fixture.nativeElement as HTMLElement;
    const capture = host.querySelector<HTMLButtonElement>('[data-capture-individual]');
    const emitted: string[] = [];
    fixture.componentInstance.captureIndividual.subscribe((lineId) => emitted.push(lineId));

    capture?.click();

    expect(host.textContent?.match(/Noch nicht erfasste Tasse/g)).toHaveLength(1);
    expect(host.textContent).not.toContain('Verkaufsdaten');
    expect(emitted).toEqual(['line-capture']);
  });

  it('verlinkt alle Einzelstücke genau einmal innerhalb derselben Positionszeile', () => {
    const fixture = render([
      row({
        kind: 'mystery',
        title: 'Mystery-Schuhe',
        inventoryItemLinks: [
          { id: 'item-1', label: 'Artikel 1' },
          { id: 'item-2', label: 'Artikel 2' },
          { id: 'item-3', label: 'Artikel 3' },
        ],
      }),
    ]);
    const host = fixture.nativeElement as HTMLElement;
    const links = host.querySelectorAll<HTMLAnchorElement>('[data-purchase-item-link]');

    expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(links).toHaveLength(3);
    expect(Array.from(links).map((link) => link.getAttribute('href'))).toEqual([
      '/inventory/item-1?returnTo=%2Fpurchases%2Fpurchase-normal',
      '/inventory/item-2?returnTo=%2Fpurchases%2Fpurchase-normal',
      '/inventory/item-3?returnTo=%2Fpurchases%2Fpurchase-normal',
    ]);
  });

  it('blendet auch historische Retouren und Stornos aus', () => {
    const fixture = render([
      row({
        recordedSales: [
          { id: 'sale-returned', status: 'returned', revenue: null, directResult: null },
          { id: 'sale-voided', status: 'voided', revenue: null, directResult: null },
        ],
      }),
    ]);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-recorded-sale]')).toBeNull();
    expect(host.textContent).not.toContain('Retourniert');
    expect(host.textContent).not.toContain('Storniert');
    expect(host.textContent).not.toContain('Verkaufserlös');
    expect(host.textContent).not.toContain('Ergebnis');
  });
});
