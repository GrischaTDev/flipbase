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
});
