import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { CatalogProduct } from '../../../../core/models/flipbase.models';
import { ArticlePickerComponent } from '../../../../shared/components/article-picker/article-picker.component';
import type { ArticlePickerEntry } from '../../../../shared/components/article-picker/article-picker.models';
import { ItemConditionLabelPipe } from '../../../../shared/pipes/item-condition-label.pipe';
import { ProductVariantCreateFormComponent } from '../../../catalog/components/product-variant-create-form/product-variant-create-form.component';

/** Einkaufsspezifische Anlage bleibt außerhalb der gemeinsamen Auswahloberfläche. */
@Component({
  selector: 'app-purchase-product-picker',
  imports: [ArticlePickerComponent, ProductVariantCreateFormComponent],
  templateUrl: './purchase-product-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseProductPickerComponent {
  readonly products = input.required<readonly CatalogProduct[]>();
  readonly initialSearch = input('');
  readonly imageUrls = input<Readonly<Record<string, string>>>({});
  readonly createRequested = output<void>();
  readonly imageFailed = output<string>();
  readonly closed = output<void>();
  readonly selected = output<readonly CatalogProduct[]>();
  readonly createdVariants = signal<readonly CatalogProduct[]>([]);
  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly creatingFor = signal<CatalogProduct | null>(null);
  private readonly conditionLabels = new ItemConditionLabelPipe();
  readonly selectableProducts = computed(() => {
    const workspaceIds = new Set(this.products().map((product) => product.workspace_id));
    return [
      ...new Map(
        [...this.products(), ...this.createdVariants()].map((product) => [product.id, product]),
      ).values(),
    ].filter((product) => !product.archived_at && workspaceIds.has(product.workspace_id));
  });
  readonly entries = computed<readonly ArticlePickerEntry[]>(() =>
    this.selectableProducts().map((product) => ({
      id: product.id,
      groupId: product.variant_group_id ?? product.id,
      title: product.title,
      brand: product.brand,
      model: product.model,
      category: product.category,
      size: product.size,
      color: product.color,
      ean: product.ean,
      sku: product.sku,
      imageKey: product.id,
      conditionLabel: product.condition ? this.conditionLabels.transform(product.condition) : null,
    })),
  );

  startVariantCreation(entry: ArticlePickerEntry): void {
    const product = this.selectableProducts().find((candidate) => candidate.id === entry.id);
    if (product) this.creatingFor.set(product);
  }

  onVariantCreated(product: CatalogProduct): void {
    if (!this.products().some((existing) => existing.workspace_id === product.workspace_id)) return;
    this.createdVariants.update((variants) => [...variants, product]);
    this.selection.update((selected) => new Set([...selected, product.id]));
    this.creatingFor.set(null);
  }

  onSelected(entries: readonly ArticlePickerEntry[]): void {
    const ids = new Set(entries.map((entry) => entry.id));
    this.selected.emit(this.selectableProducts().filter((product) => ids.has(product.id)));
  }
}
