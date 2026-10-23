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
import {
  EbaySaleActivityStore,
  ebaySourceIssueLabel,
} from '../../services/ebay-sale-activity.store';
import type { EbayOrderAssignment } from '../../../../../../supabase/functions/_shared/ebay-order-import-contracts';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
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
import { marketplacePlatformLabel } from '../../../../shared/models/marketplace-platform';

@Component({
  selector: 'app-ebay-sale-review',
  imports: [
    DatePipe,
    ProductThumbnailComponent,
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
  readonly platformLabel = marketplacePlatformLabel;
  readonly sourceIssueLabel = ebaySourceIssueLabel;
  readonly store = inject(EbaySaleReviewStore);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly activity = inject(EbaySaleActivityStore);
  private lastUserId: string | null = null;
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly entryForm = viewChild(SaleCreateModalComponent);
  readonly platformFeeDiffers = computed(() => {
    const review = this.store.review();
    return (
      !!review?.draft &&
      review.draft.costsOrigin !== 'automatic' &&
      (review.source.platformFeeCents ?? null) !== review.draft.costs.platformFeeCents
    );
  });
  readonly routeError = signal<string | null>(null);
  readonly reviewMode = signal<'new' | 'existing'>('new');
  readonly selectedExistingSaleId = signal<string | null>(null);
  readonly existingAssignments = signal<Readonly<Record<string, string>>>({});
  readonly existingConfirmed = new FormControl(false, { nonNullable: true });
  readonly existingReason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(500)],
  });
  readonly reviewModeOptions = [
    { value: 'new', label: 'Noch nicht erfasst' },
    { value: 'existing', label: 'Bereits als Verkauf erfasst' },
  ];
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
  });
  readonly saleOptions = computed(() =>
    this.store.existingSales().map((sale) => ({
      value: sale.id,
      label: `${sale.saleDate} · ${this.platformLabel(sale.platform)} · ${sale.lines.map((line) => line.title).join(', ')} · ${sale.total.toFixed(2)} €`,
    })),
  );
  readonly selectedExistingSale = computed(
    () =>
      this.store.existingSales().find((sale) => sale.id === this.selectedExistingSaleId()) ?? null,
  );
  readonly existingTargetOptions = computed(
    () =>
      this.selectedExistingSale()?.lines.flatMap((line) =>
        line.inventoryItemId
          ? [
              {
                value: `inventory:${line.inventoryItemId}`,
                label: `${line.title} · ${line.quantity} ×`,
              },
            ]
          : line.catalogProductId
            ? [
                {
                  value: `catalog:${line.catalogProductId}`,
                  label: `${line.title} · ${line.quantity} ×`,
                },
              ]
            : [],
      ) ?? [],
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
      const userId = this.auth.currentUser()?.id ?? null;
      if (userId !== this.lastUserId) {
        this.lastUserId = userId;
        this.store.clear();
      }
      if (
        !userId ||
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
      this.reviewMode.set('new');
      this.selectedExistingSaleId.set(null);
      this.existingAssignments.set({});
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
          (this.manualDialog() !== null && this.manualForm.dirty) ||
          (this.reviewMode() === 'existing' &&
            (this.existingReason.dirty ||
              this.existingConfirmed.dirty ||
              Object.keys(this.existingAssignments()).length > 0))))
    );
  }
  canSave(): boolean {
    return (
      !this.isSaving() &&
      !this.store.outcomeUnknown() &&
      this.store.booking().status === 'unrecorded' &&
      this.reviewMode() === 'new' &&
      (!this.store.reviewChanged() || this.confirmedReview()) &&
      (this.entryForm()?.canSave() ?? false)
    );
  }
  save(): void {
    if (this.canSave()) void this.entryForm()?.onSubmit();
  }
  async saveDraft(): Promise<void> {
    const editor = this.entryForm()?.externalEditorSnapshot();
    if (!editor || this.isSaving() || this.store.outcomeUnknown()) return;
    if (await this.store.saveDraft(editor)) {
      if (JSON.stringify(this.entryForm()?.externalEditorSnapshot()) === JSON.stringify(editor))
        this.entryForm()?.markExternalDraftSaved();
      void this.activity.reload();
    }
  }
  setReviewMode(value: string | null): void {
    if (value !== 'new' && value !== 'existing') return;
    this.reviewMode.set(value);
    if (value === 'existing') void this.store.loadExistingSales();
  }
  selectExistingSale(value: string | null): void {
    this.selectedExistingSaleId.set(value);
    this.existingAssignments.set({});
    this.existingConfirmed.reset(false);
  }
  assignExistingLine(lineItemId: string | null, target: string | null): void {
    if (lineItemId)
      this.existingAssignments.update((rows) => ({ ...rows, [lineItemId]: target ?? '' }));
  }
  canLinkExisting(): boolean {
    return (
      !this.isSaving() &&
      !this.store.outcomeUnknown() &&
      !!this.selectedExistingSale() &&
      this.existingConfirmed.value &&
      this.existingReason.valid &&
      !!this.store.review()?.source.lines.length &&
      this.store
        .review()!
        .source.lines.every(
          (line) => !!line.lineItemId && !!this.existingAssignments()[line.lineItemId],
        )
    );
  }
  async linkExisting(): Promise<void> {
    if (!this.canLinkExisting()) return;
    const assignments: EbayOrderAssignment[] = Object.entries(this.existingAssignments()).map(
      ([lineItemId, target]) => ({
        lineItemId,
        target: target.startsWith('inventory:')
          ? { inventoryItemId: target.slice(10) }
          : { catalogProductId: target.slice(8) },
      }),
    );
    await this.store.linkExistingSale(
      this.selectedExistingSaleId()!,
      assignments,
      this.existingReason.value.trim(),
    );
    if (this.store.booking().status !== 'unrecorded') void this.activity.reload();
  }
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() || this.isSaving()) event.preventDefault();
  }
  returnToEbay(): void {
    void this.router.navigateByUrl('/marketplaces/ebay');
  }
  openManualDialog(mode: 'mark' | 'clear'): void {
    if (this.isSaving() || this.store.outcomeUnknown()) return;
    this.manualForm.reset({ reason: '', confirmed: false });
    this.manualDialog.set(mode);
  }
  closeManualDialog(): void {
    if (!this.isSaving()) this.manualDialog.set(null);
  }
  async markManually(): Promise<void> {
    this.manualForm.markAllAsTouched();
    if (this.manualDialog() !== 'mark' || this.manualForm.invalid) return;
    const value = this.manualForm.getRawValue();
    await this.store.markRecordedElsewhere(value.reason);
    void this.activity.reload();
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
      cancellation:
        this.store.review()?.source.cancelStatus === 'CANCELED'
          ? 'Die Bestellung ist eindeutig storniert. Eine eigene offene Reservierung wird freigegeben; ein gebuchter Verkauf bleibt für die Retourenprüfung erhalten.'
          : 'Eine Stornierung ist angefragt oder ihr Status unklar. Prüfe den tatsächlichen Bestand vor einer bewussten Freigabe.',
      unsupported_adjustment:
        'Steuern oder weitere Anpassungen können nicht sicher übernommen werden.',
      refund_or_unknown:
        'Eine Erstattung liegt vor oder ihr Status ist unklar. Das bestätigt keine Rückkehr der Ware; die eigene Reservierung bleibt bis zur bewussten Bestandsklärung erhalten.',
      invalid_lines: 'Die Bestellpositionen sind nicht vollständig prüfbar.',
      amount_mismatch: 'Positionsbeträge und Bestellsumme stimmen nicht überein.',
    };
    return messages[code] ?? 'Diese Bestellung kann derzeit nicht sicher übernommen werden.';
  }
}
