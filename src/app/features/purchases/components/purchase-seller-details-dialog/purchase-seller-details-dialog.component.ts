import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Purchase } from '../../../../core/models/flipbase.models';
import {
  PurchaseSellerDetails,
  sellerDetailsFromPurchase,
} from '../../../../core/models/purchase-seller.models';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { SourcesService } from '../../../../core/services/sources.service';
import { SuppliersService } from '../../../../core/services/suppliers.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { sellerSnapshotFromSupplier } from '../../utils/purchase-seller';

/**
 * Trägt Quelle und Verkäuferangaben nach, ohne den Einkauf wieder zu öffnen.
 * Kosten, Positionen und Bestand sind hier bewusst nicht bearbeitbar.
 */
@Component({
  selector: 'app-purchase-seller-details-dialog',
  imports: [
    ReactiveFormsModule,
    ModalShellComponent,
    ButtonComponent,
    CustomSelectComponent,
    TextFieldComponent,
  ],
  templateUrl: './purchase-seller-details-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseSellerDetailsDialogComponent implements OnInit {
  private readonly purchaseService = inject(PurchaseService);
  private readonly sourcesService = inject(SourcesService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly toast = inject(ToastService);

  readonly purchase = input.required<Purchase>();
  readonly closed = output<void>();
  readonly saved = output<void>();

  readonly sourceOptions = computed<readonly SelectOption<string | null>[]>(() => [
    { value: null, label: 'Keine Quelle' },
    ...this.sourcesService.sources().map((source) => ({ value: source.id, label: source.name })),
  ]);
  readonly supplierOptions = computed<readonly SelectOption<string | null>[]>(() => [
    { value: null, label: '-- Verkäufer wählen --' },
    ...this.suppliersService
      .suppliers()
      .map((supplier) => ({ value: supplier.id, label: supplier.name })),
  ]);

  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hasConflict = signal(false);

  readonly form = new FormGroup({
    source_id: new FormControl<string | null>(null),
    supplier_id: new FormControl<string | null>(null, { validators: [Validators.required] }),
    supplier_reference: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });

  /** Stand beim Öffnen; ein zwischenzeitlich gespeicherter Einkauf ergibt einen Konflikt. */
  private expectedVersion = 0;
  private initializedFor: string | null = null;

  ngOnInit(): void {
    this.resetToPurchase(this.purchase());
  }

  resetToPurchase(purchase: Purchase): void {
    if (this.initializedFor === purchase.id) return;
    this.initializedFor = purchase.id;
    this.expectedVersion = purchase.seller_details_version ?? 0;
    const details = sellerDetailsFromPurchase(purchase);
    this.form.reset({
      source_id: details.source_id,
      supplier_id: details.supplier_id,
      supplier_reference: details.supplier_reference ?? '',
      reason: '',
    });
  }

  onSupplierSelected(supplierId: string | null): void {
    const supplier = supplierId
      ? this.suppliersService.suppliers().find((entry) => entry.id === supplierId)
      : undefined;
    if (supplier) this.form.markAsDirty();
  }

  async save(): Promise<void> {
    if (this.isSaving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.errorMessage.set(
        this.form.controls.supplier_id.hasError('required')
          ? 'Bitte einen Verkäufer auswählen.'
          : 'Der Grund darf höchstens 500 Zeichen lang sein.',
      );
      return;
    }

    const values = this.form.getRawValue();
    const supplier = values.supplier_id
      ? this.suppliersService.suppliers().find((entry) => entry.id === values.supplier_id)
      : undefined;
    const snapshot = supplier ? sellerSnapshotFromSupplier(supplier) : null;
    const details: PurchaseSellerDetails = {
      ...sellerDetailsFromPurchase(this.purchase()),
      source_id: values.source_id,
      supplier_id: values.supplier_id,
      seller_type: snapshot?.seller_type ?? null,
      seller_name: snapshot?.seller_name ?? null,
      seller_street: snapshot?.seller_street ?? null,
      seller_address_extra: snapshot?.seller_address_extra ?? null,
      seller_postal_code: snapshot?.seller_postal_code ?? null,
      seller_city: snapshot?.seller_city ?? null,
      seller_country_code: snapshot?.seller_country_code ?? null,
      supplier_reference: values.supplier_reference || null,
    };

    this.isSaving.set(true);
    this.errorMessage.set(null);
    try {
      const result = await this.purchaseService.updatePurchaseSellerDetails(
        this.purchase().id,
        this.expectedVersion,
        details,
        values.reason || null,
      );
      if (result.error) {
        this.hasConflict.set(result.conflict);
        this.errorMessage.set(result.error.message);
        return;
      }
      this.toast.success('Verkäuferangaben wurden gespeichert.');
      this.saved.emit();
      this.closed.emit();
    } finally {
      this.isSaving.set(false);
    }
  }
}
