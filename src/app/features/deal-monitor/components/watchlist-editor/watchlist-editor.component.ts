import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  from,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { AttributePickerComponent } from '../../../../shared/components/attribute-picker/attribute-picker.component';
import { VintedCategory } from '../../../platform-admin/models/vinted-category.model';
import { collectedCategorySource } from '../../models/collected-category-source';
import { parseVintedFeedLink } from '../../models/vinted-feed-link';
import { DealMonitorService } from '../../services/deal-monitor.service';
import {
  FEED_CLOTHING_SIZES,
  feedSizeValues,
  Watchlist,
  WatchlistDraft,
  watchlistSizeLabels,
} from '../../models/deal-monitor.model';

@Component({
  selector: 'app-watchlist-editor',
  imports: [
    ReactiveFormsModule,
    CardComponent,
    TextFieldComponent,
    NumberInputComponent,
    CustomSelectComponent,
    ButtonComponent,
    CategoryPickerComponent,
    AttributePickerComponent,
  ],
  templateUrl: './watchlist-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistEditorComponent {
  private readonly api = inject(DealMonitorService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly watchlist = input<Watchlist | null>(null);
  readonly categories = input<readonly VintedCategory[]>([]);
  readonly collectedCategoryIds = input<readonly number[]>([]);
  readonly workspaceId = input.required<string>();
  readonly saving = input(false);
  readonly saved = output<WatchlistDraft>();
  readonly cancelled = output<void>();
  readonly brandSearchError = signal<string | null>(null);
  readonly submitAttempted = signal(false);
  readonly feedLink = new FormControl('', { nonNullable: true });
  readonly importingLink = signal(false);
  readonly linkError = signal<string | null>(null);
  private importGeneration = 0;
  readonly sizeOptions = FEED_CLOTHING_SIZES.map((size) => size.label);
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)],
    }),
    catalog_id: new FormControl<string | null>(null),
    sizes: new FormControl('', { nonNullable: true }),
    brand: new FormControl('', { nonNullable: true, validators: Validators.maxLength(100) }),
    search_text: new FormControl('', { nonNullable: true, validators: Validators.maxLength(200) }),
    condition: new FormControl('', { nonNullable: true, validators: Validators.maxLength(100) }),
    price_from: new FormControl<number | null>(null, [
      Validators.min(0),
      Validators.max(9999999999.99),
    ]),
    price_to: new FormControl<number | null>(null, [
      Validators.min(0),
      Validators.max(9999999999.99),
    ]),
  });
  private readonly initialFilter = signal('');
  private readonly currentFilter = toSignal(
    this.form.valueChanges.pipe(map(() => this.filterSnapshot())),
    { initialValue: this.filterSnapshot() },
  );
  readonly hasChanges = computed(() => this.currentFilter() !== this.initialFilter());
  readonly categorySource = computed(() =>
    collectedCategorySource(this.categories(), this.collectedCategoryIds()),
  );
  readonly brandOptions = toSignal(
    this.form.controls.brand.valueChanges.pipe(
      startWith(''),
      map((brand) => brand.trim()),
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((brand) => {
        this.brandSearchError.set(null);
        if (brand.length > 100) return of([]);
        return from(this.api.searchBrands(this.workspaceId(), brand)).pipe(
          catchError(() => {
            this.brandSearchError.set('Markenvorschläge konnten nicht geladen werden.');
            return of([]);
          }),
        );
      }),
    ),
    { initialValue: [] },
  );
  readonly conditionOptions = [
    { value: '', label: 'Alle Zustände' },
    ...['Neu mit Etikett', 'Neu ohne Etikett', 'Sehr gut', 'Gut', 'Zufriedenstellend'].map(
      (value) => ({ value, label: value }),
    ),
  ];

  constructor() {
    effect(() => {
      const row = this.watchlist();
      this.importGeneration++;
      this.importingLink.set(false);
      this.linkError.set(null);
      this.feedLink.reset();
      this.submitAttempted.set(false);
      this.form.reset({
        title: row?.title ?? '',
        catalog_id: row?.catalog_id == null ? null : String(row.catalog_id),
        sizes: watchlistSizeLabels(row?.sizes ?? []),
        brand: row?.brand ?? '',
        search_text: row?.search_text ?? '',
        condition: row?.condition ?? '',
        price_from: row?.price_from ?? null,
        price_to: row?.price_to ?? null,
      });
      this.initialFilter.set(this.filterSnapshot());
    });
    afterNextRender(() =>
      this.element.nativeElement.querySelector<HTMLInputElement>('input')?.focus(),
    );
  }

  private filterSnapshot(): string {
    const draft = this.form.getRawValue();
    return JSON.stringify({
      ...draft,
      title: draft.title.trim(),
      brand: draft.brand.trim(),
      search_text: draft.search_text.trim(),
      sizes: feedSizeValues(draft.sizes).sort(),
    });
  }

  async importLink(): Promise<void> {
    if (this.importingLink() || this.saving()) return;
    const generation = ++this.importGeneration;
    this.linkError.set(null);
    this.importingLink.set(true);
    try {
      const imported = parseVintedFeedLink(this.feedLink.value);
      if (imported.brandId === null && this.watchlist()?.legacy_brand_id != null)
        throw new Error(
          'Dieser Suchfilter hat eine alte Markenkennung. Übernimm den Link in einen neuen Suchfilter.',
        );
      if (
        imported.categoryId !== null &&
        !this.collectedCategoryIds().includes(imported.categoryId)
      )
        throw new Error('Die Kategorie aus dem Link wird im Feed noch nicht gesammelt.');
      const fields = await this.api.resolveFeedImport(this.workspaceId(), imported);
      if (generation !== this.importGeneration) return;
      if (
        fields.condition &&
        !this.conditionOptions.some((option) => option.value === fields.condition)
      )
        throw new Error('Der Zustand aus dem Link wird im Feed nicht unterstützt.');
      this.form.patchValue({
        catalog_id: imported.categoryId === null ? null : String(imported.categoryId),
        brand: fields.brand,
        condition: fields.condition,
        sizes: [...new Set(fields.sizeLabels)].join(' · '),
        search_text: imported.searchText,
        price_from: imported.minPrice,
        price_to: imported.maxPrice,
      });
      this.form.markAsDirty();
      this.feedLink.reset();
    } catch (error) {
      if (generation === this.importGeneration)
        this.linkError.set(
          error instanceof Error ? error.message : 'Der Link konnte nicht übernommen werden.',
        );
    } finally {
      if (generation === this.importGeneration) this.importingLink.set(false);
    }
  }

  submit(): void {
    if (this.saving() || this.importingLink() || !this.hasChanges()) return;
    this.submitAttempted.set(true);
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.form.invalid || !value.title.trim()) return;
    if (value.price_from !== null && value.price_to !== null && value.price_from > value.price_to) {
      this.form.setErrors({ priceRange: true });
      return;
    }
    this.saved.emit({
      ...value,
      id: this.watchlist()?.id ?? null,
      catalog_id: value.catalog_id === null ? null : Number(value.catalog_id),
      audience: null,
      sizes: feedSizeValues(value.sizes),
    });
  }
}
