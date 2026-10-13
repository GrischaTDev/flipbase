import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import type { VintedReachChartPoint } from '../../models/vinted-reach-chart.config';
import {
  VINTED_STATISTICS_RANGES,
  describeChange,
  formatBucketDescription,
  formatBucketLabel,
  formatCount,
  type VintedStatisticsMetric,
} from '../../models/vinted-statistics-overview';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import {
  VintedStatisticsStore,
  type VintedStatisticsAccountScope,
} from '../../services/vinted-statistics.store';
import { VintedReachChartComponent } from './vinted-reach-chart.component';
import { VintedTopListingsComponent } from './vinted-top-listings.component';

const historyDateFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Aufrufe und Favoriten der Vinted-Inserate je Zeitraum, je Konto oder für alle Konten. */
@Component({
  selector: 'app-vinted-statistics',
  imports: [
    ButtonComponent,
    CardComponent,
    NoticeBannerComponent,
    VintedReachChartComponent,
    VintedTopListingsComponent,
  ],
  templateUrl: './vinted-statistics.component.html',
  providers: [VintedStatisticsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 w-full max-w-full space-y-4' },
})
export class VintedStatisticsComponent {
  readonly statistics = inject(VintedStatisticsStore);
  readonly account = inject(MarketplaceAccountStore);
  readonly ranges = VINTED_STATISTICS_RANGES;
  readonly accountScopes: readonly {
    readonly value: VintedStatisticsAccountScope;
    readonly label: string;
  }[] = [
    { value: 'account', label: 'Dieses Konto' },
    { value: 'all', label: 'Alle Konten' },
  ];
  readonly metrics: readonly { readonly value: VintedStatisticsMetric; readonly label: string }[] =
    [
      { value: 'views', label: 'Aufrufe' },
      { value: 'favorites', label: 'Favoriten' },
    ];
  readonly chartMetric = signal<VintedStatisticsMetric>('views');
  readonly chartMetricLabel = computed(
    () => this.metrics.find((metric) => metric.value === this.chartMetric())!.label,
  );
  readonly tiles = computed(() => {
    const overview = this.statistics.overview();
    if (!overview) return [];
    const range = overview.range;
    const previous = overview.previousTotals;
    return [
      {
        id: 'views',
        label: 'Aufrufe',
        value: formatCount(overview.totals.views),
        note: describeChange(overview.totals.views, previous?.views ?? null, range),
      },
      {
        id: 'favorites',
        label: 'Favoriten',
        value: formatCount(overview.totals.favorites),
        note: describeChange(overview.totals.favorites, previous?.favorites ?? null, range),
      },
      {
        id: 'active',
        label: 'Aktive Inserate',
        value: formatCount(overview.activeCount),
        note: 'Aktuell im Kleiderschrank',
      },
    ];
  });
  readonly chartPoints = computed<readonly VintedReachChartPoint[]>(() => {
    const overview = this.statistics.overview();
    const metric = this.chartMetric();
    return (overview?.buckets ?? []).map((bucket) => ({
      key: bucket.start,
      label: formatBucketLabel(bucket.start, overview!.range),
      description: formatBucketDescription(bucket.start, overview!.range),
      value: bucket[metric],
    }));
  });
  readonly historyNotice = computed(() => {
    const overview = this.statistics.overview();
    if (!overview) return null;
    if (!overview.historyStartsAt)
      return 'Noch keine Messwerte. Die Statistik füllt sich, sobald Dein Konto das nächste Mal aktualisiert wird.';
    return overview.previousTotals
      ? null
      : `Die Messhistorie beginnt am ${historyDateFormat.format(new Date(overview.historyStartsAt))}. Ältere Werte kennt Flipbase nicht; ein Vergleich erscheint, sobald genug Messungen vorliegen.`;
  });

  selectChartMetric(metric: VintedStatisticsMetric): void {
    this.chartMetric.set(metric);
  }
}
