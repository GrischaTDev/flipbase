import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { KpiChange } from '../../models/kpi-change';
import { DashboardKpiCardComponent } from './dashboard-kpi-card.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
}

beforeAll(async () => {
  await ɵresolveComponentResources((url) => {
    if (url !== './dashboard-kpi-card.component.html') {
      throw new Error(`Unbekannte Test-Ressource: ${url}`);
    }
    return readFile(
      resolve(
        'src/app/features/dashboard/components/dashboard-kpi-card/dashboard-kpi-card.component.html',
      ),
      'utf8',
    );
  });
  const metadata = (DashboardKpiCardComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  metadata.inputs = { ...metadata.inputs };
  for (const name of [
    'label',
    'value',
    'icon',
    'hint',
    'change',
    'comparisonLabel',
    'size',
    'valueTone',
  ]) {
    metadata.inputs[name] = [name, 1, null];
  }
});

beforeEach(() => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [DashboardKpiCardComponent] });
});

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(DashboardKpiCardComponent);
  fixture.componentRef.setInput('label', 'Gewinn');
  fixture.componentRef.setInput('value', '20,09 €');
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const rising: KpiChange = {
  text: '▲ 12 %',
  tone: 'success',
  description: 'gestiegen um 12 Prozent gegenüber gestern',
};

describe('DashboardKpiCardComponent', () => {
  it('zeigt die Veränderung sichtbar kurz und für Screenreader als ganzen Satz', () => {
    const host = render({ change: rising, comparisonLabel: 'gestern' });
    const change = host.querySelector('[data-kpi-change]');
    const visible = [...(change?.querySelectorAll('[aria-hidden="true"]') ?? [])]
      .map((part) => part.textContent)
      .join('');

    expect(visible.replace(/\s+/g, ' ').trim()).toBe('▲ 12 % ggü. gestern');
    expect(change?.querySelector('.sr-only')?.textContent).toBe(
      'gestiegen um 12 Prozent gegenüber gestern',
    );
    expect(change?.querySelector('[aria-hidden="true"]')?.className).toContain('text-fb-success');
  });

  it('lässt die Vergleichszeile ohne belastbaren Vergleich weg', () => {
    const host = render({ change: null, hint: '2 Artikel ohne Kosten' });

    expect(host.querySelector('[data-kpi-change]')).toBeNull();
    expect(host.querySelector('[data-kpi-hint]')?.textContent).toBe('2 Artikel ohne Kosten');
  });

  it('verwendet für den Gewinnwert dieselbe Finanztextfarbe wie das Verkaufsjournal', () => {
    const host = render({ value: '5,00 €', valueTone: 'positive', size: 'large' });
    const value = host.querySelector('.linear-kpi > p');

    expect(value?.classList.contains('text-fb-finance-positive')).toBe(true);
    expect(value?.classList.contains('text-fb-success')).toBe(false);
  });

  it('kennzeichnet einen Verlust mit der Finanztextfarbe', () => {
    const host = render({ value: '-5,00 €', valueTone: 'negative', size: 'large' });
    const value = [...host.querySelectorAll('p')].find((element) =>
      element.textContent?.includes('-5,00 €'),
    );

    expect(value?.className).toContain('text-fb-finance-negative');
    expect(value?.className).not.toContain('text-fb-critical');
    expect(value?.className).toContain('text-2xl');
  });

  it('kennzeichnet einen positiven Ausgabenbetrag als Ausgaben statt als Verlust', () => {
    const host = render({ value: '44,84 €', valueTone: 'expense', size: 'large' });
    const value = host.querySelector('.linear-kpi > p');

    expect(value?.classList.contains('text-fb-finance-negative')).toBe(true);
  });
});
