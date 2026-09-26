import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CatalogProduct } from '../../../../core/models/flipbase.models';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { AttributePickerComponent } from '../../../../shared/components/attribute-picker/attribute-picker.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { normalizeGtin } from '../../../../shared/utils/gtin';
import { PRODUCT_COLOR_OPTIONS } from '../../models/product-attribute-options';

@Component({
  selector: 'app-product-variant-create-form',
  imports: [
    ReactiveFormsModule,
    AttributePickerComponent,
    ButtonComponent,
    NumberInputComponent,
    TextFieldComponent,
  ],
  templateUrl: './product-variant-create-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductVariantCreateFormComponent {
  private readonly catalog = inject(CatalogService);
  private readonly workspace = inject(WorkspaceService);
  readonly product = input.required<CatalogProduct>();
  readonly created = output<CatalogProduct>();
  readonly cancelled = output<void>();
  readonly colorOptions = PRODUCT_COLOR_OPTIONS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
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

  constructor() {
    effect(() => {
      this.form.patchValue({
        color: this.product().color ?? '',
        listingPrice: this.product().listing_price ?? null,
      });
    });
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.saving() || this.form.invalid) return;
    if (!value.size.trim() && !value.color.trim()) {
      this.error.set('Bitte Größe oder Farbe für die Variante angeben.');
      return;
    }
    const product = this.product();
    if (this.workspace.currentWorkspace()?.id !== product.workspace_id) {
      this.error.set('Der Workspace wurde gewechselt. Bitte den Artikel erneut öffnen.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const result = await this.catalog.createVariant({
      workspaceId: product.workspace_id,
      sourceProductId: product.id,
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
    this.created.emit(result.data);
  }
}
