import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import {
  LucideChevronDown,
  LucideChevronUp,
  LucideEye,
  LucidePencil,
  LucideRefreshCw,
} from '@lucide/angular';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { VintedListingAgeComponent } from '../vinted-listing-age/vinted-listing-age.component';
import type { MarketplaceOverviewSection } from '../../services/marketplace-overview.store';
import type {
  MarketplaceListingQuery,
  MarketplaceListingReference,
  MarketplaceListingState,
} from '../../models/marketplace-overview.models';
import { overviewListingKey } from '../../models/marketplace-overview-normalization';

@Component({
  selector: 'app-marketplace-listing-section',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    CardComponent,
    ButtonComponent,
    BadgeComponent,
    CustomCheckboxComponent,
    CustomSelectComponent,
    DataTableComponent,
    ProductThumbnailComponent,
    VintedListingAgeComponent,
  ],
  templateUrl: './marketplace-listing-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class MarketplaceListingSectionComponent {
  readonly section = input.required<MarketplaceOverviewSection>();
  readonly toggled = output<void>();
  readonly retried = output<void>();
  readonly nextRequested = output<void>();
  readonly previousRequested = output<void>();
  readonly queryChanged = output<MarketplaceListingQuery>();
  readonly selectionChanged = output<{
    reference: MarketplaceListingReference;
    checked: boolean;
  }>();
  readonly allSelected = output<boolean>();
  private readonly destroy = inject(DestroyRef);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  readonly downIcon = LucideChevronDown;
  readonly upIcon = LucideChevronUp;
  readonly viewIcon = LucideEye;
  readonly editIcon = LucidePencil;
  readonly retryIcon = LucideRefreshCw;
  readonly listingKey = overviewListingKey;
  readonly panelId = computed(
    () =>
      'marketplace-listings-' +
      this.section().account.platform +
      '-' +
      encodeURIComponent(this.section().account.connectionId),
  );
  readonly selected = computed(() => new Set(this.section().selection.map(overviewListingKey)));
  readonly allChecked = computed(
    () =>
      !!this.section().page?.items.length &&
      this.section().page!.items.every((item) =>
        this.selected().has(overviewListingKey(item.reference)),
      ),
  );
  readonly partiallyChecked = computed(() => this.selected().size > 0 && !this.allChecked());
  readonly stateOptions = [
    { value: 'all', label: 'Alle gespeicherten Inserate' },
    { value: 'active', label: 'Online' },
    { value: 'reserved', label: 'Reserviert' },
    { value: 'ended', label: 'Beendet' },
  ];
  readonly accountStatus = computed(() => {
    const status = this.section().account.status;
    return (
      (
        {
          connected: 'Verbunden',
          needs_login: 'Anmeldung erforderlich',
          paused: 'Pausiert',
          blocked: 'Prüfung erforderlich',
          disconnected: 'Nicht verbunden',
        } as Record<string, string>
      )[status] ?? 'Status unbekannt'
    );
  });
  constructor() {
    this.destroy.onDestroy(() => this.cancelSearch());
  }
  stateLabel(state: MarketplaceListingState): string {
    return {
      active: 'Online',
      reserved: 'Reserviert',
      ended: 'Beendet',
      processing: 'Wird verarbeitet',
      unknown: 'Status unbekannt',
    }[state];
  }
  changeState(value: string | null): void {
    this.cancelSearch();
    const state: MarketplaceListingQuery['state'] =
      value === 'active' || value === 'reserved' || value === 'ended' ? value : 'all';
    this.queryChanged.emit({ ...this.section().query, state, cursor: undefined });
  }
  search(value: string): void {
    this.cancelSearch();
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.queryChanged.emit({ ...this.section().query, search: value, cursor: undefined });
    }, 300);
  }
  private cancelSearch(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }
}
