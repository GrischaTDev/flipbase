import '@angular/compiler';
import { ElementRef, ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DashboardTimePoint } from '../../../core/models/flipbase.models';
import { AppTheme, ThemeService } from '../../../core/services/theme.service';
import {
  REVENUE_CHART_FACTORY,
  RevenueChartFactory,
  RevenueLineChart,
} from './revenue-chart.chart';
import { RevenueChartComponent } from './revenue-chart.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

const points: readonly DashboardTimePoint[] = [
  { date: '2026-08-27', label: '27.08.', revenue: 19.98, expenses: 24.95, realizedProfit: 9 },
  { date: '2026-08-28', label: '28.08.', revenue: 0, expenses: 0, realizedProfit: 0 },
];

interface ChartDouble {
  readonly chart: RevenueLineChart;
  readonly update: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
}

interface MediaQueryDouble {
  readonly mediaQueryList: MediaQueryList;
  readonly addEventListener: ReturnType<typeof vi.fn>;
  readonly removeEventListener: ReturnType<typeof vi.fn>;
  dispatch(matches: boolean): void;
}

function createChartDouble(): ChartDouble {
  const update = vi.fn();
  const destroy = vi.fn();
  const chart = {
    data: { labels: [], datasets: [] },
    options: {},
    update,
    destroy,
  } as unknown as RevenueLineChart;

  return { chart, update, destroy };
}

function createMediaQueryDouble(matches = false): MediaQueryDouble {
  let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
  const addEventListener = vi.fn(
    (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      changeListener = listener as (event: MediaQueryListEvent) => void;
    },
  );
  const removeEventListener = vi.fn();
  const mediaQueryList = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;

  return {
    mediaQueryList,
    addEventListener,
    removeEventListener,
    dispatch(nextMatches: boolean): void {
      changeListener?.({ matches: nextMatches } as MediaQueryListEvent);
    },
  };
}

function createFixture(
  theme: ReturnType<typeof signal<AppTheme>>,
  factory: RevenueChartFactory,
  chartPoints: ReturnType<typeof signal<readonly DashboardTimePoint[]>> = signal(points),
) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [RevenueChartComponent],
    providers: [
      { provide: REVENUE_CHART_FACTORY, useValue: factory },
      { provide: ThemeService, useValue: { currentTheme: theme } },
    ],
  }).createComponent(RevenueChartComponent);
  // Der direkte Komponenten-Test laeuft ohne Angulars AOT-Input-Metadaten.
  // Die beiden Bruecken bilden denselben reaktiven Input- und Queryvertrag ab.
  Object.assign(fixture.componentInstance, { points: chartPoints });
  const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
  Object.defineProperty(fixture.componentInstance, 'canvas', {
    configurable: true,
    value: () => new ElementRef(canvas),
  });
  fixture.detectChanges();
  return fixture;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RevenueChartComponent lifecycle', () => {
  it('erzeugt genau eine Chart-Instanz am echten Canvas ohne initiales Doppel-Update', async () => {
    const mediaQuery = createMediaQueryDouble();
    vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery.mediaQueryList);
    const { chart, update } = createChartDouble();
    const factory = vi.fn(() => chart);

    const fixture = createFixture(signal<AppTheme>('light'), factory);
    await fixture.whenStable();

    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(
      canvas,
      expect.objectContaining({
        type: 'line',
        data: expect.objectContaining({ labels: ['27.08.', '28.08.'] }),
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('ersetzt Daten und Optionen bei neuen Punkten ohne zweite Chart-Instanz', async () => {
    const mediaQuery = createMediaQueryDouble();
    vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery.mediaQueryList);
    const { chart, update } = createChartDouble();
    const factory = vi.fn(() => chart);
    const chartPoints = signal<readonly DashboardTimePoint[]>(points);
    const fixture = createFixture(signal<AppTheme>('light'), factory, chartPoints);
    await fixture.whenStable();
    const previousData = chart.data;
    const previousOptions = chart.options;

    chartPoints.set([
      { date: '2026-08-29', label: '29.08.', revenue: 50, expenses: 12, realizedProfit: 38 },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(chart.data).not.toBe(previousData);
    expect(chart.options).not.toBe(previousOptions);
    expect(chart.data.labels).toEqual(['29.08.']);
    expect(chart.data.datasets.map(({ data }) => data)).toEqual([[50], [12], [38]]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(undefined);
  });

  it('aktualisiert die bestehende Instanz bei einem Themewechsel', async () => {
    const mediaQuery = createMediaQueryDouble();
    vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery.mediaQueryList);
    const theme = signal<AppTheme>('light');
    const { chart, update } = createChartDouble();
    const factory = vi.fn(() => chart);
    const fixture = createFixture(theme, factory);
    await fixture.whenStable();
    const previousOptions = chart.options;

    theme.set('dark');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(chart.options).not.toBe(previousOptions);
    expect(update).toHaveBeenCalledWith(undefined);
  });

  it("aktualisiert bei einer Reduced-Motion-Aenderung ohne Animation mit 'none'", async () => {
    const mediaQuery = createMediaQueryDouble();
    vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery.mediaQueryList);
    const { chart, update } = createChartDouble();
    const fixture = createFixture(
      signal<AppTheme>('light'),
      vi.fn(() => chart),
    );
    await fixture.whenStable();

    mediaQuery.dispatch(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(chart.options.animation).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('none');
  });

  it('zerstoert die Instanz und entfernt den MediaQuery-Listener exakt einmal', async () => {
    const mediaQuery = createMediaQueryDouble();
    vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery.mediaQueryList);
    const { chart, destroy } = createChartDouble();
    const fixture = createFixture(
      signal<AppTheme>('light'),
      vi.fn(() => chart),
    );
    await fixture.whenStable();
    const registeredListener = mediaQuery.addEventListener.mock.calls[0]?.[1];

    fixture.destroy();

    expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(mediaQuery.removeEventListener).toHaveBeenCalledTimes(1);
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', registeredListener);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
