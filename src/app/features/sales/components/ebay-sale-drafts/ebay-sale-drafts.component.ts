import { WorkspaceService } from '../../../../core/services/workspace.service';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  EbaySaleActivityStore,
  ebayDraftStateLabel,
  ebaySourceIssueLabel,
} from '../../services/ebay-sale-activity.store';
import { InventoryService } from '../../../../core/services/inventory.service';
import { StockService } from '../../../../core/services/stock.service';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
@Component({
  selector: 'app-ebay-sale-drafts',
  imports: [
    DataTableComponent,
    DatePipe,
    ReactiveFormsModule,
    CardComponent,
    ButtonComponent,
    ProductThumbnailComponent,
    ModalShellComponent,
    TextFieldComponent,
    CustomCheckboxComponent,
  ],
  templateUrl: './ebay-sale-drafts.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EbaySaleDraftsComponent {
  readonly activity = inject(EbaySaleActivityStore);
  private readonly workspace = inject(WorkspaceService);
  private readonly inventory = inject(InventoryService);
  private readonly stock = inject(StockService);
  readonly sourceIssueLabel = ebaySourceIssueLabel;
  readonly stateLabel = ebayDraftStateLabel;
  readonly selectedReservation = signal<string | null>(null);
  readonly resolution = new FormGroup({
    reason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
    confirmed: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
  });
  readonly reservationGroups = computed(() =>
    [...new Set(this.activity.reservations().map((row) => row.draftId))].map((draftId) => ({
      draftId,
      quantity: this.activity
        .reservations()
        .filter((row) => row.draftId === draftId)
        .reduce((sum, row) => sum + row.quantity, 0),
      titles: this.activity
        .reservations()
        .filter((row) => row.draftId === draftId)
        .map((row) =>
          row.inventoryItemId
            ? (this.inventory.items().find((item) => item.id === row.inventoryItemId)?.title ??
              'Reserviertes Einzelstück')
            : (this.stock
                .positions()
                .find(
                  (position) =>
                    position.catalog_product_id ===
                    this.stock.lots().find((lot) => lot.id === row.stockLotId)?.catalog_product_id,
                )?.title ?? 'Reservierte Menge'),
        )
        .join(', '),
      draft: this.activity.drafts().find((draft) => draft.id === draftId),
    })),
  );
  constructor() {
    void this.activity.reload();
    effect(() => {
      const workspace = this.workspace.currentWorkspace();
      if (workspace && !workspace.archived_at)
        untracked(() => {
          if (this.stock.loadedWorkspaceId() !== workspace.id)
            void this.stock.loadPositions(workspace.id);
        });
    });
  }
  openResolution(draftId: string): void {
    this.resolution.reset({ reason: '', confirmed: false });
    this.selectedReservation.set(draftId);
  }
  closeResolution(): void {
    if (!this.activity.resolving()) this.selectedReservation.set(null);
  }
  async resolve(): Promise<void> {
    const draftId = this.selectedReservation();
    this.resolution.markAllAsTouched();
    if (!draftId || this.resolution.invalid) return;
    if (await this.activity.resolveReservation(draftId, this.resolution.controls.reason.value))
      this.selectedReservation.set(null);
  }
}
