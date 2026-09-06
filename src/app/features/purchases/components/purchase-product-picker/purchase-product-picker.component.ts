import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CatalogProduct } from '../../../../core/models/flipbase.models';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
@Component({
  selector: 'app-purchase-product-picker',
  imports: [ModalDialogDirective],
  templateUrl: './purchase-product-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseProductPickerComponent {
  readonly products = input.required<readonly CatalogProduct[]>();
  readonly initialSearch = input('');
  readonly closed = output<void>();
  readonly selected = output<readonly CatalogProduct[]>();
  readonly query = signal<string | null>(null);
  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly filtered = computed(() => {
    const query = (this.query() ?? this.initialSearch()).trim().toLocaleLowerCase('de');
    return this.products().filter((product) =>
      [product.title, product.ean, product.brand, product.model].some((value) =>
        value?.toLocaleLowerCase('de').includes(query),
      ),
    );
  });
  search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
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
