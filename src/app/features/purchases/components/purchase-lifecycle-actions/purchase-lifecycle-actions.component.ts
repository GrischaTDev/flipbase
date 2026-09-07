import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { PurchaseEntryStatus } from '../../../../core/models/purchase-costing.models';
import { PurchaseSaleHistoryState } from '../../../../core/services/purchase.service';

@Component({
  selector: 'app-purchase-lifecycle-actions',
  imports: [ButtonComponent],
  templateUrl: './purchase-lifecycle-actions.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseLifecycleActionsComponent {
  readonly entryStatus = input.required<PurchaseEntryStatus>();
  readonly receivingStatus = input<
    'draft' | 'ordered' | 'partially_received' | 'received' | 'archived'
  >('draft');
  readonly shipmentStatus = input<'not_shipped' | 'in_transit' | 'arrived'>('not_shipped');
  readonly contentStatus = input<'known' | 'unknown'>('known');
  readonly saleHistoryState = input.required<PurchaseSaleHistoryState>();
  readonly saleReviewInventoryItemId = input<string | null>(null);
  readonly submitting = input(false);

  readonly editRequested = output<void>();
  readonly deleteRequested = output<void>();
  readonly finalizeRequested = output<void>();
  readonly reopenRequested = output<void>();
  readonly correctionRequested = output<void>();
  readonly saleHistoryReloadRequested = output<void>();
  readonly orderedRequested = output<void>();
  readonly transitRequested = output<void>();
  readonly arrivedRequested = output<void>();
  readonly captureContentRequested = output<void>();
}
