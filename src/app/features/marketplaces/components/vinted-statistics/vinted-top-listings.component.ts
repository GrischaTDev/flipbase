import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import {
  formatCount,
  formatPrice,
  rankTopItems,
  type VintedStatisticsMetric,
  type VintedStatisticsTopItem,
} from '../../models/vinted-statistics-overview';

/** Beliebteste Artikel im gewählten Zeitraum, auch wenn sie nicht mehr online sind. */
@Component({
  selector: 'app-vinted-top-listings',
  imports: [
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    DataTableComponent,
    ProductThumbnailComponent,
  ],
  templateUrl: './vinted-top-listings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedTopListingsComponent {
  readonly items = input.required<readonly VintedStatisticsTopItem[]>();
  readonly showAccount = input(false);
  readonly sortMetric = signal<VintedStatisticsMetric>('views');
  readonly sortOptions: readonly {
    readonly value: VintedStatisticsMetric;
    readonly label: string;
  }[] = [
    { value: 'views', label: 'Aufrufe' },
    { value: 'favorites', label: 'Favoriten' },
  ];
  readonly rows = computed(() =>
    rankTopItems(this.items(), this.sortMetric()).map((item, index) => ({
      id: item.id,
      rank: index + 1,
      title: item.title,
      imageUrl: item.imageUrl,
      accountName: item.accountName,
      removed: item.removedAt !== null,
      link: item.entryId
        ? ['/marketplaces/vinted/listings', item.connectionId, item.entryId]
        : null,
      price: formatPrice(item.price, item.currency),
      views: formatCount(item.views),
      favorites: formatCount(item.favorites),
      totalViews: formatCount(item.totalViews),
      totalFavorites: formatCount(item.totalFavorites),
    })),
  );
  readonly emptyText = computed(() =>
    this.items().length
      ? 'Im gewählten Zeitraum gab es dafür keinen Zuwachs. Wähle die andere Sortierung oder einen längeren Zeitraum.'
      : 'Sobald Deine Inserate im gewählten Zeitraum neue Aufrufe oder Favoriten bekommen, erscheinen sie hier.',
  );

  selectSort(metric: VintedStatisticsMetric): void {
    this.sortMetric.set(metric);
  }
}
