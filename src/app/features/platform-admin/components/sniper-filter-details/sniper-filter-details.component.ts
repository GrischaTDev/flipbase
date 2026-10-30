import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SniperQuery } from '../../models/sniper-query.model';
import {
  filterBrandLabel,
  filterIntervalLabel,
  filterPriceLabel,
} from '../../models/sniper-filter-presentation';
import { SniperQueryRunStatusComponent } from '../../pages/sniper-queries/sniper-query-run-status.component';

@Component({
  selector: 'app-sniper-filter-details',
  imports: [SniperQueryRunStatusComponent],
  templateUrl: './sniper-filter-details.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SniperFilterDetailsComponent {
  readonly query = input.required<SniperQuery>();
  readonly category = input('Alle Kategorien');
  readonly finds = input<number | null>(null);
  readonly pending = input(false);
  readonly manualRequired = input(false);
  readonly currentTime = input(Date.now());
  readonly brands = computed(() => filterBrandLabel(this.query()));
  readonly price = computed(() => filterPriceLabel(this.query()));
  readonly interval = computed(() => filterIntervalLabel(this.query().poll_interval_ms));
}
