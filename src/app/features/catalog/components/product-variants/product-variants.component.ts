import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CatalogProduct, StockPosition } from '../../../../core/models/flipbase.models';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { normalizeGtin } from '../../../../shared/utils/gtin';
import { AttributePickerComponent } from '../../../../shared/components/attribute-picker/attribute-picker.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { PRODUCT_COLOR_OPTIONS } from '../../models/product-attribute-options';

@Component({
  selector: 'app-product-variants',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AttributePickerComponent,
    ButtonComponent,
    ModalShellComponent,
    NumberInputComponent,
    TextFieldComponent,
  ],
  templateUrl: './product-variants.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductVariantsComponent {
  private readonly catalog = inject(CatalogService);
  private readonly workspace = inject(WorkspaceService);
  readonly product = input.required<CatalogProduct>();
  readonly variants = input.required<readonly CatalogProduct[]>();
  readonly positions = input<readonly StockPosition[]>([]);
  readonly disabled = input(false);
  readonly created = output<CatalogProduct>();
  readonly colorOptions = PRODUCT_COLOR_OPTIONS;
  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly orderedVariants = computed(() =>
    [...this.variants()].sort(
      (left, right) =>
        (left.size ?? '').localeCompare(right.size ?? '', 'de', { numeric: true }) ||
        (left.color ?? '').localeCompare(right.color ?? '', 'de'),
    ),
  );
  readonly form = new FormGroup({
    size: new FormControl('', { nonNullable: true }),
    color: new FormControl('', { nonNullable: true }),
    ean: new FormControl('', {
      nonNullable: true,
      validators: [
        (control) =>
          control.value.trim() && !normalizeGtin(control.value) ? { gtin: true } : null,
      ],
    }),
    sku: new FormControl('', { nonNullable: true }),
    listingPrice: new FormControl<number | null>(null, {
      validators: [
        (control) =>
          control.value === null || (Number.isFinite(control.value) && control.value > 0)
            ? null
            : { price: true },
      ],
    }),
  });

  available(productId: string): number {
    return (
      this.positions().find((position) => position.catalog_product_id === productId)
        ?.available_quantity ?? 0
    );
  }

  open(): void {
    if (this.disabled()) return;
    this.form.reset({
      size: '',
      color: this.product().color ?? '',
      ean: '',
      sku: '',
      listingPrice: this.product().listing_price ?? null,
    });
    this.error.set(null);
    this.dialogOpen.set(true);
  }

  close(): void {
    if (!this.saving()) this.dialogOpen.set(false);
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.saving() || this.form.invalid) return;
    if (!value.size.trim() && !value.color.trim()) {
      this.error.set('Bitte Größe oder Farbe für die Variante angeben.');
      return;
    }
    const workspaceId = this.product().workspace_id;
    if (this.workspace.currentWorkspace()?.id !== workspaceId) {
      this.error.set('Der Workspace wurde gewechselt. Bitte den Artikel erneut öffnen.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const result = await this.catalog.createVariant({
      workspaceId,
      sourceProductId: this.product().id,
      size: value.size,
      color: value.color,
      ean: normalizeGtin(value.ean) ?? '',
      sku: value.sku,
      listingPrice: value.listingPrice,
    });
    this.saving.set(false);
    if (result.error || !result.data) {
      this.error.set(result.error?.message ?? 'Die Variante konnte nicht angelegt werden.');
      return;
    }
    this.dialogOpen.set(false);
    this.created.emit(result.data);
  }
}
