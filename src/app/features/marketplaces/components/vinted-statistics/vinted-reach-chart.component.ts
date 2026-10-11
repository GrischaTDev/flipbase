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
import { LoggerService } from '../../../../core/services/logger.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  RevenueChartRenderer,
  loadRevenueChart,
  type RevenueChartLoader,
  type RevenueChartStatus,
} from '../../../../shared/components/revenue-chart/revenue-chart.renderer';
import {
  createVintedReachChartConfiguration,
  type VintedReachChartPoint,
} from '../../models/vinted-reach-chart.config';
import { formatCount } from '../../models/vinted-statistics-overview';

/** Lädt ApexCharts erst beim ersten Diagramm; Tests ersetzen den Lader. */
export const VINTED_REACH_CHART_LOADER = new InjectionToken<RevenueChartLoader>(
  'VINTED_REACH_CHART_LOADER',
  { providedIn: 'root', factory: () => loadRevenueChart },
);

/** Säulendiagramm für Aufrufe oder Favoriten mit vollständiger Tabelle als Alternative. */
@Component({
  selector: 'app-vinted-reach-chart',
  imports: [ButtonComponent],
  templateUrl: './vinted-reach-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedReachChartComponent {
  readonly points = input.required<readonly VintedReachChartPoint[]>();
  readonly seriesName = input.required<string>();
  readonly chartElement = viewChild<ElementRef<HTMLDivElement>>('chart');
  readonly chartStatus = signal<RevenueChartStatus>('loading');
  readonly tableVisible = signal(false);
  private readonly activeIndex = signal<number | null>(null);
  private readonly prefersReducedMotion = signal(false);
  private readonly themeService = inject(ThemeService);
  private readonly logger = inject(LoggerService);
  private readonly load = inject(VINTED_REACH_CHART_LOADER);
  private readonly destroyRef = inject(DestroyRef);
  private renderer?: RevenueChartRenderer;

  readonly configuration = computed(() =>
    createVintedReachChartConfiguration(
      this.points(),
      this.seriesName(),
      this.themeService.currentTheme(),
      this.prefersReducedMotion(),
    ),
  );
  readonly rows = computed(() =>
    this.points().map((point) => ({ ...point, formatted: formatCount(point.value) })),
  );
  readonly detail = computed(() => {
    const points = this.points();
    const index = this.activeIndex();
    const active = index === null ? null : points[index];
    if (active) return `${active.description}: ${formatCount(active.value)} ${this.seriesName()}`;
    const peak = points.reduce<VintedReachChartPoint | null>(
      (best, point) => (point.value > (best?.value ?? 0) ? point : best),
      null,
    );
    return peak
      ? `Stärkster Abschnitt: ${peak.description} mit ${formatCount(peak.value)} ${this.seriesName()}`
      : `Im gewählten Zeitraum gab es keine neuen ${this.seriesName()}.`;
  });

  constructor() {
    effect(() => {
      const configuration = this.configuration();
      this.activeIndex.set(null);
      void this.renderer?.update(configuration);
    });
    afterNextRender(() => {
      if (typeof window.matchMedia === 'function')
        this.prefersReducedMotion.set(
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        );
      const element = this.chartElement()?.nativeElement;
      if (!element) return;
      this.renderer = new RevenueChartRenderer(element, this.load, (status, error) => {
        this.chartStatus.set(status);
        if (error) this.logger.error('Diagramm konnte nicht geladen werden!', error);
      });
      void this.renderer.update(this.configuration());
    });
    this.destroyRef.onDestroy(() => {
      this.renderer?.destroy();
      this.renderer = undefined;
    });
  }

  toggleTable(): void {
    this.tableVisible.update((visible) => !visible);
  }
  showPoint(index: number): void {
    this.activeIndex.set(index >= 0 && index < this.points().length ? index : null);
  }
  clearPoint(): void {
    this.activeIndex.set(null);
  }
  handlePointer(event: PointerEvent): void {
    const chart = this.chartElement()?.nativeElement;
    const count = this.points().length;
    if (!chart || !count) return;
    const bounds = (chart.querySelector('.apexcharts-grid') ?? chart).getBoundingClientRect();
    const position = (event.clientX - bounds.left) / Math.max(1, bounds.width);
    this.showPoint(Math.min(count - 1, Math.max(0, Math.floor(position * count))));
  }
  retryChart(): void {
    // Browser behalten fehlgeschlagene ES-Modul-Imports im Modulcache.
    if (this.renderer?.reloadRequired) {
      window.location.reload();
      return;
    }
    void this.renderer?.update(this.configuration());
  }
}
