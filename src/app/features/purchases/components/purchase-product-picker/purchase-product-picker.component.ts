import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CatalogProduct } from '../../../../core/models/flipbase.models';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ItemConditionLabelPipe } from '../../../../shared/pipes/item-condition-label.pipe';
@Component({
  selector: 'app-purchase-product-picker',
  imports: [
    ReactiveFormsModule,
    ModalShellComponent,
    TextFieldComponent,
    ButtonComponent,
    ProductThumbnailComponent,
    CustomSelectComponent,
    ItemConditionLabelPipe,
  ],
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
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly query = toSignal(this.searchControl.valueChanges);
  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly categoryFilter = signal<string | null>(null);
  readonly brandFilter = signal<string | null>(null);
  readonly categoryOptions = computed<readonly SelectOption<string>[]>(() => {
    const categories = new Set(
      this.products().flatMap((product) => {
        const category = product.category?.trim();
        return category ? [category] : [];
      }),
    );

    return [
      { value: '', label: 'Alle Kategorien' },
      ...[...categories]
        .sort((left, right) => left.localeCompare(right, 'de'))
        .map((category) => ({ value: category, label: category })),
    ];
  });
  readonly brandOptions = computed<readonly SelectOption<string>[]>(() => {
    const brands = new Set(
      this.products().flatMap((product) => {
        const brand = product.brand?.trim();
        return brand ? [brand] : [];
      }),
    );

    return [
      { value: '', label: 'Alle Marken' },
      ...[...brands]
        .sort((left, right) => left.localeCompare(right, 'de'))
        .map((brand) => ({ value: brand, label: brand })),
    ];
  });
  readonly hasActiveFilters = computed(() => !!this.categoryFilter() || !!this.brandFilter());
  readonly filtered = computed(() => {
    const query = (this.query() ?? this.initialSearch()).trim().toLocaleLowerCase('de');
    const category = this.categoryFilter();
    const brand = this.brandFilter();

    return this.products().filter(
      (product) =>
        (!category || product.category?.trim() === category) &&
        (!brand || product.brand?.trim() === brand) &&
        [product.title, product.ean, product.brand, product.model].some((value) =>
          value?.toLocaleLowerCase('de').includes(query),
        ),
    );
  });

  resetFilters(): void {
    this.categoryFilter.set(null);
    this.brandFilter.set(null);
  }

  toggle(id: string): void {
    this.selection.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  confirm(): void {
    this.selected.emit(this.products().filter((product) => this.selection().has(product.id)));
  }
}
