import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PurchaseEntryStatus } from '../../../../core/models/purchase-costing.models';
import { PurchaseSaleHistoryState } from '../../../../core/services/purchase.service';

@Component({
  selector: 'app-purchase-lifecycle-actions',
  imports: [RouterLink],
  templateUrl: './purchase-lifecycle-actions.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseLifecycleActionsComponent {
  readonly entryStatus = input.required<PurchaseEntryStatus>();
  readonly saleHistoryState = input.required<PurchaseSaleHistoryState>();
  readonly saleReviewInventoryItemId = input<string | null>(null);
  readonly submitting = input(false);

  readonly editRequested = output<void>();
  readonly deleteRequested = output<void>();
  readonly finalizeRequested = output<void>();
  readonly reopenRequested = output<void>();
  readonly correctionRequested = output<void>();
  readonly saleHistoryReloadRequested = output<void>();
}
