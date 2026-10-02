import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceContextLockService } from '../../../../core/services/workspace-context-lock.service';
import { SalesService } from '../../../../core/services/sales.service';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { SaleCreateModalComponent } from '../../components/sale-create-modal/sale-create-modal.component';
import { EbaySaleReviewStore } from '../../services/ebay-sale-review.store';
import type { ExternalSaleEntrySubmit } from '../../models/external-sale-entry.models';

@Component({
  selector: 'app-ebay-sale-review',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    EntryPageLayoutComponent,
    ButtonComponent,
    CardComponent,
    ModalShellComponent,
    TextFieldComponent,
    CustomCheckboxComponent,
    CustomSelectComponent,
    SaleCreateModalComponent,
  ],
  providers: [EbaySaleReviewStore],
  templateUrl: './ebay-sale-review.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class EbaySaleReviewComponent {
  readonly store = inject(EbaySaleReviewStore);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly sales = inject(SalesService);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly entryForm = viewChild(SaleCreateModalComponent);
  readonly routeError = signal<string | null>(null);
  readonly manualDialog = signal<'mark' | 'clear' | null>(null);
  readonly reviewConfirmation = new FormControl(false, { nonNullable: true });
  private readonly confirmedReview = toSignal(this.reviewConfirmation.valueChanges, {
    initialValue: false,
  });
  readonly manualForm = new FormGroup({
    reason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
    confirmed: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
    saleId: new FormControl<string | null>(null),
  });
  readonly saleOptions = computed(() =>
    this.sales.sales().map((sale) => ({
      value: sale.id,
      label: `${sale.sale_date} · ${sale.inventory_item?.title ?? sale.lines?.[0]?.title_snapshot ?? 'Verkauf'} · ${sale.sale_price.toFixed(2)} €`,
    })),
  );
  readonly submitExternal: ExternalSaleEntrySubmit = (input) => this.store.submit(input);

  constructor() {
    const release = inject(WorkspaceContextLockService).acquire();
    inject(DestroyRef).onDestroy(() => {
      release();
      this.store.clear();
    });
    effect(() => {
      const workspace = this.workspace.currentWorkspace();
      const connectionId = this.params().get('connectionId');
      const orderId = this.params().get('orderId');
      if (
        !this.auth.currentUser() ||
        !workspace ||
        workspace.archived_at ||
        !connectionId ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(connectionId) ||
        !orderId ||
        orderId.length > 256 ||
        [...orderId].some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        )
      ) {
        this.store.clear();
        this.routeError.set(
          'Öffne die Bestellung aus Deinem eBay-Konto in einem aktiven Workspace.',
        );
        return;
      }
      this.routeError.set(null);
      this.reviewConfirmation.reset(false);
      this.manualDialog.set(null);
      untracked(() => void this.store.load({ workspaceId: workspace.id, connectionId }, orderId));
    });
    effect(() => {
      const snapshotId = this.store.review()?.snapshotId;
      if (snapshotId) this.reviewConfirmation.reset(false);
    });
  }
  isSaving(): boolean {
    return this.store.loading() || (this.entryForm()?.isSaving() ?? false);
  }
  hasUnsavedChanges(): boolean {
    return (
      this.store.outcomeUnknown() ||
      (this.store.booking().status === 'unrecorded' &&
        ((this.entryForm()?.hasUnsavedChanges() ?? false) ||
          (this.manualDialog() !== null && this.manualForm.dirty)))
    );
  }
  canSave(): boolean {
    return (
      !this.isSaving() &&
      !this.store.outcomeUnknown() &&
      this.store.booking().status === 'unrecorded' &&
      (!this.store.reviewChanged() || this.confirmedReview()) &&
      (this.entryForm()?.canSave() ?? false)
    );
  }
  save(): void {
    if (this.canSave()) void this.entryForm()?.onSubmit();
  }
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() || this.isSaving()) event.preventDefault();
  }
  returnToEbay(): void {
    void this.router.navigateByUrl('/marketplaces/ebay');
  }
  openManualDialog(mode: 'mark' | 'clear'): void {
    if (this.isSaving() || this.store.outcomeUnknown()) return;
    this.manualForm.reset({ reason: '', confirmed: false, saleId: null });
    this.manualDialog.set(mode);
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (mode === 'mark' && workspaceId && this.sales.loadedWorkspaceId() !== workspaceId)
      void this.sales.loadSales(workspaceId);
  }
  closeManualDialog(): void {
    if (!this.isSaving()) this.manualDialog.set(null);
  }
  async markManually(): Promise<void> {
    this.manualForm.markAllAsTouched();
    if (this.manualDialog() !== 'mark' || this.manualForm.invalid) return;
    const value = this.manualForm.getRawValue();
    await this.store.markRecordedElsewhere(value.reason, value.saleId);
    if (this.store.booking().status !== 'unrecorded') this.manualDialog.set(null);
  }
  async clearManualMarker(): Promise<void> {
    if (this.manualDialog() !== 'clear' || !this.manualForm.controls.confirmed.value) return;
    await this.store.clearRecordedElsewhere();
    if (this.store.booking().status !== 'recorded_elsewhere') this.manualDialog.set(null);
  }
  blockerText(code: string): string {
    const messages: Record<string, string> = {
      currency_unsupported: 'Die Bestellung wird nicht in Euro abgerechnet.',
      invalid_order: 'Erforderliche Bestellangaben fehlen.',
      invalid_amounts: 'Die Beträge sind nicht eindeutig prüfbar.',
      payment_unconfirmed: 'Die vollständige Zahlung ist nicht bestätigt.',
      cancellation: 'Für diese Bestellung liegt eine Stornierung vor.',
      unsupported_adjustment:
        'Steuern oder weitere Anpassungen können nicht sicher übernommen werden.',
      refund_or_unknown: 'Eine Erstattung liegt vor oder ihr Status ist unklar.',
      invalid_lines: 'Die Bestellpositionen sind nicht vollständig prüfbar.',
      amount_mismatch: 'Positionsbeträge und Bestellsumme stimmen nicht überein.',
    };
    return messages[code] ?? 'Diese Bestellung kann derzeit nicht sicher übernommen werden.';
  }
}
