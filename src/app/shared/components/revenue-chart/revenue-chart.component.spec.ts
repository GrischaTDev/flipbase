import '@angular/compiler';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { DashboardTimePoint } from '../../../core/models/flipbase.models';
import { RevenueChartComponent } from './revenue-chart.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

const points: readonly DashboardTimePoint[] = [
  { date: '2026-08-27', label: '27.08.', revenue: 19.98, expenses: 24.95, realizedProfit: 9 },
  { date: '2026-08-28', label: '28.08.', revenue: 0, expenses: 0, realizedProfit: 0 },
];

describe('RevenueChartComponent', () => {
  it('zeichnet alle drei Kennzahlen und stellt eine Bildschirmleser-Tabelle bereit', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({
      imports: [RevenueChartComponent],
    }).createComponent(RevenueChartComponent);
    Object.assign(fixture.componentInstance, { points: signal(points) });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('svg path')).toHaveLength(3);
    expect(host.querySelector('svg title')?.textContent).toContain('Umsatz');
    expect(host.querySelector('#revenue-chart-summary table')?.textContent).toContain('24.95');
  });

  it('legt die Nulllinie bei gemischten Werten innerhalb der Zeichenflaeche an und zeichnet Verluste sichtbar', () => {
    const mixedPoints: readonly DashboardTimePoint[] = [
      { date: '2026-08-27', label: '27.08.', revenue: 120, expenses: 20, realizedProfit: 40 },
      { date: '2026-08-28', label: '28.08.', revenue: 0, expenses: 30, realizedProfit: -25 },
    ];
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({
      imports: [RevenueChartComponent],
    }).createComponent(RevenueChartComponent);
    Object.assign(fixture.componentInstance, { points: signal(mixedPoints) });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const zeroLine = host.querySelector<SVGLineElement>('[data-chart-zero-line]');
    const zeroY = Number(zeroLine?.getAttribute('y1'));
    const profitPath = fixture.componentInstance.chart().series[2].path;
    const coordinates = [...profitPath.matchAll(/[-+]?\d*\.?\d+/g)].map((entry) =>
      Number(entry[0]),
    );
    const yCoordinates = coordinates.filter((_, index) => index % 2 === 1);

    // Kein aria-label auf der Linie: <line> hat keine Rolle, die einen Namen
    // traegt, deshalb ist das Attribut dort laut ARIA unzulaessig (AXE-Regel
    // aria-prohibited-attr). Das Diagramm ist als role="img" mit <title> und
    // der Datentabelle beschrieben - die Linie braucht keinen eigenen Namen.
    expect(zeroLine?.hasAttribute('aria-label')).toBe(false);
    expect(zeroY).toBeGreaterThan(20);
    expect(zeroY).toBeLessThan(226);
    expect(Math.max(...yCoordinates)).toBeLessThanOrEqual(226);
    expect(Math.min(...yCoordinates)).toBeGreaterThanOrEqual(20);
  });

  it('behält die Nulllinie für positive und leere Reihen am unteren Rand der Zeichenflaeche', () => {
    for (const data of [points, []] as const) {
      TestBed.resetTestingModule();
      const fixture = TestBed.configureTestingModule({
        imports: [RevenueChartComponent],
      }).createComponent(RevenueChartComponent);
      Object.assign(fixture.componentInstance, { points: signal(data) });
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      const zeroLine = host.querySelector<SVGLineElement>('[data-chart-zero-line]');
      expect(Number(zeroLine?.getAttribute('y1'))).toBe(226);
    }
  });
});
