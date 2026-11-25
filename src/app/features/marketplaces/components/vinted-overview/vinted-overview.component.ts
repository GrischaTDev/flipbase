import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideDynamicIcon,
  LucideMessageCircle,
  LucideShoppingBag,
  LucideUser,
} from '@lucide/angular';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedRatingComponent } from '../vinted-rating/vinted-rating.component';
import { VintedAccountSummariesComponent } from '../vinted-account-summaries/vinted-account-summaries.component';
import { createVintedAccountList } from '../../services/vinted-addressed-list';
import { vintedAccountEntryKey } from '../../models/vinted-account-list';

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
    LucideDynamicIcon,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    ProductThumbnailComponent,
    VintedRatingComponent,
    VintedAccountSummariesComponent,
  ],
  templateUrl: './vinted-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedOverviewComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly inbox = createVintedAccountList(() => ({ kind: 'conversation' }));
  readonly salesList = createVintedAccountList(() => ({ kind: 'sale' }));
  readonly combinedConversations = computed(() => this.inbox.page()?.items.slice(0, 3) ?? []);
  readonly combinedSales = computed(() => this.salesList.page()?.items.slice(0, 3) ?? []);
  readonly entryKey = vintedAccountEntryKey;
  readonly userIcon = LucideUser;
  readonly messageCircleIcon = LucideMessageCircle;
  readonly shoppingBagIcon = LucideShoppingBag;
  readonly conversations = computed(() =>
    latestEntries(this.store.snapshot()?.conversations.items ?? []),
  );
  readonly sales = computed(() =>
    latestEntries(
      (this.store.snapshot()?.sales.items ?? []).filter((entry) => entry.saleState !== 'relisted'),
    ),
  );
}
