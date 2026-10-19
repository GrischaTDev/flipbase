import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CostStateComponent } from '../../../../shared/components/cost-state/cost-state.component';
import type { PurchaseDetailRow } from '../../models/purchase-presentation.models';

@Component({
  selector: 'app-purchase-detail-table',
  imports: [ButtonComponent, RouterLink, CostStateComponent],
  templateUrl: './purchase-detail-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseDetailTableComponent {
  readonly purchaseId = input.required<string>();
  readonly rows = input.required<readonly PurchaseDetailRow[]>();
  readonly canCaptureIndividual = input(true);
  readonly captureIndividual = output<string>();
}
