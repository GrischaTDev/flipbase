import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { ElementRef, LOCALE_ID, ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
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
beforeAll(async () => {
  registerLocaleData(localeDe);
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
      { provide: LOCALE_ID, useValue: 'de' },
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

describe('RevenueChartComponent Barrierefreiheit', () => {
  it('gibt den aktiven Chart-Punkt sichtbar und als Live-Status im DOM aus', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(createMediaQueryDouble().mediaQueryList);
    const { chart } = createChartDouble();
    const fixture = createFixture(
      signal<AppTheme>('light'),
      vi.fn(() => chart),
    );
    await fixture.whenStable();
    const external = fixture.componentInstance.configuration().options?.plugins?.tooltip?.external;
    expect(external).toBeTypeOf('function');

    external?.call(
      {} as never,
      {
        chart,
        tooltip: {
          opacity: 1,
          title: ['27.08.'],
          body: [{ lines: ['Umsatz: 19,98 €'] }, { lines: ['Realisierter Gewinn: 9,00 €'] }],
          caretX: 120,
          caretY: 80,
        },
      } as never,
    );
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    expect(status).not.toBeNull();
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(status.textContent).toContain('27.08.');
    expect(status.textContent).toContain('Umsatz: 19,98 €');
    expect(status.textContent).toContain('Realisierter Gewinn: 9,00 €');
    expect(status.style.left).toBe('128px');
    expect(status.style.top).toBe('88px');

    external?.call({} as never, { chart, tooltip: { opacity: 0 } } as never);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
  });

  it('rendert genau einen beschrifteten Canvas in einer stabilen Zeichenflaeche und kein SVG', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(createMediaQueryDouble().mediaQueryList);
    const { chart } = createChartDouble();
    const fixture = createFixture(
      signal<AppTheme>('light'),
      vi.fn(() => chart),
    );
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    expect(host.querySelector('svg')).toBeNull();
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.hidden).toBe(false);
    expect(canvas.hasAttribute('aria-hidden')).toBe(false);
    expect(canvas.hasAttribute('tabindex')).toBe(false);
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe(
      'Umsatz, Ausgaben und realisierter Gewinn im gewählten Zeitraum',
    );
    expect(canvas.getAttribute('aria-describedby')).toBe('revenue-chart-summary');
    expect(canvas.parentElement?.classList.contains('relative')).toBe(true);
    expect(canvas.parentElement?.classList.contains('h-[260px]')).toBe(true);
    expect(canvas.parentElement?.classList.contains('w-full')).toBe(true);
  });

  it('zeigt alle drei Reihen in einer themereaktiven visuellen Legende', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(createMediaQueryDouble().mediaQueryList);
    const theme = signal<AppTheme>('light');
    const { chart } = createChartDouble();
    const fixture = createFixture(
      theme,
      vi.fn(() => chart),
    );
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const legend = host.querySelector<HTMLUListElement>('ul[aria-label="Diagrammlegende"]');
    const legendEntries = () => [...(legend?.querySelectorAll<HTMLElement>(':scope > li') ?? [])];

    expect(legend).not.toBeNull();
    expect(host.querySelector('div[aria-label="Diagrammlegende"]')).toBeNull();
    expect(legendEntries()).toHaveLength(3);
    expect(legendEntries().map((entry) => entry.textContent?.trim())).toEqual([
      'Umsatz',
      'Ausgaben',
      'Realisierter Gewinn',
    ]);
    expect(
      legendEntries().map(
        (entry) =>
          entry.querySelector<HTMLElement>('[data-chart-legend-indicator]')?.style.backgroundColor,
      ),
    ).toEqual(['rgb(29, 78, 216)', 'rgb(180, 83, 9)', 'rgb(4, 120, 87)']);

    theme.set('dark');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      legendEntries().map(
        (entry) =>
          entry.querySelector<HTMLElement>('[data-chart-legend-indicator]')?.style.backgroundColor,
      ),
    ).toEqual(['rgb(196, 196, 196)', 'rgb(248, 157, 19)', 'rgb(87, 199, 118)']);
  });

  it('enthaelt eine vollstaendige externe Datentabelle ohne interaktive Elemente', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(createMediaQueryDouble().mediaQueryList);
    const { chart } = createChartDouble();
    const fixture = createFixture(
      signal<AppTheme>('light'),
      vi.fn(() => chart),
    );
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    const summary = host.querySelector('#revenue-chart-summary') as HTMLElement;
    const table = summary.querySelector('table') as HTMLTableElement;

    expect(summary.contains(canvas)).toBe(false);
    expect(table.caption?.textContent?.trim()).toBe('Tabellarische Zusammenfassung des Diagramms');
    expect(
      [...table.querySelectorAll<HTMLTableCellElement>('thead th')].map((header) => ({
        text: header.textContent?.trim(),
        scope: header.getAttribute('scope'),
      })),
    ).toEqual([
      { text: 'Zeitraum', scope: 'col' },
      { text: 'Umsatz', scope: 'col' },
      { text: 'Ausgaben', scope: 'col' },
      { text: 'Realisierter Gewinn', scope: 'col' },
    ]);
    expect(
      [...table.querySelectorAll<HTMLTableCellElement>('tbody th')].map((header) => ({
        text: header.textContent?.trim(),
        scope: header.getAttribute('scope'),
      })),
    ).toEqual([
      { text: '27.08.', scope: 'row' },
      { text: '28.08.', scope: 'row' },
    ]);
    expect(
      summary.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).toHaveLength(0);
  });

  it('synchronisiert Reihenfolge und Werte der Tabellenzeilen exakt mit neuen Punkten', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(createMediaQueryDouble().mediaQueryList);
    const chartPoints = signal<readonly DashboardTimePoint[]>(points);
    const { chart } = createChartDouble();
    const fixture = createFixture(
      signal<AppTheme>('light'),
      vi.fn(() => chart),
      chartPoints,
    );
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    chartPoints.set([
      {
        date: '2026-08-30',
        label: '30.08.',
        revenue: 1234.5,
        expenses: 11.25,
        realizedProfit: 1223.25,
      },
      {
        date: '2026-08-29',
        label: '29.08.',
        revenue: 50,
        expenses: 75.75,
        realizedProfit: -25.75,
      },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    const tableRows = [
      ...host.querySelectorAll<HTMLTableRowElement>('#revenue-chart-summary tbody tr'),
    ];
    expect(
      tableRows.map((row) =>
        [...row.querySelectorAll<HTMLTableCellElement>('th, td')].map((cell) =>
          cell.textContent?.trim(),
        ),
      ),
    ).toEqual([
      ['30.08.', '1.234,50 €', '11,25 €', '1.223,25 €'],
      ['29.08.', '50,00 €', '75,75 €', '-25,75 €'],
    ]);

    chartPoints.set([]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelectorAll('#revenue-chart-summary tbody tr')).toHaveLength(0);
    const navigator = host.querySelector<HTMLElement>('[role="slider"]');
    expect(navigator?.tabIndex).toBe(-1);
    expect(navigator?.getAttribute('aria-disabled')).toBe('true');
    expect(navigator?.hasAttribute('aria-valuenow')).toBe(false);
    expect(navigator?.getAttribute('aria-valuetext')).toBe('Keine Datenpunkte verfügbar');
  });

  it('macht alle Datenpunkte ueber einen semantischen Tastaturregler erreichbar', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(createMediaQueryDouble().mediaQueryList);
    const { chart } = createChartDouble();
    const fixture = createFixture(
      signal<AppTheme>('light'),
      vi.fn(() => chart),
    );
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const navigator = host.querySelector<HTMLElement>(
      '[role="slider"][aria-label="Datenpunkt im Zahlungsstrom-Diagramm auswählen"]',
    );

    expect(navigator).not.toBeNull();
    expect(navigator?.tabIndex).toBe(0);
    expect(navigator?.getAttribute('aria-valuemin')).toBe('1');
    expect(navigator?.getAttribute('aria-valuemax')).toBe('2');
    expect(navigator?.getAttribute('aria-valuenow')).toBe('1');
    expect(navigator?.getAttribute('aria-valuetext')).toMatch(
      /^27\.08\.: Umsatz 19,98\s€, Ausgaben 24,95\s€, realisierter Gewinn 9,00\s€$/,
    );
    expect(navigator?.getAttribute('aria-describedby')).toBe(
      'revenue-chart-keyboard-help revenue-chart-summary',
    );

    navigator?.focus();
    navigator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(navigator);
    expect(navigator?.getAttribute('aria-valuenow')).toBe('2');
    expect(navigator?.getAttribute('aria-valuetext')).toMatch(
      /^28\.08\.: Umsatz 0,00\s€, Ausgaben 0,00\s€, realisierter Gewinn 0,00\s€$/,
    );
    const status = host.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toContain('28.08.');
    expect(status?.textContent).toMatch(/Umsatz: 0,00\s€/);

    navigator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    expect(navigator?.getAttribute('aria-valuenow')).toBe('1');
    expect(host.querySelector<HTMLElement>('[role="status"]')?.textContent).toContain('27.08.');

    navigator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  it('besteht den automatisierten Axe-Test ohne jsdom-Farbkontrastpruefung', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(createMediaQueryDouble().mediaQueryList);
    const { chart } = createChartDouble();
    const fixture = createFixture(
      signal<AppTheme>('light'),
      vi.fn(() => chart),
    );
    await fixture.whenStable();

    const result = await axe.run(fixture.nativeElement, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });
});
