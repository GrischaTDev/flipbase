import { CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, type TemplateRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { vintedPublicationBadge } from '../../models/vinted-publication-state';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import type { VintedListingMetricChange } from '../../models/vinted-listing-metric-change';
import type { VintedRelistingPlan } from '../../services/vinted-relisting-plan.store';
import { VintedListingAgeComponent } from '../vinted-listing-age/vinted-listing-age.component';
import { VintedListingMetricsComponent } from './vinted-listing-metrics.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';

export interface VintedWardrobeTableRow {
  readonly entry: MarketplaceEntry;
  readonly change: VintedListingMetricChange | null;
  readonly comparisonLabel: string | null;
  readonly highlighted: boolean;
  readonly running: boolean;
  readonly runningLabel?: string;
  readonly plan?: VintedRelistingPlan;
}

@Component({
  selector: 'app-vinted-listings-table',
  imports: [
    CurrencyPipe,
    NgTemplateOutlet,
    RouterLink,
    BadgeComponent,
    DataTableComponent,
    ProductThumbnailComponent,
    VintedListingAgeComponent,
    VintedListingMetricsComponent,
    LoadingIndicatorComponent,
  ],
  templateUrl: './vinted-listings-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 max-w-full' },
})
export class VintedListingsTableComponent {
  readonly rows = input.required<readonly VintedWardrobeTableRow[]>();
  readonly periodLabel = input.required<string>();
  readonly actionsTemplate =
    input.required<TemplateRef<{ $implicit: MarketplaceEntry; plan?: VintedRelistingPlan }>>();
  readonly publicationBadge = vintedPublicationBadge;
}
