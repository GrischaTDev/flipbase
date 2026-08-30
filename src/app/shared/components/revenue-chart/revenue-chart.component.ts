import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { DashboardTimePoint } from '../../../core/models/flipbase.models';
import { ThemeService } from '../../../core/services/theme.service';
import { REVENUE_CHART_FACTORY, RevenueLineChart } from './revenue-chart.chart';
import { createRevenueChartConfiguration } from './revenue-chart.config';

interface ChartSeries {
  readonly key: 'revenue' | 'expenses' | 'realizedProfit';
  readonly label: string;
  readonly color: string;
  readonly path: string;
}

interface ChartGeometry {
  readonly series: readonly ChartSeries[];
  readonly minValue: number;
  readonly maxValue: number;
  readonly zeroY: number;
  readonly zeroLabelY: number;
  readonly labels: readonly { readonly x: number; readonly label: string }[];
}

/** Zahlungsstrom-Diagramm mit vollstaendiger tabellarischer Alternative. */
@Component({
  selector: 'app-revenue-chart',
  imports: [DecimalPipe],
  templateUrl: './revenue-chart.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevenueChartComponent {
  readonly points = input.required<readonly DashboardTimePoint[]>();
  readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private readonly themeService = inject(ThemeService);
  private readonly factory = inject(REVENUE_CHART_FACTORY);
  private readonly destroyRef = inject(DestroyRef);
  private readonly prefersReducedMotion = signal(false);
  private chartInstance?: RevenueLineChart;
  private renderedConfiguration?: ChartConfiguration<'line', number[], string>;
  private motionMediaQuery?: MediaQueryList;

  readonly configuration = computed(() =>
    createRevenueChartConfiguration(
      this.points(),
      this.themeService.currentTheme(),
      this.prefersReducedMotion(),
    ),
  );

  readonly chart = computed<ChartGeometry>(() => this.toChart(this.points()));

  constructor() {
    effect(() => {
      const configuration = this.configuration();
      const reducedMotion = this.prefersReducedMotion();
      const chart = this.chartInstance;

      if (!chart || configuration === this.renderedConfiguration) return;

      chart.data = configuration.data;
      chart.options = configuration.options ?? {};
      chart.update(reducedMotion ? 'none' : undefined);
      this.renderedConfiguration = configuration;
    });

    afterNextRender(() => this.initializeChart());

    this.destroyRef.onDestroy(() => {
      this.motionMediaQuery?.removeEventListener('change', this.handleMotionPreferenceChange);
      this.motionMediaQuery = undefined;

      const chart = this.chartInstance;
      this.chartInstance = undefined;
      this.renderedConfiguration = undefined;
      chart?.destroy();
    });
  }

  private readonly handleMotionPreferenceChange = (event: MediaQueryListEvent): void => {
    this.prefersReducedMotion.set(event.matches);
  };

  private initializeChart(): void {
    const mediaQuery = this.reducedMotionMediaQuery();
    if (mediaQuery) {
      this.motionMediaQuery = mediaQuery;
      this.prefersReducedMotion.set(mediaQuery.matches);
      mediaQuery.addEventListener('change', this.handleMotionPreferenceChange);
    }

    const configuration = this.configuration();
    this.chartInstance = this.factory(this.canvas().nativeElement, configuration);
    this.renderedConfiguration = configuration;
  }

  private reducedMotionMediaQuery(): MediaQueryList | undefined {
    try {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
        return undefined;
      return window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return undefined;
    }
  }

  private toChart(points: readonly DashboardTimePoint[]): ChartGeometry {
    const values = points.flatMap((point) => [point.revenue, point.expenses, point.realizedProfit]);
    const observedMin = Math.min(0, ...values);
    const observedMax = Math.max(0, ...values);
    // Bei einer reinen Nullreihe braucht die Projektion trotzdem eine Hoehe.
    // Die Nulllinie bleibt dann - wie bei positiven Daten - am unteren Rand.
    const minValue = observedMin;
    const maxValue = observedMax === observedMin ? observedMax + 1 : observedMax;
    const padding = { left: 40, right: 16, top: 20, bottom: 34 };
    const width = 1000 - padding.left - padding.right;
    const height = 260 - padding.top - padding.bottom;
    const denominator = Math.max(points.length - 1, 1);
    const xFor = (index: number) => padding.left + (index / denominator) * width;
    const yFor = (value: number) =>
      padding.top + height - ((value - minValue) / (maxValue - minValue)) * height;
    const pathFor = (key: ChartSeries['key']) =>
      points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point[key])}`)
        .join(' ');

    const step = Math.max(1, Math.ceil(points.length / 6));
    return {
      minValue,
      maxValue,
      zeroY: yFor(0),
      zeroLabelY: Math.min(padding.top + height - 4, Math.max(padding.top + 11, yFor(0) - 5)),
      series: [
        { key: 'revenue', label: 'Umsatz', color: '#60a5fa', path: pathFor('revenue') },
        { key: 'expenses', label: 'Ausgaben', color: '#fbbf24', path: pathFor('expenses') },
        {
          key: 'realizedProfit',
          label: 'Realisierter Gewinn',
          color: '#34d399',
          path: pathFor('realizedProfit'),
        },
      ],
      labels: points
        .map((point, index) => ({ x: xFor(index), label: point.label, index }))
        .filter(({ index }) => index % step === 0 || index === points.length - 1),
    };
  }
}
