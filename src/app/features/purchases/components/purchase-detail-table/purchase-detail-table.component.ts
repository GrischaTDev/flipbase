import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CostStateComponent } from '../../../../shared/components/cost-state/cost-state.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import type { PurchaseDetailRow } from '../../models/purchase-presentation.models';

@Component({
  selector: 'app-purchase-detail-table',
  imports: [RouterLink, CurrencyPipe, CostStateComponent, BadgeComponent],
  templateUrl: './purchase-detail-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseDetailTableComponent {
  readonly purchaseId = input.required<string>();
  readonly rows = input.required<readonly PurchaseDetailRow[]>();
  readonly canCaptureIndividual = input(true);
  readonly captureIndividual = output<string>();
}
