import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedRatingComponent } from '../vinted-rating/vinted-rating.component';

function latestEntries(entries: readonly MarketplaceEntry[]): readonly MarketplaceEntry[] {
  return [...entries]
    .sort((left, right) => {
      const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : null;
      const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : null;
      if (leftTime === null) return rightTime === null ? 0 : 1;
      if (rightTime === null) return -1;
      return rightTime - leftTime;
    })
    .slice(0, 3);
}

@Component({
  selector: 'app-vinted-overview',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    ProductThumbnailComponent,
    VintedRatingComponent,
  ],
  templateUrl: './vinted-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedOverviewComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly conversations = computed(() =>
    latestEntries(this.store.snapshot()?.conversations.items ?? []),
  );
  readonly sales = computed(() => latestEntries(this.store.snapshot()?.sales.items ?? []));
}
