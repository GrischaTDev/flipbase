import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { LucidePlus } from '@lucide/angular';
import { categoryPathParts } from '../../../core/models/product-category.models';
import { ModalShellComponent } from '../modal-shell/modal-shell.component';
import { TextFieldComponent } from '../text-field/text-field.component';
import { ButtonComponent } from '../button/button.component';
import { ProductThumbnailComponent } from '../product-thumbnail/product-thumbnail.component';
import { CustomSelectComponent, SelectOption } from '../custom-select/custom-select.component';
import type { ArticlePickerEntry } from './article-picker.models';
import {
  filterArticleGroups,
  groupArticles,
  isArticleSelectable,
  selectedArticles,
  toggleArticleSelection,
} from './article-picker-selection';

/** Gemeinsame Auswahloberfläche; Bestände und Produktanlage liefert ausschließlich das Feature. */
@Component({
  selector: 'app-article-picker',
  imports: [
    ReactiveFormsModule,
    ModalShellComponent,
    TextFieldComponent,
    ButtonComponent,
    ProductThumbnailComponent,
    CustomSelectComponent,
  ],
  templateUrl: './article-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticlePickerComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly plusIcon = LucidePlus;
  readonly entries = input.required<readonly ArticlePickerEntry[]>();
  readonly imageUrls = input<Readonly<Record<string, string>>>({});
  readonly initialSearch = input('');
  readonly loading = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly allowCreate = input(false);
  readonly allowVariantCreation = input(false);
  readonly detailsOpen = input(false);
  readonly variantHint = input('Wähle die Größe und Farbe für diese Position.');
  readonly selectionMode = input<'single' | 'multiple'>('multiple');
  readonly selection = model<ReadonlySet<string>>(new Set());
  readonly closed = output<void>();
  readonly selected = output<readonly ArticlePickerEntry[]>();
  readonly createRequested = output<void>();
  readonly variantCreateRequested = output<ArticlePickerEntry>();
  readonly imageFailed = output<string>();
  readonly retryRequested = output<void>();
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly query = toSignal(this.searchControl.valueChanges);
  readonly activeGroupId = signal<string | null>(null);
  readonly categoryFilter = signal<string | null>(null);
  readonly brandFilter = signal<string | null>(null);
  readonly groups = computed(() => groupArticles(this.entries()));
  readonly activeGroup = computed(() =>
    this.groups().find((group) => group.id === this.activeGroupId()),
  );
  readonly filteredGroups = computed(() =>
    filterArticleGroups(this.groups(), {
      query: this.query() ?? this.initialSearch(),
      category: this.categoryFilter(),
      brand: this.brandFilter(),
    }),
  );
  readonly selectedEntries = computed(() => selectedArticles(this.entries(), this.selection()));
  readonly canConfirm = computed(
    () =>
      !this.loading() &&
      !this.errorMessage() &&
      !this.detailsOpen() &&
      this.selectedEntries().length > 0 &&
      (this.selectionMode() === 'multiple' || this.selectedEntries().length === 1),
  );
  readonly hasActiveFilters = computed(() => !!this.categoryFilter() || !!this.brandFilter());
  readonly categoryOptions = computed<readonly SelectOption<string>[]>(() => {
    const categories = new Set(
      this.entries().flatMap((entry) => (entry.category?.trim() ? [entry.category.trim()] : [])),
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
      this.entries().flatMap((entry) => (entry.brand?.trim() ? [entry.brand.trim()] : [])),
    );
    return [
      { value: '', label: 'Alle Marken' },
      ...[...brands]
        .sort((left, right) => left.localeCompare(right, 'de'))
        .map((brand) => ({ value: brand, label: brand })),
    ];
  });

  constructor() {
    let wasDetailsOpen = false;
    effect(() => {
      const open = this.detailsOpen();
      if (wasDetailsOpen && !open) this.focusAfterRender('[data-variant-heading]');
      wasDetailsOpen = open;
    });
  }

  isSelectable(entry: ArticlePickerEntry): boolean {
    return !this.loading() && !this.errorMessage() && isArticleSelectable(entry);
  }

  openGroup(id: string): void {
    if (
      this.loading() ||
      this.errorMessage() ||
      !this.groups().some((group) => group.id === id)
    )
      return;
    this.activeGroupId.set(id);
    this.focusAfterRender('[data-variant-heading]');
  }

  backToGroups(): void {
    const previousId = this.activeGroupId();
    this.activeGroupId.set(null);
    afterNextRender(
      () => {
        const rows = this.host.nativeElement.querySelectorAll<HTMLElement>('[data-product-group]');
        (
          [...rows].find((row) => row.getAttribute('data-product-group') === previousId) ?? rows[0]
        )?.focus();
      },
      { injector: this.injector },
    );
  }

  createVariant(): void {
    const entry = this.activeGroup()?.entries[0];
    if (entry && this.allowVariantCreation() && !this.loading() && !this.errorMessage()) {
      this.variantCreateRequested.emit(entry);
    }
  }

  resetFilters(): void {
    this.categoryFilter.set(null);
    this.brandFilter.set(null);
  }

  toggle(id: string): void {
    if (this.loading() || this.errorMessage()) return;
    this.selection.update((selected) =>
      toggleArticleSelection(this.entries(), selected, id, this.selectionMode()),
    );
  }

  confirm(): void {
    if (this.canConfirm()) this.selected.emit(this.selectedEntries());
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
