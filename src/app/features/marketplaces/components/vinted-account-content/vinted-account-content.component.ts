import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceEntryKind } from '../../models/marketplace-read.models';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';

@Component({
  selector: 'app-vinted-account-content',
  imports: [
    CurrencyPipe,
    DatePipe,
    ButtonComponent,
    CardComponent,
    DataTableComponent,
    NoticeBannerComponent,
    ProductThumbnailComponent,
  ],
  templateUrl: './vinted-account-content.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedAccountContentComponent {
  readonly store = inject(MarketplaceAccountStore);
  private readonly route = inject(ActivatedRoute);
  private readonly data = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
  readonly section = computed(() => this.data()['section'] as string);
  readonly backIcon = LucideArrowLeft;
  readonly conversation = computed(
    () =>
      this.store
        .snapshot()
        ?.conversations.items.find((entry) => entry.id === this.store.selectedConversationId()) ??
      null,
  );
  readonly transcript = computed(() => [...(this.store.messages()?.items ?? [])].reverse());
  readonly pageKind = computed<MarketplaceEntryKind>(() =>
    this.section() === 'listings'
      ? 'publication'
      : this.section() === 'sales'
        ? 'sale'
        : 'activity',
  );
  readonly page = computed(() => {
    const snapshot = this.store.snapshot();
    return this.section() === 'listings'
      ? snapshot?.publications
      : this.section() === 'sales'
        ? snapshot?.sales
        : snapshot?.activity;
  });
  readonly pageTitle = computed(() =>
    this.section() === 'listings'
      ? 'Inserate'
      : this.section() === 'sales'
        ? 'Verkäufe'
        : 'Aktivitäten',
  );
}
