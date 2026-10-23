import type { KleinanzeigenListingJob } from '../../models/kleinanzeigen-listing-job';
import { ListingTransferActionComponent } from '../listing-transfer-action/listing-transfer-action.component';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import {
  LucideChevronDown,
  LucideChevronUp,
  LucideEye,
  LucidePencil,
  LucideRefreshCw,
  LucideSettings,
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
import { marketplacePlatformLabel } from '../../../../shared/models/marketplace-platform';
import { overviewListingKey } from '../../models/marketplace-overview-normalization';

@Component({
  selector: 'app-marketplace-listing-section',
  imports: [
    RouterLink,
    ListingTransferActionComponent,
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
  readonly showAccountManagement = input(false);
  readonly collapsible = input(true);
  readonly accountManagementRequested = output<void>();
  readonly toggled = output<void>();
  readonly transferPublished = output<KleinanzeigenListingJob>();
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
  readonly settingsIcon = LucideSettings;
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
  readonly platformLabel = marketplacePlatformLabel;
  readonly stateOptions = computed(() => [
    { value: 'all', label: 'Alle Inserate' },
    { value: 'active', label: 'Online' },
    ...(this.section().account.platform === 'kleinanzeigen'
      ? []
      : [{ value: 'reserved', label: 'Reserviert' }]),
    ...(this.section().account.platform === 'vinted'
      ? [
          { value: 'hidden', label: 'Versteckt' },
          { value: 'unknown', label: 'Status unbekannt' },
        ]
      : []),
    { value: 'ended', label: 'Beendet' },
  ]);
  readonly accountLink = computed(() => {
    switch (this.section().account.platform) {
      case 'vinted':
        return '/marketplaces/vinted/overview';
      case 'ebay':
        return '/marketplaces/ebay/listings';
      case 'kleinanzeigen':
        return '/marketplaces/kleinanzeigen';
    }
  });
  readonly accountQuery = computed(() =>
    this.section().account.platform === 'vinted'
      ? { connectionId: this.section().account.connectionId }
      : null,
  );
  readonly accountStatusTone = computed(
    () =>
      this.section().account.connectionStatus?.tone ??
      (['needs_login', 'blocked', 'disconnected'].includes(this.section().account.status)
        ? 'caution'
        : this.section().account.status === 'connected'
          ? 'success'
          : 'neutral'),
  );
  readonly accountStatus = computed(() => {
    const connectionStatus = this.section().account.connectionStatus;
    if (connectionStatus) return connectionStatus.label;
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
      draft: 'Entwurf',
      hidden: 'Versteckt',
      ended: 'Beendet',
      processing: 'Wird verarbeitet',
      unknown: 'Status unbekannt',
    }[state];
  }
  changeState(value: string | null): void {
    this.cancelSearch();
    const state: MarketplaceListingQuery['state'] =
      value === 'active' ||
      value === 'reserved' ||
      value === 'ended' ||
      (this.section().account.platform === 'vinted' &&
        (value === 'draft' || value === 'hidden' || value === 'unknown'))
        ? value
        : 'all';
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
