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
    [DashboardOpenCostsComponent, ['openCosts', 'salesWithoutPurchase']],
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

function render(openCosts: DashboardOpenCost[], salesWithoutPurchase = 0) {
  const fixture = TestBed.createComponent(DashboardOpenCostsComponent);
  fixture.componentRef.setInput('openCosts', openCosts);
  fixture.componentRef.setInput('salesWithoutPurchase', salesWithoutPurchase);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function text(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('DashboardOpenCostsComponent', () => {
  it('bleibt unsichtbar, solange nichts offen ist', () => {
    const host = render([]);

    expect(host.querySelector('section')).toBeNull();
  });

  it('verlinkt jeden Einkauf mit Nummer, Grund und Umfang', () => {
    const host = render([
      entry(1, {
        title: 'Kiste vom Flohmarkt',
        recordNumber: 'EK-0007',
        reason: 'cost_not_allocated',
        affectedSales: 2,
        affectedInventory: 1,
      }),
      entry(2, { reason: 'price_missing', affectedSales: 0 }),
    ]);
    const rows = [...host.querySelectorAll('[data-open-cost]')];

    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain('EK-0007 · Kiste vom Flohmarkt');
    expect(text(rows[0])).toContain('betrifft 2 Verkäufe · 1 Artikel im Bestand');
    expect(text(rows[0])).toContain('Kosten nicht auf Artikel verteilt');
    expect(rows[0]?.querySelector('a')?.getAttribute('href')).toBe('/purchases/purchase-1');
    expect(text(rows[1])).toContain('Einkaufspreis fehlt');
    expect(text(rows[1])).toContain('Einkauf im gewählten Zeitraum');
  });

  it('zeigt höchstens fünf Einkäufe und verweist für den Rest auf die Einkaufsliste', () => {
    const host = render(Array.from({ length: 7 }, (_, index) => entry(index + 1)));
    const more = host.querySelector('[data-open-cost-more] a');

    expect(host.querySelectorAll('[data-open-cost]')).toHaveLength(5);
    expect(text(more)).toBe('+2 weitere Einkäufe');
    expect(more?.getAttribute('href')).toBe('/purchases');
  });

  it('führt Verkäufe ohne zuordenbaren Einkauf zur Verkaufsliste', () => {
    const host = render([], 3);
    const row = host.querySelector('[data-open-cost-sales]');

    expect(text(row)).toContain('3 Verkäufe ohne nachvollziehbare Kosten');
    expect(row?.querySelector('a')?.getAttribute('href')).toBe('/sales');
  });

  it('besteht AXE', async () => {
    const host = render([entry(1), entry(2)], 1);

    const result = await axe.run(host, { rules: { 'color-contrast': { enabled: false } } });

    expect(result.violations).toEqual([]);
  });
});
