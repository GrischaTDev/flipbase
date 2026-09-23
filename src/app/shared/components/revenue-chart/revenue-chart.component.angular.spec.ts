import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { ElementRef, LOCALE_ID, ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DashboardTimePoint } from '../../../core/models/flipbase.models';
import { type AppTheme, ThemeService } from '../../../core/services/theme.service';
import { ButtonComponent } from '../button/button.component';
import { REVENUE_CHART_LOADER, RevenueChartComponent } from './revenue-chart.component';
import type { RevenueChartHandle, RevenueChartLoader } from './revenue-chart.renderer';

beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources((url) =>
    readFile(
      resolve(
        'src/app/shared/components',
        url.includes('button') ? 'button' : 'revenue-chart',
        url,
      ),
      'utf8',
    ),
  );
  // Das Fallback-Testsetup benötigt für verschachtelte Signal-Inputs die AOT-Metadaten.
  const metadata = (
    ButtonComponent as unknown as {
      ɵcmp: { inputs: Record<string, unknown>; outputs: Record<string, string> };
    }
  ).ɵcmp;
  metadata.inputs = { ...metadata.inputs };
  metadata.outputs = { ...metadata.outputs };
  for (const name of ['variant', 'size', 'ariaPressed']) metadata.inputs[name] = [name, 1, null];
  metadata.outputs['clicked'] = 'clicked';
});

const points: readonly DashboardTimePoint[] = [
  {
    date: '2026-08-27',
    label: '27.08.',
    revenue: 19.98,
    costOfGoodsSold: 35,
    sellingCosts: 1,
    resultAfterDirectCosts: -16.02,
    expenses: 24.95,
    totalExpenses: 25.95,
    realizedProfit: -16.02,
  },
  {
    date: '2026-08-28',
    label: '28.08.',
    revenue: 0,
    costOfGoodsSold: null,
    sellingCosts: 0,
    resultAfterDirectCosts: null,
    expenses: 0,
    totalExpenses: null,
    realizedProfit: null,
  },
];

function setup(loader?: RevenueChartLoader) {
  const chart = {
    render: vi.fn().mockResolvedValue(undefined),
    updateOptions: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  } as unknown as RevenueChartHandle;
  const factory = vi.fn(() => chart);
  const chartPoints = signal(points);
  const theme = signal<AppTheme>('light');
  const fixture = TestBed.configureTestingModule({
    imports: [RevenueChartComponent],
    providers: [
      provideRouter([]),
      { provide: LOCALE_ID, useValue: 'de' },
      { provide: REVENUE_CHART_LOADER, useValue: loader ?? (async () => factory) },
      { provide: ThemeService, useValue: { currentTheme: theme } },
    ],
  }).createComponent(RevenueChartComponent);
  Object.assign(fixture.componentInstance, {
    points: chartPoints,
    chartElement: () => new ElementRef(fixture.nativeElement.querySelector('[role="img"]')),
  });
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    host: fixture.nativeElement as HTMLElement,
    chart,
    factory,
    chartPoints,
    theme,
  };
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

describe('RevenueChartComponent', () => {
  it('behält Umsatz, Gesamtausgaben, unbekannte Werte und negativen Gewinn in der Tabelle', async () => {
    const { fixture, host, component } = setup();
    await fixture.whenStable();
    expect(
      [...host.querySelectorAll('tbody tr')].map((row) =>
        [...row.querySelectorAll('th, td')].map((cell) => cell.textContent?.trim()),
      ),
    ).toEqual([
      ['27.08.', '19,98 €', '25,95 €', '-16,02 €'],
      ['28.08.', '0,00 €', 'unbekannt', 'unbekannt'],
    ]);
    expect(component.configuration().series[1].data).toEqual([25.95, null]);
    expect(component.configuration().series[2].data).toEqual([-16.02, null]);
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('Gewinn');
    expect(host.textContent).not.toContain('Cashflow');
    expect(host.querySelector('h2')?.className).not.toMatch(/uppercase|tracking-/);
    expect(host.querySelector('canvas')).toBeNull();
  });

  it('aktualisiert Daten und Theme ohne weitere Instanz und entfernt die Instanz beim Verlassen', async () => {
    const { fixture, factory, chart, theme, chartPoints } = setup();
    await fixture.whenStable();
    chartPoints.set([points[1]]);
    theme.set('dark');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(chart.updateOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        theme: { mode: 'dark' },
        xaxis: expect.objectContaining({ categories: ['28.08.'] }),
      }),
      true,
      true,
      false,
    );
    fixture.destroy();
    expect(chart.destroy).toHaveBeenCalledTimes(1);
  });

  it('bietet bei Importfehlern Daten und erneutes Laden an', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fixture, host } = setup(async () => {
      throw Error('offline');
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('nicht geladen');
    expect(host.querySelector('#revenue-chart-summary')?.classList.contains('sr-only')).toBe(false);
    expect(host.textContent).toContain('Erneut laden');
  });

  it('behält den Slider-Vertrag mit Home, End, Pfeiltasten und Escape', async () => {
    const { fixture, host } = setup();
    await fixture.whenStable();
    const navigator = host.querySelector<HTMLElement>('[role="slider"]');
    navigator?.focus();
    navigator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    fixture.detectChanges();
    expect(navigator?.getAttribute('aria-valuenow')).toBe('2');
    expect(navigator?.getAttribute('aria-valuetext')).toContain('Ausgaben gesamt unbekannt');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('28.08.');
    navigator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    fixture.detectChanges();
    expect(navigator?.getAttribute('aria-valuenow')).toBe('1');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('-16,02');
    navigator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  it('zeigt für Pointer und Tastatur dieselben Details innerhalb der Fenstergrenzen', async () => {
    const { fixture, component } = setup();
    await fixture.whenStable();
    component.handleKeyboardFocus();
    const keyboard = component.activeTooltip();
    component.handlePointer({ clientX: 0, clientY: window.innerHeight } as PointerEvent);
    expect(component.activeTooltip()?.lines).toEqual(keyboard?.lines);
    expect(component.activeTooltip()?.left).toBeGreaterThanOrEqual(8);
    expect(
      (component.activeTooltip()?.left ?? 0) + (component.activeTooltip()?.width ?? 0),
    ).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(component.activeTooltip()?.top).toBeLessThan(window.innerHeight - 100);
  });

  it('schaltet Legenden per gemeinsamem Button um und erhält sämtliche Tabellendaten', async () => {
    const { fixture, host, component } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const legendButton = host.querySelector<HTMLButtonElement>(
      'ul[aria-label="Diagrammlegende"] button',
    );
    expect(legendButton?.getAttribute('aria-pressed')).toBe('true');
    legendButton?.click();
    fixture.detectChanges();
    expect(legendButton?.getAttribute('aria-pressed')).toBe('false');
    expect(component.configuration().series[0].hidden).toBe(true);
    expect(component.configuration().series[0].data).toEqual([19.98, 0]);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('deaktiviert den Regler bei leeren Punkten und passt Reduced Motion live an', async () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const remove = vi.fn();
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
      addEventListener: (_: string, callback: (event: MediaQueryListEvent) => void) => {
        listener = callback;
      },
      removeEventListener: remove,
    } as unknown as MediaQueryList);
    const { fixture, component, chartPoints, host } = setup();
    await fixture.whenStable();
    expect(component.configuration().chart.animations?.enabled).toBe(false);
    listener?.({ matches: false } as MediaQueryListEvent);
    chartPoints.set([]);
    fixture.detectChanges();
    expect(component.configuration().chart.animations?.enabled).toBe(true);
    expect(host.querySelector('[role="slider"]')?.getAttribute('aria-disabled')).toBe('true');
    expect(host.querySelector('[role="slider"]')?.getAttribute('tabindex')).toBe('-1');
    fixture.destroy();
    expect(remove).toHaveBeenCalledOnce();
  });
});
