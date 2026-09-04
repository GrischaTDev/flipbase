import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PurchaseDetailRow } from '../../models/purchase-presentation.models';
import { PurchaseDetailTableComponent } from './purchase-detail-table.component';

beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
});

beforeEach(() => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PurchaseDetailTableComponent],
    providers: [provideRouter([])],
  });
});

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
  it('zeigt beim normalen Einkauf die Preis- und Mengenbegriffe und erhält den Rückweg', () => {
    const fixture = render([
      {
        kind: 'normal',
        id: 'line-1',
        title: 'Tasse',
        quantity: 1,
        inventoryItemId: 'item-1',
        inventoryItemLinks: [{ id: 'item-1', label: 'Artikel 1' }],
        recordedSales: [],
        salesState: 'loaded',
        quantityState: 'loaded',
        captureRemaining: 0,
        unitPurchasePrice: { kind: 'known', amount: 10 },
        additionalCostPerUnit: { kind: 'known', amount: 2 },
        totalCostPerUnit: { kind: 'known', amount: 12 },
        availableUnits: 1,
        soldUnits: 0,
      },
    ]);
    const table = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-purchase-detail-table]',
    );
    const itemLink = table?.querySelector<HTMLAnchorElement>('[data-purchase-item-link]');

    expect(table?.textContent).toContain('Einkaufspreis pro Stück');
    expect(table?.textContent).toContain('Zusätzlicher Kostenanteil');
    expect(table?.textContent).toContain('Gesamtkosten pro Stück');
    expect(table?.textContent).toContain('Verfügbar');
    expect(table?.textContent).toContain('Verkauft');
    expect(itemLink?.getAttribute('href')).toBe(
      '/inventory/item-1?returnTo=%2Fpurchases%2Fpurchase-normal',
    );
  });

  it('zeigt bei einer Mystery Box Zustand und Marktwert, aber keinen Stück-Einkaufspreis', () => {
    const fixture = render([
      {
        kind: 'mystery',
        id: 'line-1',
        title: 'Tasse',
        quantity: 1,
        inventoryItemId: 'item-1',
        inventoryItemLinks: [{ id: 'item-1', label: 'Artikel 1' }],
        recordedSales: [],
        salesState: 'loaded',
        quantityState: 'loaded',
        captureRemaining: 0,
        condition: 'like_new',
        estimatedMarketValue: 25,
        allocatedCostPerUnit: { kind: 'known', amount: 12 },
        availableUnits: 1,
        soldUnits: 0,
      },
    ]);
    const table = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-purchase-detail-table]',
    );

    expect(table?.textContent).toContain('Zustand');
    expect(table?.textContent).toContain('Geschätzter Marktwert');
    expect(table?.textContent).toContain('Kostenanteil pro Stück');
    expect(table?.textContent).not.toContain('Einkaufspreis pro Stück');
    expect(table?.textContent).toContain('Wie neu');
  });

  it('besteht den strukturellen AXE-Check', async () => {
    const fixture = render([
      {
        kind: 'normal',
        id: 'line-1',
        title: 'Tasse',
        quantity: 1,
        inventoryItemId: 'item-1',
        inventoryItemLinks: [{ id: 'item-1', label: 'Artikel 1' }],
        recordedSales: [],
        salesState: 'loaded',
        quantityState: 'loaded',
        captureRemaining: 0,
        unitPurchasePrice: { kind: 'known', amount: 10 },
        additionalCostPerUnit: { kind: 'known', amount: 2 },
        totalCostPerUnit: { kind: 'known', amount: 12 },
        availableUnits: 1,
        soldUnits: 0,
      },
    ]);

    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it('zeigt beim Laden der Bestandsdaten keine erfundene Nullmenge', () => {
    const fixture = render([
      {
        kind: 'normal',
        id: 'line-loading',
        title: 'Tassen-Set',
        quantity: 4,
        inventoryItemId: null,
        inventoryItemLinks: [],
        recordedSales: [],
        salesState: 'loaded',
        quantityState: 'loading',
        captureRemaining: 0,
        unitPurchasePrice: { kind: 'known', amount: 10 },
        additionalCostPerUnit: { kind: 'known', amount: 2 },
        totalCostPerUnit: { kind: 'known', amount: 12 },
        availableUnits: null,
        soldUnits: null,
      },
    ]);
    const host = fixture.nativeElement as HTMLElement;
    const quantityCells = Array.from(host.querySelectorAll('tbody td'))
      .slice(-2)
      .map((cell) => cell.textContent?.trim());

    expect(quantityCells).toEqual(['Wird geladen …', 'Wird geladen …']);
  });

  it('zeigt Verkauf und Ergebnis nur bei einer echten Verkaufsverknüpfung', () => {
    const fixture = render([
      {
        kind: 'mystery',
        id: 'line-sold',
        title: 'Verkaufte Tasse',
        quantity: 1,
        inventoryItemId: 'item-sold',
        inventoryItemLinks: [{ id: 'item-sold', label: 'Artikel 1' }],
        recordedSales: [
          { id: 'sale-1', status: 'active', revenue: 33, directResult: 13 },
          { id: 'sale-2', status: 'active', revenue: 20, directResult: 5 },
        ],
        salesState: 'loaded',
        quantityState: 'loaded',
        captureRemaining: 0,
        condition: 'like_new',
        estimatedMarketValue: 25,
        allocatedCostPerUnit: { kind: 'known', amount: 12 },
        availableUnits: 0,
        soldUnits: 1,
      },
      {
        kind: 'mystery',
        id: 'line-open',
        title: 'Offene Tasse',
        quantity: 1,
        inventoryItemId: 'item-open',
        inventoryItemLinks: [{ id: 'item-open', label: 'Artikel 1' }],
        recordedSales: [],
        salesState: 'loaded',
        quantityState: 'loaded',
        captureRemaining: 0,
        condition: 'like_new',
        estimatedMarketValue: 25,
        allocatedCostPerUnit: { kind: 'known', amount: 12 },
        availableUnits: 1,
        soldUnits: 0,
      },
    ]);
    const host = fixture.nativeElement as HTMLElement;
    const saleLinks = host.querySelectorAll<HTMLAnchorElement>('[data-purchase-sale-link]');

    expect(saleLinks).toHaveLength(2);
    expect(saleLinks[0].getAttribute('href')).toBe('/sales?saleId=sale-1');
    expect(saleLinks[1].getAttribute('href')).toBe('/sales?saleId=sale-2');
    expect(host.textContent).toContain('Ergebnis: 13,00 €');
    expect(host.textContent).toContain('Verkaufserlös: 33,00 €');
  });

  it('zeigt Ladefehler getrennt vom Laden und löst die Erfassung ohne doppelte Position aus', () => {
    const fixture = render([
      {
        kind: 'mystery',
        id: 'line-capture',
        title: 'Noch nicht erfasste Tasse',
        quantity: 1,
        inventoryItemId: null,
        inventoryItemLinks: [],
        recordedSales: null,
        salesState: 'error',
        condition: 'used',
        estimatedMarketValue: null,
        allocatedCostPerUnit: { kind: 'open' },
        availableUnits: null,
        soldUnits: null,
        quantityState: 'error',
        captureRemaining: 1,
      },
    ]);
    const host = fixture.nativeElement as HTMLElement;
    const capture = host.querySelector<HTMLButtonElement>('[data-capture-individual]');
    const emitted: string[] = [];
    const captureOutput = (
      fixture.componentInstance as unknown as {
        captureIndividual?: { subscribe: (listener: (lineId: string) => void) => void };
      }
    ).captureIndividual;
    captureOutput?.subscribe((lineId) => emitted.push(lineId));

    capture?.click();

    expect(host.textContent?.match(/Noch nicht erfasste Tasse/g)).toHaveLength(1);
    expect(host.textContent).toContain('Bestandsdaten konnten nicht geladen werden');
    expect(host.textContent).toContain('Verkaufsdaten konnten nicht geladen werden');
    expect(host.textContent).not.toContain('Wird geladen');
    expect(emitted).toEqual(['line-capture']);
  });

  it('verlinkt alle Einzelstücke genau einmal innerhalb derselben Positionszeile', () => {
    const fixture = render([
      {
        kind: 'mystery',
        id: 'line-three-items',
        title: 'Mystery-Schuhe',
        quantity: 3,
        inventoryItemId: null,
        inventoryItemLinks: [
          { id: 'item-1', label: 'Artikel 1' },
          { id: 'item-2', label: 'Artikel 2' },
          { id: 'item-3', label: 'Artikel 3' },
        ],
        recordedSales: [],
        salesState: 'loaded',
        condition: 'like_new',
        estimatedMarketValue: null,
        allocatedCostPerUnit: { kind: 'open' },
        availableUnits: 3,
        soldUnits: 0,
        quantityState: 'loaded',
        captureRemaining: 0,
      },
    ]);
    const host = fixture.nativeElement as HTMLElement;
    const rows = host.querySelectorAll('tbody tr');
    const links = host.querySelectorAll<HTMLAnchorElement>('[data-purchase-item-link]');

    expect(rows).toHaveLength(1);
    expect(host.textContent?.match(/Mystery-Schuhe/g)).toHaveLength(1);
    expect(links).toHaveLength(3);
    expect(Array.from(links).map((link) => link.getAttribute('href'))).toEqual([
      '/inventory/item-1?returnTo=%2Fpurchases%2Fpurchase-normal',
      '/inventory/item-2?returnTo=%2Fpurchases%2Fpurchase-normal',
      '/inventory/item-3?returnTo=%2Fpurchases%2Fpurchase-normal',
    ]);
    expect(Array.from(links).map((link) => link.textContent?.trim())).toEqual([
      'Artikel 1',
      'Artikel 2',
      'Artikel 3',
    ]);
  });

  it('kennzeichnet historische Verkäufe und zeigt dafür keine aktuellen Finanzbegriffe', () => {
    const fixture = render([
      {
        kind: 'mystery',
        id: 'line-history',
        title: 'Historischer Artikel',
        quantity: 1,
        inventoryItemId: 'item-history',
        inventoryItemLinks: [{ id: 'item-history', label: 'Artikel 1' }],
        recordedSales: [
          { id: 'sale-returned', status: 'returned', revenue: null, directResult: null },
          { id: 'sale-voided', status: 'voided', revenue: null, directResult: null },
        ],
        salesState: 'loaded',
        condition: 'used',
        estimatedMarketValue: null,
        allocatedCostPerUnit: { kind: 'known', amount: 10 },
        availableUnits: 1,
        soldUnits: 0,
        quantityState: 'loaded',
        captureRemaining: 0,
      },
    ]);
    const host = fixture.nativeElement as HTMLElement;
    const returned = host.querySelector<HTMLElement>('[data-recorded-sale="returned"]');
    const voided = host.querySelector<HTMLElement>('[data-recorded-sale="voided"]');

    expect(returned?.textContent).toContain('Retourniert');
    expect(voided?.textContent).toContain('Storniert');
    expect(returned?.textContent).not.toContain('Verkaufserlös');
    expect(returned?.textContent).not.toContain('Ergebnis');
    expect(voided?.textContent).not.toContain('Verkaufserlös');
    expect(voided?.textContent).not.toContain('Ergebnis');
    expect(host.querySelectorAll('[data-purchase-sale-link]')).toHaveLength(2);
  });
});
