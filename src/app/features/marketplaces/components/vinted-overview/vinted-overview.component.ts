import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideMessageCircle,
  LucideShirt,
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
import { vintedPublicationBadge } from '../../models/vinted-publication-state';

const overviewSections = [
  {
    kind: 'publication',
    title: 'Inserate',
    previewTitle: 'Neueste Inserate',
    link: '/marketplaces/vinted/listings',
    action: 'Kleiderschrank ansehen',
    icon: LucideShirt,
    emptyMessage: 'Noch keine Vinted-Inserate gespeichert.',
  },
  {
    kind: 'conversation',
    title: 'Gespräche',
    previewTitle: 'Letzte Gespräche',
    link: '/marketplaces/vinted/messages',
    action: 'Nachrichten ansehen',
    icon: LucideMessageCircle,
    emptyMessage: 'Noch keine Vinted-Gespräche gespeichert.',
  },
  {
    kind: 'sale',
    title: 'Verkäufe',
    previewTitle: 'Letzte Verkäufe',
    link: '/marketplaces/vinted/sales',
    action: 'Verkäufe ansehen',
    icon: LucideShoppingBag,
    emptyMessage: 'Noch keine Vinted-Verkäufe gespeichert.',
  },
] as const;

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
  private readonly accountLists = {
    publication: createVintedAccountList(() => ({ kind: 'publication' })),
    conversation: createVintedAccountList(() => ({ kind: 'conversation' })),
    sale: createVintedAccountList(() => ({ kind: 'sale' })),
  };
  readonly showAllAccounts = this.accountLists.publication.showAllAccounts;
  readonly accountLabels = this.accountLists.publication.labels;
  readonly entryKey = vintedAccountEntryKey;
  readonly publicationBadge = vintedPublicationBadge;
  readonly userIcon = LucideUser;
  readonly sections = computed(() => {
    const allAccounts = this.showAllAccounts();
    const snapshot = this.store.snapshot();
    return overviewSections.map((section) => {
      const list = this.accountLists[section.kind];
      const page = allAccounts
        ? list.page()
        : {
            publication: snapshot?.publications,
            conversation: snapshot?.conversations,
            sale: snapshot?.sales,
          }[section.kind];
      const unavailable =
        !allAccounts &&
        ((section.kind === 'conversation' && this.store.localInboxUnavailable()) ||
          (section.kind === 'sale' && this.store.localSalesUnavailable()));
      const items = (page?.items ?? []).filter((entry) => entry.saleState !== 'relisted');
      const error = allAccounts ? list.error() : null;
      return {
        ...section,
        total: error || (unavailable && !page?.total) ? null : (page?.total ?? null),
        items:
          allAccounts || section.kind === 'publication' ? items.slice(0, 3) : latestEntries(items),
        loading: allAccounts && list.loading(),
        error,
        unavailable,
        refresh: list.refresh,
      };
    });
  });

  listingLink(entry: MarketplaceEntry): string {
    return `/marketplaces/vinted/listings/${encodeURIComponent(entry.connectionId)}/${encodeURIComponent(entry.id)}`;
  }
}
