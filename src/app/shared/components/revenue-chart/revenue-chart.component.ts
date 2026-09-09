import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { DashboardTimePoint } from '../../../core/models/flipbase.models';
import { ThemeService } from '../../../core/services/theme.service';
import { LoggerService } from '../../../core/services/logger.service';
import { ButtonComponent } from '../button/button.component';
import {
  REVENUE_CHART_SERIES,
  createRevenueChartConfiguration,
  formatChartAmount,
  revenueChartPalette,
} from './revenue-chart.config';
import {
  RevenueChartRenderer,
  loadRevenueChart,
  type RevenueChartLoader,
  type RevenueChartStatus,
} from './revenue-chart.renderer';

export const REVENUE_CHART_LOADER = new InjectionToken<RevenueChartLoader>('REVENUE_CHART_LOADER', {
  providedIn: 'root',
  factory: () => loadRevenueChart,
});

interface VisibleRevenueTooltip {
  readonly title: string;
  readonly lines: readonly string[];
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

/** Zahlungsstrom-Diagramm mit vollständiger tabellarischer Alternative. */
@Component({
  selector: 'app-revenue-chart',
  imports: [DecimalPipe, ButtonComponent],
  templateUrl: './revenue-chart.component.html',
  host: {
    class: 'block min-w-0',
    '(window:resize)': 'closeTooltip()',
    '(window:scroll)': 'closeTooltip()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevenueChartComponent {
  readonly points = input.required<readonly DashboardTimePoint[]>();
  readonly chartElement = viewChild<ElementRef<HTMLDivElement>>('chart');
  readonly activeTooltip = signal<VisibleRevenueTooltip | null>(null);
  readonly chartStatus = signal<RevenueChartStatus>('loading');
  private readonly requestedKeyboardPointIndex = signal(0);
  private readonly hiddenSeries = signal<readonly string[]>([]);
  private readonly themeService = inject(ThemeService);
  private readonly logger = inject(LoggerService);
  private readonly load = inject(REVENUE_CHART_LOADER);
  private readonly destroyRef = inject(DestroyRef);
  private readonly prefersReducedMotion = signal(false);
  private renderer?: RevenueChartRenderer;
  private motionMediaQuery?: MediaQueryList;

  readonly configuration = computed(() => {
    const configuration = createRevenueChartConfiguration(
      this.points(),
      this.themeService.currentTheme(),
      this.prefersReducedMotion(),
    );
    return {
      ...configuration,
      series: configuration.series.map((series) => ({
        ...series,
        hidden: this.hiddenSeries().includes(series.name ?? ''),
      })),
    };
  });
  readonly legendSeries = computed(() => {
    const palette = revenueChartPalette(this.themeService.currentTheme());
    return REVENUE_CHART_SERIES.map((series) => ({
      ...series,
      color: palette[series.key],
      visible: !this.hiddenSeries().includes(series.label),
    }));
  });
  readonly keyboardPointIndex = computed(() =>
    Math.max(0, Math.min(this.requestedKeyboardPointIndex(), this.points().length - 1)),
  );
  readonly keyboardPointMaximum = computed(() => Math.max(1, this.points().length));
  readonly keyboardPointValue = computed(() =>
    this.points().length ? this.keyboardPointIndex() + 1 : null,
  );
  readonly keyboardPointDescription = computed(() => {
    const point = this.points()[this.keyboardPointIndex()];
    return point
      ? `${point.label}: ${REVENUE_CHART_SERIES.map((series) => `${series.label} ${formatChartAmount(point[series.key])}`).join(', ')}`
      : 'Keine Datenpunkte verfügbar';
  });

  constructor() {
    effect(() => {
      const configuration = this.configuration();
      this.closeTooltip();
      void this.renderer?.update(configuration);
    });
    afterNextRender(() => this.initializeChart());
    this.destroyRef.onDestroy(() => {
      this.motionMediaQuery?.removeEventListener('change', this.handleMotionPreferenceChange);
      this.renderer?.destroy();
      this.renderer = undefined;
    });
  }

  toggleSeries(name: string): void {
    this.hiddenSeries.update((hidden) =>
      hidden.includes(name) ? hidden.filter((value) => value !== name) : [...hidden, name],
    );
  }

  retryChart(): void {
    // Browser behalten fehlgeschlagene ES-Modul-Imports im Modulcache.
    if (this.renderer?.reloadRequired) {
      window.location.reload();
      return;
    }
    void this.renderer?.update(this.configuration());
  }
  closeTooltip(): void {
    this.activeTooltip.set(null);
  }
  handleKeyboardBlur(): void {
    this.closeTooltip();
  }
  handleKeyboardFocus(): void {
    this.showPoint(this.keyboardPointIndex());
  }

  handlePointer(event: PointerEvent): void {
    const chart = this.chartElement()?.nativeElement;
    if (!chart || !this.points().length) return;
    const bounds = (chart.querySelector('.apexcharts-grid') ?? chart).getBoundingClientRect();
    const position = Math.min(
      1,
      Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width)),
    );
    const index = Math.round(position * (this.points().length - 1));
    this.requestedKeyboardPointIndex.set(index);
    this.showPoint(index, event.clientX, event.clientY);
  }

  handlePointerLeave(event: PointerEvent): void {
    if (event.pointerType !== 'touch') this.closeTooltip();
  }

  handleKeyboardNavigation(event: KeyboardEvent): void {
    const pointCount = this.points().length;
    if (!pointCount) return;
    let nextIndex = this.keyboardPointIndex();
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = Math.min(nextIndex + 1, pointCount - 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = Math.max(nextIndex - 1, 0);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = pointCount - 1;
        break;
      case 'Escape':
        event.preventDefault();
        this.closeTooltip();
        return;
      default:
        return;
    }
    event.preventDefault();
    this.requestedKeyboardPointIndex.set(nextIndex);
    this.showPoint(nextIndex);
  }

  private showPoint(index: number, clientX?: number, clientY?: number): void {
    const point = this.points()[index];
    if (!point) return this.closeTooltip();
    const bounds = this.chartElement()?.nativeElement.getBoundingClientRect();
    const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
    const width = Math.min(360, viewportWidth - 16);
    const left =
      (clientX ??
        (bounds?.left ?? 0) +
          (bounds?.width ?? 0) *
            (this.points().length === 1 ? 0.5 : index / (this.points().length - 1))) -
      width / 2;
    const top = (clientY ?? (bounds?.top ?? 0) + 100) + 12;
    this.activeTooltip.set({
      title: point.label,
      lines: REVENUE_CHART_SERIES.map(
        (series) => `${series.label}: ${formatChartAmount(point[series.key])}`,
      ),
      left: Math.max(8, Math.min(left, viewportWidth - width - 8)),
      top: Math.max(8, Math.min(top, viewportHeight - 190)),
      width,
    });
  }

  private readonly handleMotionPreferenceChange = (event: MediaQueryListEvent): void => {
    this.prefersReducedMotion.set(event.matches);
  };

  private initializeChart(): void {
    if (typeof window.matchMedia === 'function') {
      this.motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.prefersReducedMotion.set(this.motionMediaQuery.matches);
      this.motionMediaQuery.addEventListener('change', this.handleMotionPreferenceChange);
    }
    const element = this.chartElement()?.nativeElement;
    if (!element) return;
    this.renderer = new RevenueChartRenderer(element, this.load, (status, error) => {
      this.chartStatus.set(status);
      if (error) this.logger.error('Diagramm konnte nicht geladen werden!', error);
    });
    void this.renderer.update(this.configuration());
  }
}
