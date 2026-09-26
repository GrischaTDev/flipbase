import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { LucidePlus } from '@lucide/angular';
import { CatalogProduct } from '../../../../core/models/flipbase.models';
import { categoryPathParts } from '../../../../core/models/product-category.models';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ItemConditionLabelPipe } from '../../../../shared/pipes/item-condition-label.pipe';
import { ProductVariantCreateFormComponent } from '../../../catalog/components/product-variant-create-form/product-variant-create-form.component';

interface ProductGroup {
  readonly id: string;
  readonly product: CatalogProduct;
  readonly variants: readonly CatalogProduct[];
}
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
    ProductVariantCreateFormComponent,
  ],
  templateUrl: './purchase-product-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseProductPickerComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly plusIcon = LucidePlus;
  readonly products = input.required<readonly CatalogProduct[]>();
  readonly createdVariants = signal<readonly CatalogProduct[]>([]);
  readonly selectableProducts = computed(() =>
    [
      ...new Map(
        [...this.products(), ...this.createdVariants()].map((product) => [product.id, product]),
      ).values(),
    ].filter((product) => !product.archived_at),
  );
  readonly initialSearch = input('');
  readonly imageUrls = input<Readonly<Record<string, string>>>({});
  readonly createRequested = output<void>();
  readonly imageFailed = output<string>();
  readonly closed = output<void>();
  readonly selected = output<readonly CatalogProduct[]>();
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly query = toSignal(this.searchControl.valueChanges);
  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly activeGroupId = signal<string | null>(null);
  readonly creatingVariant = signal(false);
  readonly categoryFilter = signal<string | null>(null);
  readonly brandFilter = signal<string | null>(null);
  readonly categoryOptions = computed<readonly SelectOption<string>[]>(() => {
    const categories = new Set(
      this.selectableProducts().flatMap((product) => {
        const category = product.category?.trim();
        return category ? [category] : [];
      }),
    );

    return [
      { value: '', label: 'Alle Kategorien' },
      ...[...categories]
        .map((category) => ({
          value: category,
          label: categoryPathParts(category).at(-1) ?? category,
        }))
        .sort(
          (left, right) =>
            left.label.localeCompare(right.label, 'de') ||
            left.value.localeCompare(right.value, 'de'),
        ),
    ];
  });
  readonly brandOptions = computed<readonly SelectOption<string>[]>(() => {
    const brands = new Set(
      this.selectableProducts().flatMap((product) => {
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
  readonly groups = computed<readonly ProductGroup[]>(() => {
    const grouped = new Map<string, CatalogProduct[]>();
    for (const product of this.selectableProducts()) {
      const id = product.variant_group_id ?? product.id;
      grouped.set(id, [...(grouped.get(id) ?? []), product]);
    }
    return [...grouped].map(([id, variants]) => ({
      id,
      product: variants.find((variant) => variant.id === id) ?? variants[0],
      variants: variants.sort(
        (left, right) =>
          (left.size ?? '').localeCompare(right.size ?? '', 'de', { numeric: true }) ||
          (left.color ?? '').localeCompare(right.color ?? '', 'de'),
      ),
    }));
  });
  readonly activeGroup = computed(() =>
    this.groups().find((group) => group.id === this.activeGroupId()),
  );
  readonly filteredGroups = computed(() => {
    const query = (this.query() ?? this.initialSearch()).trim().toLocaleLowerCase('de');
    const category = this.categoryFilter();
    const brand = this.brandFilter();

    return this.groups().filter(
      (group) =>
        (!category || group.product.category?.trim() === category) &&
        (!brand || group.product.brand?.trim() === brand) &&
        group.variants.some((product) =>
          [
            product.title,
            product.ean,
            product.sku,
            product.brand,
            product.model,
            product.size,
            product.color,
          ].some((value) => value?.toLocaleLowerCase('de').includes(query)),
        ),
    );
  });

  openGroup(id: string): void {
    this.activeGroupId.set(id);
    this.creatingVariant.set(false);
    this.focusAfterRender('[data-variant-heading]');
  }

  backToGroups(): void {
    this.activeGroupId.set(null);
    this.focusAfterRender('[data-product-group]');
  }

  startVariantCreation(): void {
    this.creatingVariant.set(true);
    this.focusAfterRender('[data-variant-form] input');
  }

  cancelVariantCreation(): void {
    this.creatingVariant.set(false);
    this.focusAfterRender('[data-variant-heading]');
  }

  onVariantCreated(product: CatalogProduct): void {
    this.createdVariants.update((current) => [...current, product]);
    this.selection.update((current) => new Set([...current, product.id]));
    this.cancelVariantCreation();
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }

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
    this.selected.emit(
      this.selectableProducts().filter((product) => this.selection().has(product.id)),
    );
  }
}
