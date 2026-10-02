import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideEye, LucideHeart } from '@lucide/angular';
import type { MarketplaceMetrics } from '../../models/marketplace.models';
import type { VintedListingMetricChange } from '../../models/vinted-listing-metric-change';

@Component({
  selector: 'app-vinted-listing-metrics',
  imports: [LucideEye, LucideHeart],
  templateUrl: './vinted-listing-metrics.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap gap-2' },
})
export class VintedListingMetricsComponent {
  readonly metrics = input.required<MarketplaceMetrics>();
  readonly change = input<VintedListingMetricChange | null>(null);
  readonly highlighted = input(false);
  readonly periodLabel = input('Letzter Abruf');
}
