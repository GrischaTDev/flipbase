import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import type {
  EbayConnection,
  EbayTrafficDays,
  EbayListingPerformanceReport,
  EbayAdvertisingReport,
} from '../../../../../../supabase/functions/_shared/ebay-contracts';
import { EbayAccountApiService } from '../../services/ebay-account-api.service';
import { summarizeEbayTraffic } from '../../models/ebay-traffic-summary';

@Component({
  selector: 'app-ebay-listing-performance',
  imports: [
    ButtonComponent,
    CardComponent,
    DataTableComponent,
    ProductThumbnailComponent,
    CustomSelectComponent,
    DatePipe,
    DecimalPipe,
    PercentPipe,
  ],
  templateUrl: './ebay-listing-performance.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 space-y-4' },
})
export class EbayListingPerformanceComponent {
  readonly connection = input.required<EbayConnection>();
  readonly days = input.required<EbayTrafficDays>();
  readonly advertisingChanged = output<EbayAdvertisingReport | null>();
  readonly report = signal<EbayListingPerformanceReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly advertising = signal<EbayAdvertisingReport | null>(null);
  readonly advertisingLoading = signal(false);
  readonly advertisingError = signal<string | null>(null);
  readonly search = signal('');
  readonly sort = signal('impressions');
  readonly sortOptions = [
    { value: 'impressions', label: 'Meiste Impressionen' },
    { value: 'views', label: 'Meiste Aufrufe' },
    { value: 'transactions', label: 'Meiste Käufe' },
    { value: 'clicks', label: 'Meiste Werbeklicks' },
  ];
  readonly advertisingSummary = computed(() => {
    const report = this.advertising();
    if (report?.status !== 'ready') return null;
    const impressions = report.days.reduce((total, day) => total + day.impressions, 0);
    const clicks = report.days.reduce((total, day) => total + day.clicks, 0);
    return { impressions, clicks };
  });
  readonly rows = computed(() => {
    const search = this.search().trim().toLocaleLowerCase('de-DE');
    const advertising = new Map(this.advertising()?.items.map((item) => [item.listingId, item]));
    const sort = this.sort();
    return (this.report()?.items ?? [])
      .map((item) => ({
        ...item,
        ...summarizeEbayTraffic([item]),
        advertisingImpressions: advertising.get(item.listingId)?.impressions ?? null,
        clicks: advertising.get(item.listingId)?.clicks ?? null,
      }))
      .filter(
        (item) =>
          !search || `${item.title} ${item.listingId}`.toLocaleLowerCase('de-DE').includes(search),
      )
      .sort((left, right) => {
        const key =
          sort === 'views' || sort === 'transactions' || sort === 'clicks' ? sort : 'impressions';
        const leftCount = left[key],
          rightCount = right[key];
        if (leftCount === null) return rightCount === null ? 0 : 1;
        if (rightCount === null) return -1;
        return rightCount - leftCount;
      });
  });
  private readonly api = inject(EbayAccountApiService);
  private revision = 0;

  constructor() {
    effect(() => {
      const connection = this.connection(),
        days = this.days();
      untracked(() => void this.load(connection, days));
    });
    inject(DestroyRef).onDestroy(() => this.revision++);
  }

  refresh(): void {
    void this.load(this.connection(), this.days());
  }

  private async load(connection: EbayConnection, days: EbayTrafficDays): Promise<void> {
    const revision = ++this.revision;
    this.report.set(null);
    this.error.set(null);
    this.search.set('');
    this.sort.set('impressions');
    this.advertising.set(null);
    this.advertisingError.set(null);
    this.advertisingLoading.set(false);
    this.advertisingChanged.emit(null);
    this.loading.set(true);
    try {
      const report = await this.api.loadListingPerformance(connection, days);
      if (revision === this.revision) this.report.set(report);
    } catch (error) {
      if (revision === this.revision)
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Artikelauswertung konnte nicht geladen werden.',
        );
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }

  async loadAdvertising(): Promise<void> {
    if (this.loading() || this.advertisingLoading()) return;
    const revision = this.revision;
    this.advertisingLoading.set(true);
    this.advertisingError.set(null);
    this.advertising.set(null);
    this.advertisingChanged.emit(null);
    try {
      const report = await this.api.loadAdvertisingReport(this.connection(), this.days());
      if (revision === this.revision) {
        this.advertising.set(report);
        this.advertisingChanged.emit(report);
      }
    } catch (error) {
      if (revision === this.revision)
        this.advertisingError.set(
          error instanceof Error ? error.message : 'Der Werbebericht konnte nicht geladen werden.',
        );
    } finally {
      if (revision === this.revision) this.advertisingLoading.set(false);
    }
  }
}
