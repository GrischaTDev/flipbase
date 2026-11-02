import { CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, type TemplateRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucidePencil } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { vintedPublicationBadge } from '../../models/vinted-publication-state';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import type { VintedListingJob } from '../../models/vinted-listing-job';
import type { VintedListingMetricChange } from '../../models/vinted-listing-metric-change';
import type { VintedRelistingPlan } from '../../services/vinted-relisting-plan.store';
import { VintedListingAgeComponent } from '../vinted-listing-age/vinted-listing-age.component';
import { VintedListingMetricsComponent } from './vinted-listing-metrics.component';

export interface VintedWardrobeTableRow {
  readonly entry: MarketplaceEntry;
  readonly change: VintedListingMetricChange | null;
  readonly comparisonLabel: string | null;
  readonly highlighted: boolean;
  readonly running: boolean;
  readonly runningLabel?: string;
}

@Component({
  selector: 'app-vinted-listings-table',
  imports: [
    CurrencyPipe,
    NgTemplateOutlet,
    RouterLink,
    ButtonComponent,
    BadgeComponent,
    DataTableComponent,
    ProductThumbnailComponent,
    VintedListingAgeComponent,
    VintedListingMetricsComponent,
  ],
  templateUrl: './vinted-listings-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 max-w-full' },
})
export class VintedListingsTableComponent {
  readonly rows = input.required<readonly VintedWardrobeTableRow[]>();
  readonly plans = input.required<readonly VintedRelistingPlan[]>();
  readonly periodLabel = input.required<string>();
  readonly actionsTemplate = input.required<TemplateRef<{ $implicit: MarketplaceEntry }>>();
  readonly planEditable = input.required<(job: VintedListingJob) => boolean>();
  readonly planEdited = output<VintedListingJob>();
  readonly editIcon = LucidePencil;
  readonly publicationBadge = vintedPublicationBadge;
}
