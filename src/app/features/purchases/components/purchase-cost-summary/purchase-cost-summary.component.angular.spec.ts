import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PurchaseCostSummaryComponent } from './purchase-cost-summary.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const metadataSnapshots = new Map<unknown, AngularInputMetadata>();

function bridgeSignalInputs(component: unknown, names: readonly string[]): void {
  if (import.meta.url.includes('/out-tsc/')) return;
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  metadataSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(names.map((name) => [name, name])),
  };
}

function bridgeSignalOutputs(component: unknown, names: readonly string[]): void {
  if (import.meta.url.includes('/out-tsc/')) return;
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  if (!metadataSnapshots.has(component)) {
    metadataSnapshots.set(component, {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
      outputs: metadata.outputs,
    });
  }
  metadata.outputs = {
    ...metadata.outputs,
    ...Object.fromEntries(names.map((name) => [name, name])),
  };
}

async function createSummary(): Promise<ComponentFixture<PurchaseCostSummaryComponent>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [PurchaseCostSummaryComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(PurchaseCostSummaryComponent);
  fixture.componentRef.setInput('goodsAmount', 100);
  fixture.componentRef.setInput('itemCount', 3);
  fixture.componentRef.setInput('discountAmount', 10);
  fixture.componentRef.setInput('costs', [
    {
      type: 'shipping',
      amount: 15,
      description: 'Versandkosten',
      allocationMethod: 'by_value',
      targetPurchaseLineId: null,
    },
  ]);
  fixture.componentRef.setInput('totalAmount', 92);
  fixture.detectChanges();
  return fixture;
}

describe('PurchaseCostSummaryComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const resourceUrl = String(url);
      if (!url || resourceUrl === 'undefined' || resourceUrl.endsWith('/undefined')) return '';
      const fileName = resourceUrl.split('/').at(-1);
      if (resourceUrl.includes('button.component.')) {
        return readFile(`src/app/shared/components/button/${fileName}`, 'utf8');
      }
      if (resourceUrl.includes('card.component.')) {
        return readFile(`src/app/shared/components/card/${fileName}`, 'utf8');
      }
      return readFile(new URL(resourceUrl, import.meta.url), 'utf8');
    });
    bridgeSignalInputs(PurchaseCostSummaryComponent, [
      'goodsAmount',
      'itemCount',
      'discountAmount',
      'costs',
      'totalAmount',
      'legacyShippingAmount',
      'legacyOtherCostsAmount',
      'editable',
    ]);
    bridgeSignalInputs(ButtonComponent, ['variant', 'size', 'icon', 'iconOnly', 'ariaLabel']);
    bridgeSignalOutputs(ButtonComponent, ['clicked']);
    bridgeSignalInputs(CardComponent, ['title', 'padding', 'rounded']);
  });

  afterAll(() => {
    for (const [component, snapshot] of metadataSnapshots) {
      const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
      metadata.inputs = snapshot.inputs;
      metadata.declaredInputs = snapshot.declaredInputs;
      metadata.outputs = snapshot.outputs;
    }
  });

  it('zeigt einen autoritativen Gesamtbetrag statt einer lokalen Neuberechnung', async () => {
    const fixture = await createSummary();
    const text = (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ');

    expect(text).toContain('Bestellte Artikel 3 Artikel 100,00 €');
    expect(text).toContain('Rabatt');
    expect(text).toContain('− 10,00 €');
    expect(text).toContain('Versandkosten 15,00 €');
    expect(text).not.toContain('Noch prüfen');
    expect(text).toContain('Gesamt 92,00 €');
  });

  it('zeigt Zusatzkosten direkt untereinander ohne Steuerhinweis oder Trennlinien', async () => {
    const fixture = await createSummary();
    fixture.componentRef.setInput('costs', [
      { type: 'shipping', amount: 5, tax_treatment: 'purchase_price' },
      { type: 'customs', amount: 7, taxTreatment: 'expense' },
      { type: 'fee', amount: 2, tax_treatment: null },
    ]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const summary = host.querySelector('dl');
    const text = summary?.textContent?.replace(/\s+/g, ' ');

    expect(text).toContain('Versandkosten 5,00 € Zollgebühren 7,00 € Gebühr 2,00 € Rabatt');
    expect(text).not.toContain('Noch prüfen');
    expect(text).not.toContain('Vom Verkäufer berechnet');
    expect(text).not.toContain('Separat bezahlt');
    expect(summary?.classList.contains('divide-y')).toBe(false);
    expect(
      Array.from(summary?.children ?? [])
        .slice(0, -1)
        .every((row) => !row.className.includes('border-')),
    ).toBe(true);
  });

  it('meldet die Bearbeitungsaktion an den Einkaufsfluss', async () => {
    const fixture = await createSummary();
    const editRequested = vi.fn();
    fixture.componentInstance.editRequested.subscribe(editRequested);
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((candidate) => candidate.getAttribute('aria-label') === 'Kosten bearbeiten');

    button?.click();

    expect(editRequested).toHaveBeenCalledOnce();
  });

  it('stellt die Kostenübersicht als benannte Region bereit', async () => {
    const fixture = await createSummary();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.getAttribute('role')).toBe('region');
    expect(host.getAttribute('aria-label')).toBe('Kostenübersicht');
  });

  it('zeigt einen leeren Einkauf mit null Artikeln und Nullbeträgen', async () => {
    const fixture = await createSummary();
    fixture.componentRef.setInput('goodsAmount', null);
    fixture.componentRef.setInput('itemCount', 0);
    fixture.componentRef.setInput('discountAmount', 0);
    fixture.componentRef.setInput('costs', []);
    fixture.componentRef.setInput('totalAmount', null);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ');
    expect(text).toContain('Bestellte Artikel 0 Artikel 0,00 €');
    expect(text).not.toContain('Anpassungen');
    expect(text).not.toContain('Rabatt');
    expect(text).toContain('Gesamt 0,00 €');
    expect(fixture.nativeElement.querySelector('[data-purchase-cost-open]')).toBeNull();
  });

  it('zeigt einen expliziten Nullpreis als bezahlten Gesamtbetrag', async () => {
    const fixture = await createSummary();
    fixture.componentRef.setInput('totalAmount', 0);
    fixture.detectChanges();

    expect(fixture.componentInstance.displayedTotal()).toBe(0);
    expect(fixture.nativeElement.querySelector('[data-purchase-cost-open]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ')).toContain(
      'Gesamt 0,00 €',
    );
  });

  it('berechnet nur bei undefined einen auf zwei Stellen gerundeten Fallback', async () => {
    const fixture = await createSummary();
    fixture.componentRef.setInput('goodsAmount', 100.1);
    fixture.componentRef.setInput('discountAmount', 0.2);
    fixture.componentRef.setInput('costs', [
      { type: 'fee', amount: 0.1, description: 'Warenbetrag' },
    ]);
    fixture.componentRef.setInput('totalAmount', undefined);
    fixture.detectChanges();

    expect(fixture.componentInstance.displayedTotal()).toBe(100);
  });

  it('benennt unbeschriebene sonstige Kosten verstaendlich', async () => {
    const fixture = await createSummary();
    fixture.componentRef.setInput('costs', [{ type: 'other', amount: 3 }]);
    fixture.componentRef.setInput('discountAmount', 0);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ');
    expect(text).toContain('Sonstiges');
    expect(text).not.toContain('Anpassungen');
  });
});
