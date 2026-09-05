import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CostStateComponent } from '../../../../shared/components/cost-state/cost-state.component';
import { ItemConditionLabelPipe } from '../../../../shared/pipes/item-condition-label.pipe';
import type { PurchaseDetailRow } from '../../models/purchase-presentation.models';

@Component({
  selector: 'app-purchase-detail-table',
  imports: [RouterLink, CurrencyPipe, CostStateComponent, ItemConditionLabelPipe],
  templateUrl: './purchase-detail-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseDetailTableComponent {
  readonly visibleColumns = input<readonly string[]>([
    'title',
    'quantity',
    'condition',
    'estimated',
    'allocated',
    'unit_price',
    'additional',
    'total_cost',
    'available',
    'sold',
  ]);
  readonly purchaseId = input.required<string>();
  readonly rows = input.required<readonly PurchaseDetailRow[]>();
  readonly captureIndividual = output<string>();
  readonly isMystery = computed(() => this.rows()[0]?.kind === 'mystery');
}
