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
import { ProductImageDraft } from '../../../../core/models/product-media.models';
import { CatalogService } from '../../../../core/services/catalog.service';
import { MediaService } from '../../../../core/services/media.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { AttributePickerComponent } from '../../../../shared/components/attribute-picker/attribute-picker.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { normalizeGtin } from '../../../../shared/utils/gtin';
import { ProductMediaEditorComponent } from '../product-media-editor/product-media-editor.component';
import {
  PRODUCT_COLOR_OPTIONS,
  PRODUCT_COLOR_SWATCHES,
} from '../../models/product-attribute-options';

@Component({
  selector: 'app-product-variant-create-form',
  imports: [
    ReactiveFormsModule,
    AttributePickerComponent,
    ButtonComponent,
    NumberInputComponent,
    ProductMediaEditorComponent,
    TextFieldComponent,
  ],
  templateUrl: './product-variant-create-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductVariantCreateFormComponent {
  private readonly catalog = inject(CatalogService);
  private readonly media = inject(MediaService);
  private readonly workspace = inject(WorkspaceService);
  readonly product = input.required<CatalogProduct>();
  readonly created = output<CatalogProduct>();
  readonly variantSaved = output<CatalogProduct>();
  readonly cancelled = output<void>();
  readonly colorOptions = PRODUCT_COLOR_OPTIONS;
  readonly colorSwatches = PRODUCT_COLOR_SWATCHES;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly images = signal<readonly ProductImageDraft[]>([]);
  private readonly createdVariant = signal<CatalogProduct | null>(null);
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
    try {
      let variant = this.createdVariant();
      if (!variant) {
        const result = await this.catalog.createVariant({
          workspaceId: product.workspace_id,
          sourceProductId: product.id,
          size: value.size,
          color: value.color,
          ean: normalizeGtin(value.ean) ?? '',
          sku: value.sku,
          listingPrice: value.listingPrice,
        });
        if (result.error || !result.data)
          throw result.error ?? new Error('Die Variante konnte nicht angelegt werden.');
        variant = result.data;
        this.createdVariant.set(variant);
        this.variantSaved.emit(variant);
        this.form.disable();
      }
      for (const image of this.images()) {
        if (!image.file) continue;
        if (this.workspace.currentWorkspace()?.id !== product.workspace_id)
          throw new Error('Der Workspace wurde gewechselt. Die Variante ist bereits gespeichert.');
        const result = await this.media.uploadProductMedia(variant.id, image.file, undefined, {
          fileName: image.fileName ?? image.file.name,
          altText: image.altText ?? '',
        });
        if (result.error || !result.data)
          throw result.error ?? new Error('Ein Variantenbild konnte nicht gespeichert werden.');
        const uploaded = result.data;
        this.images.update((current) => current.filter((entry) => entry.key !== image.key));
        if (uploaded.is_primary)
          this.catalog.updateProductPrimaryMedia(
            variant.id,
            product.workspace_id,
            uploaded.storage_path,
          );
      }
      if (this.workspace.currentWorkspace()?.id === product.workspace_id)
        this.created.emit(variant);
    } catch (cause: unknown) {
      const message =
        cause instanceof Error ? cause.message : 'Variante konnte nicht gespeichert werden.';
      this.error.set(
        this.createdVariant()
          ? `Die Variante ist angelegt. ${message} Du kannst die Bilder erneut speichern.`
          : message,
      );
    } finally {
      this.saving.set(false);
    }
  }
}
