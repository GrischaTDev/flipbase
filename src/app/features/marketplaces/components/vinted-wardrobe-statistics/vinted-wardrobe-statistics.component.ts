import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { LucideEye, LucideHeart, LucideLightbulb } from '@lucide/angular';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import {
  BASELINE_Y,
  CHART_HEIGHT,
  CHART_MARGIN,
  CHART_WIDTH,
  PLOT_HEIGHT,
  PLOT_WIDTH,
  buildWardrobeStatistics,
  type VintedWardrobeChartPoint,
  type VintedWardrobeTimeframe,
} from '../../models/vinted-wardrobe-statistics';

@Component({
  selector: 'app-vinted-wardrobe-statistics',
  imports: [LucideEye, LucideHeart, LucideLightbulb],
  templateUrl: './vinted-wardrobe-statistics.component.html',
  styleUrl: './vinted-wardrobe-statistics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0 space-y-4 mb-6',
  },
})
export class VintedWardrobeStatisticsComponent {
  readonly items = input<readonly MarketplaceEntry[]>([]);
  readonly totalCount = input<number | null>(null);

  readonly timeframe = signal<VintedWardrobeTimeframe>('7d');
  readonly collapsed = signal(false);
  readonly hoveredIndex = signal<number | null>(null);

  protected readonly chartWidth = CHART_WIDTH;
  protected readonly chartHeight = CHART_HEIGHT;
  protected readonly chartMargin = CHART_MARGIN;
  protected readonly plotWidth = PLOT_WIDTH;
  protected readonly plotHeight = PLOT_HEIGHT;
  protected readonly baselineY = BASELINE_Y;

  readonly data = computed(() =>
    buildWardrobeStatistics(this.items(), this.timeframe(), this.totalCount() ?? undefined),
  );

  readonly activeIndex = computed(() => {
    const h = this.hoveredIndex();
    if (h !== null && h >= 0 && h < this.data().points.length) return h;
    const peakIdx = this.data().points.findIndex((p) => p.isPeak);
    return peakIdx >= 0 ? peakIdx : 0;
  });

  readonly activePoint = computed<VintedWardrobeChartPoint | null>(() => {
    const points = this.data().points;
    const idx = this.activeIndex();
    return points[idx] ?? null;
  });

  readonly tooltipLeftPercent = computed(() => {
    const pt = this.activePoint();
    if (!pt) return 50;
    return (pt.x / CHART_WIDTH) * 100;
  });

  readonly yAxisSteps = computed(() => {
    const max = this.data().maxY;
    return [
      { val: max, y: CHART_MARGIN.top },
      { val: Math.round(max * 0.75), y: CHART_MARGIN.top + PLOT_HEIGHT * 0.25 },
      { val: Math.round(max * 0.5), y: CHART_MARGIN.top + PLOT_HEIGHT * 0.5 },
      { val: Math.round(max * 0.25), y: CHART_MARGIN.top + PLOT_HEIGHT * 0.75 },
      { val: 0, y: BASELINE_Y },
    ];
  });

  setTimeframe(tf: VintedWardrobeTimeframe): void {
    this.timeframe.set(tf);
    this.hoveredIndex.set(null);
  }

  toggleCollapse(): void {
    this.collapsed.update((v) => !v);
  }

  onMouseMove(event: MouseEvent, svgElement: Element): void {
    const rect = svgElement.getBoundingClientRect();
    if (rect.width <= 0) return;
    const clientX = event.clientX - rect.left;
    const svgX = (clientX / rect.width) * CHART_WIDTH;

    const points = this.data().points;
    if (points.length === 0) return;

    let closestIdx = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].x - svgX);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = i;
      }
    }

    this.hoveredIndex.set(closestIdx);
  }

  onMouseLeave(): void {
    this.hoveredIndex.set(null);
  }

  onKeyDown(event: KeyboardEvent): void {
    const points = this.data().points;
    if (points.length === 0) return;
    const current = this.activeIndex();

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.hoveredIndex.set(Math.min(points.length - 1, current + 1));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.hoveredIndex.set(Math.max(0, current - 1));
    }
  }
}
