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
import {
  REVENUE_CHART_SERIES,
  createRevenueChartConfiguration,
  revenueChartPalette,
} from './revenue-chart.config';

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
  readonly legendSeries = computed(() => {
    const palette = revenueChartPalette(this.themeService.currentTheme());
    return REVENUE_CHART_SERIES.map((series) => ({
      ...series,
      color: palette[series.key],
    }));
  });

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
}
