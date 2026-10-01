import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideEye, LucideHeart } from '@lucide/angular';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import type { MarketplaceMetrics } from '../../models/marketplace.models';
import type { VintedListingMetricChange } from '../../models/vinted-listing-metric-change';

@Component({
  selector: 'app-vinted-listing-metrics',
  imports: [BadgeComponent, LucideEye, LucideHeart],
  templateUrl: './vinted-listing-metrics.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap gap-2' },
})
export class VintedListingMetricsComponent {
  readonly metrics = input.required<MarketplaceMetrics>();
  readonly change = input<VintedListingMetricChange | null>(null);
  readonly highlighted = input(false);
}
