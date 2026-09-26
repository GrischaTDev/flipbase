import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogProduct, StockPosition } from '../../../../core/models/flipbase.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ProductVariantCreateFormComponent } from '../product-variant-create-form/product-variant-create-form.component';

@Component({
  selector: 'app-product-variants',
  imports: [RouterLink, ButtonComponent, ModalShellComponent, ProductVariantCreateFormComponent],
  templateUrl: './product-variants.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductVariantsComponent {
  readonly product = input.required<CatalogProduct>();
  readonly variants = input.required<readonly CatalogProduct[]>();
  readonly positions = input<readonly StockPosition[]>([]);
  readonly disabled = input(false);
  readonly created = output<CatalogProduct>();
  readonly dialogOpen = signal(false);
  readonly orderedVariants = computed(() =>
    [...this.variants()].sort(
      (left, right) =>
        (left.size ?? '').localeCompare(right.size ?? '', 'de', { numeric: true }) ||
        (left.color ?? '').localeCompare(right.color ?? '', 'de'),
    ),
  );

  available(productId: string): number {
    return (
      this.positions().find((position) => position.catalog_product_id === productId)
        ?.available_quantity ?? 0
    );
  }

  onCreated(variant: CatalogProduct): void {
    this.dialogOpen.set(false);
    this.created.emit(variant);
  }
}
