import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DashboardOpenCost } from '../../../../core/models/flipbase.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { DashboardOpenCostsComponent } from './dashboard-open-costs.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  outputs: Record<string, string>;
}

const componentResources: Readonly<Record<string, string>> = {
  './button.component.html': 'src/app/shared/components/button/button.component.html',
  './button.component.scss': 'src/app/shared/components/button/button.component.scss',
  './card.component.html': 'src/app/shared/components/card/card.component.html',
  './card.component.scss': 'src/app/shared/components/card/card.component.scss',
  './dashboard-open-costs.component.html':
    'src/app/features/dashboard/components/dashboard-open-costs/dashboard-open-costs.component.html',
};

beforeAll(async () => {
  await ɵresolveComponentResources((url) => {
    const resource = componentResources[url];
    if (!resource) throw new Error(`Unbekannte Test-Ressource: ${url}`);
    return readFile(resolve(resource), 'utf8');
  });
  for (const [component, names] of [
    [ButtonComponent, ['variant', 'link']],
    [CardComponent, ['padding', 'rounded']],
    [DashboardOpenCostsComponent, ['openCosts', 'salesWithoutPurchase', 'inventoryItemsWithoutCost']],
  ] as const) {
    const metadata = (component as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = { ...metadata.inputs };
    for (const name of names) metadata.inputs[name] = [name, 1, null];
  }
});

beforeEach(() => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DashboardOpenCostsComponent],
    providers: [provideRouter([])],
  });
});

function entry(index: number, overrides: Partial<DashboardOpenCost> = {}): DashboardOpenCost {
  return {
    purchaseId: `purchase-${index}`,
    title: `Einkauf ${index}`,
    recordNumber: null,
    reason: 'not_finalized',
    affectedSales: 1,
    affectedInventory: 0,
    ...overrides,
  };
}

function render(
  openCosts: DashboardOpenCost[],
  salesWithoutPurchase = 0,
  inventoryItemsWithoutCost = 0,
) {
  const fixture = TestBed.createComponent(DashboardOpenCostsComponent);
  fixture.componentRef.setInput('openCosts', openCosts);
  fixture.componentRef.setInput('salesWithoutPurchase', salesWithoutPurchase);
  fixture.componentRef.setInput('inventoryItemsWithoutCost', inventoryItemsWithoutCost);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function text(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('DashboardOpenCostsComponent', () => {
  it('bleibt unsichtbar, solange nichts zu erledigen ist', () => {
    const host = render([]);

    expect(host.querySelector('section')).toBeNull();
  });

  it('fasst fehlende Kostenangaben kompakt als Aufgabe zusammen', () => {
    const host = render([entry(1), entry(2)], 0, 5);
    const task = host.querySelector('[data-open-cost-purchases]');

    expect(host.textContent).toContain('Zu erledigen');
    expect(text(task)).toContain('5 Artikel ohne Kostenangabe');
    expect(task?.querySelector('a')?.getAttribute('href')).toBe('/purchases');
    expect(host.querySelector('[data-open-cost]')).toBeNull();
    expect(host.textContent).not.toContain('Offene Kosten');
  });

  it('nennt offene Einkäufe, wenn kein konkreter Artikelbestand betroffen ist', () => {
    const host = render([entry(1), entry(2)]);
    const task = host.querySelector('[data-open-cost-purchases]');

    expect(text(task)).toContain('2 Einkäufe mit fehlenden Kostenangaben');
    expect(task?.querySelector('a')?.getAttribute('href')).toBe('/purchases');
  });

  it('führt Verkäufe ohne zuordenbaren Einkauf zur Verkaufsliste', () => {
    const host = render([], 3);
    const task = host.querySelector('[data-open-cost-sales]');

    expect(text(task)).toContain('3 Verkäufe ohne nachvollziehbare Kosten');
    expect(task?.querySelector('a')?.getAttribute('href')).toBe('/sales');
  });

  it('besteht AXE', async () => {
    const host = render([entry(1), entry(2)], 1, 2);

    const result = await axe.run(host, { rules: { 'color-contrast': { enabled: false } } });

    expect(result.violations).toEqual([]);
  });
});
