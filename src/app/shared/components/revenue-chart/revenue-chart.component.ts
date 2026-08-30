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
import type { ChartConfiguration, TooltipModel } from 'chart.js';
import { DashboardTimePoint } from '../../../core/models/flipbase.models';
import { ThemeService } from '../../../core/services/theme.service';
import { REVENUE_CHART_FACTORY, RevenueLineChart } from './revenue-chart.chart';
import {
  REVENUE_CHART_SERIES,
  createRevenueChartConfiguration,
  revenueChartPalette,
} from './revenue-chart.config';

interface VisibleRevenueTooltip {
  readonly title: string;
  readonly lines: readonly string[];
  readonly left: number;
  readonly top: number;
}

const euroFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

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
  readonly activeTooltip = signal<VisibleRevenueTooltip | null>(null);
  private readonly requestedKeyboardPointIndex = signal(0);

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
      this.handleExternalTooltip,
    ),
  );
  readonly legendSeries = computed(() => {
    const palette = revenueChartPalette(this.themeService.currentTheme());
    return REVENUE_CHART_SERIES.map((series) => ({
      ...series,
      color: palette[series.key],
    }));
  });
  readonly keyboardPointIndex = computed(() => {
    const lastIndex = this.points().length - 1;
    return lastIndex < 0 ? 0 : Math.min(this.requestedKeyboardPointIndex(), lastIndex);
  });
  readonly keyboardPointMaximum = computed(() => Math.max(1, this.points().length));
  readonly keyboardPointValue = computed(() =>
    this.points().length > 0 ? this.keyboardPointIndex() + 1 : null,
  );
  readonly keyboardPointDescription = computed(() => {
    const point = this.points()[this.keyboardPointIndex()];
    if (!point) return 'Keine Datenpunkte verfügbar';
    return `${point.label}: Umsatz ${euroFormatter.format(point.revenue)}, Ausgaben ${euroFormatter.format(point.expenses)}, realisierter Gewinn ${euroFormatter.format(point.realizedProfit)}`;
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

  handleKeyboardFocus(): void {
    this.showKeyboardTooltip();
  }

  handleKeyboardBlur(): void {
    this.activeTooltip.set(null);
  }

  handleKeyboardNavigation(event: KeyboardEvent): void {
    const pointCount = this.points().length;
    if (pointCount === 0) return;

    const currentIndex = this.keyboardPointIndex();
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = Math.min(currentIndex + 1, pointCount - 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = pointCount - 1;
        break;
      case 'Escape':
        event.preventDefault();
        this.activeTooltip.set(null);
        return;
      default:
        return;
    }

    event.preventDefault();
    this.requestedKeyboardPointIndex.set(nextIndex);
    this.showKeyboardTooltip();
  }

  private readonly handleMotionPreferenceChange = (event: MediaQueryListEvent): void => {
    this.prefersReducedMotion.set(event.matches);
  };

  private readonly handleExternalTooltip = (tooltip: TooltipModel<'line'>): void => {
    if (tooltip.opacity === 0) {
      this.activeTooltip.set(null);
      return;
    }

    const title = tooltip.title[0];
    const lines = tooltip.body.flatMap((entry) => entry.lines);
    if (!title || lines.length === 0) {
      this.activeTooltip.set(null);
      return;
    }

    this.activeTooltip.set({
      title,
      lines,
      left: tooltip.caretX + 8,
      top: tooltip.caretY + 8,
    });
  };

  private showKeyboardTooltip(): void {
    const points = this.points();
    const point = points[this.keyboardPointIndex()];
    if (!point) {
      this.activeTooltip.set(null);
      return;
    }

    const canvas = this.canvas().nativeElement;
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    const horizontalInset = 16;
    const usableWidth = Math.max(0, width - horizontalInset * 2);
    const position = points.length === 1 ? 0.5 : this.keyboardPointIndex() / (points.length - 1);

    this.activeTooltip.set({
      title: point.label,
      lines: [
        `Umsatz: ${euroFormatter.format(point.revenue)}`,
        `Ausgaben: ${euroFormatter.format(point.expenses)}`,
        `Realisierter Gewinn: ${euroFormatter.format(point.realizedProfit)}`,
      ],
      left: horizontalInset + usableWidth * position,
      top: Math.max(80, height / 2),
    });
  }

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
