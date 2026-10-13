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
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { LucideExternalLink, LucideRefreshCw } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ThemeService } from '../../../../core/services/theme.service';
import {
  RevenueChartRenderer,
  loadRevenueChart,
  type RevenueChartStatus,
} from '../../../../shared/components/revenue-chart/revenue-chart.renderer';
import type { ApexOptions } from 'apexcharts';
import type {
  EbayConnection,
  EbayTrafficDays,
  EbayTrafficOverview,
} from '../../../../../../supabase/functions/_shared/ebay-contracts';
import { EbayAccountApiService } from '../../services/ebay-account-api.service';
import { summarizeEbayTraffic } from '../../models/ebay-traffic-summary';

@Component({
  selector: 'app-ebay-traffic-overview',
  imports: [ButtonComponent, CardComponent, DatePipe, DecimalPipe, PercentPipe],
  templateUrl: './ebay-traffic-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class EbayTrafficOverviewComponent {
  readonly connection = input.required<EbayConnection>();
  readonly periods = [7, 30, 90] as const;
  readonly selectedDays = signal<EbayTrafficDays>(30);
  readonly report = signal<EbayTrafficOverview | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly summary = computed(() => summarizeEbayTraffic(this.report()?.days ?? []));
  readonly dailyValues = computed(() =>
    (this.report()?.days ?? []).map((day) => ({ ...day, ...summarizeEbayTraffic([day]) })),
  );
  readonly selectedMetric = signal<'impressions' | 'views' | 'transactions'>('views');
  readonly chartMetrics = [
    { key: 'impressions', label: 'Impressionen' },
    { key: 'views', label: 'Aufrufe' },
    { key: 'transactions', label: 'Käufe' },
  ] as const;
  readonly metricLabel = computed(
    () =>
      this.chartMetrics.find((metric) => metric.key === this.selectedMetric())?.label ?? 'Aufrufe',
  );
  readonly chartStatus = signal<RevenueChartStatus>('loading');
  readonly showDailyValues = signal(false);
  readonly refreshIcon = LucideRefreshCw;
  readonly externalIcon = LucideExternalLink;
  private readonly chartElement = viewChild<ElementRef<HTMLDivElement>>('chart');
  private readonly rendered = signal(false);
  private readonly api = inject(EbayAccountApiService);
  private readonly theme = inject(ThemeService);
  private renderer?: RevenueChartRenderer;
  private revision = 0;

  constructor() {
    effect(() => {
      const connection = this.connection();
      const days = this.selectedDays();
      untracked(() => void this.load(connection, days));
    });
    afterNextRender(() => this.rendered.set(true));
    effect(() => {
      const element = this.chartElement()?.nativeElement;
      const report = this.report();
      const options = this.chartOptions();
      if (!this.rendered()) return;
      if (!element || !report) {
        this.renderer?.destroy();
        this.renderer = undefined;
        return;
      }
      this.renderer ??= new RevenueChartRenderer(element, loadRevenueChart, (status) =>
        this.chartStatus.set(status),
      );
      void this.renderer.update(options);
    });
    inject(DestroyRef).onDestroy(() => {
      this.revision++;
      this.renderer?.destroy();
    });
  }
  refresh(): void {
    void this.load(this.connection(), this.selectedDays());
  }
  private async load(connection: EbayConnection, days: EbayTrafficDays): Promise<void> {
    const revision = ++this.revision;
    this.report.set(null);
    this.error.set(null);
    this.loading.set(true);
    try {
      const report = await this.api.loadTrafficOverview(connection, days);
      if (revision === this.revision) this.report.set(report);
    } catch (error) {
      if (revision === this.revision)
        this.error.set(
          error instanceof Error ? error.message : 'Die Trafficdaten konnten nicht geladen werden.',
        );
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
  retryChart(): void {
    if (this.renderer?.reloadRequired) {
      window.location.reload();
      return;
    }
    void this.renderer?.update(this.chartOptions());
  }
  private chartOptions(): ApexOptions {
    const isDark = this.theme.currentTheme() === 'dark';
    return {
      chart: {
        type: 'bar',
        height: 280,
        width: '100%',
        background: 'transparent',
        foreColor: isDark ? '#a8a8a8' : '#596273',
        toolbar: { show: false },
        animations: { enabled: false },
        zoom: { enabled: false },
      },
      series: [
        {
          name: this.metricLabel(),
          data: (this.report()?.days ?? []).map((day) => day[this.selectedMetric()]),
        },
      ],
      colors: ['#fcc601'],
      dataLabels: { enabled: false },
      legend: { show: false },
      tooltip: {
        y: { formatter: (amount) => new Intl.NumberFormat('de-DE').format(amount) },
      },
      plotOptions: { bar: { borderRadius: 4, columnWidth: '64%' } },
      xaxis: {
        categories: (this.report()?.days ?? []).map(
          (day) => `${day.date.slice(8)}.${day.date.slice(5, 7)}.`,
        ),
        tickAmount: 6,
        labels: { rotate: 0, hideOverlappingLabels: true },
      },
      yaxis: {
        min: 0,
        labels: {
          formatter: (amount) =>
            new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(amount),
        },
      },
      grid: { borderColor: isDark ? '#373737' : '#e2e6ec' },
      theme: { mode: isDark ? 'dark' : 'light' },
    };
  }
}
