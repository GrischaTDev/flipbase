import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, from, map, of, switchMap } from 'rxjs';
import { AttributePickerComponent } from '../../../../shared/components/attribute-picker/attribute-picker.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { VintedBrand } from '../../../../core/models/vinted-brand.model';
import { vintedCategorySource } from '../../../../core/models/vinted-category-source';
import { VintedCategory } from '../../../../core/models/vinted-category.model';
import {
  FEED_CLOTHING_SIZES,
  PersonalFeed,
  PersonalFeedDraft,
  feedSizeLabels,
  feedSizeValues,
} from '../../models/deal-monitor.model';
import { parseVintedFeedLink } from '../../models/vinted-feed-link';
import { DealMonitorService } from '../../services/deal-monitor.service';

export const UNRECOGNIZED_LINK_BRAND_ERROR =
  'Marke aus dem Link nicht erkannt. Bitte wähle sie aus.';

function priceRangeValidator(group: AbstractControl): ValidationErrors | null {
  const from = group.get('price_from')?.value as number | null | undefined;
  const to = group.get('price_to')?.value as number | null | undefined;
  return from != null && to != null && from > to ? { priceRange: true } : null;
}

@Component({
  selector: 'app-personal-feed-editor',
  imports: [
    ReactiveFormsModule,
    TextFieldComponent,
    NumberInputComponent,
    CustomSelectComponent,
    ButtonComponent,
    CategoryPickerComponent,
    AttributePickerComponent,
  ],
  templateUrl: './personal-feed-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonalFeedEditorComponent {
  private readonly api = inject(DealMonitorService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  readonly feed = input<PersonalFeed | null>(null);
  readonly workspaceId = input.required<string>();
  readonly saving = input(false);
  readonly saveError = input<string | null>(null);
  readonly saved = output<PersonalFeedDraft>();
  readonly brandSearchError = signal<string | null>(null);
  readonly brandImportError = signal<string | null>(null);
  readonly brandError = computed(() => this.brandImportError() ?? this.brandSearchError());
  readonly categoryError = signal(false);
  readonly submitAttempted = signal(false);
  readonly feedLink = new FormControl('', { nonNullable: true });
  readonly importingLink = signal(false);
  readonly linkError = signal<string | null>(null);
  readonly linkImported = signal(false);
  private importGeneration = 0;
  private readonly categories = signal<VintedCategory[]>([]);
  private readonly brands = new Map<string, VintedBrand>();
  readonly brandQueries = new Subject<string>();
  readonly sizeOptions = FEED_CLOTHING_SIZES.map((size) => size.label);

  readonly form = new FormGroup(
    {
      title: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)],
      }),
      catalog_id: new FormControl<string | null>(null),
      sizes: new FormControl('', { nonNullable: true }),
      brand: new FormControl('', { nonNullable: true }),
      search_text: new FormControl('', {
        nonNullable: true,
        validators: Validators.maxLength(200),
      }),
      condition: new FormControl('', { nonNullable: true, validators: Validators.maxLength(100) }),
      price_from: new FormControl<number | null>(null, [
        Validators.min(0),
        Validators.max(9999999999.99),
      ]),
      price_to: new FormControl<number | null>(null, [
        Validators.min(0),
        Validators.max(9999999999.99),
      ]),
    },
    { validators: priceRangeValidator },
  );
  private readonly initialFilter = signal('');
  private readonly currentFilter = toSignal(
    this.form.valueChanges.pipe(map(() => this.filterSnapshot())),
    { initialValue: this.filterSnapshot() },
  );
  readonly hasChanges = computed(() => this.currentFilter() !== this.initialFilter());
  readonly categorySource = computed(() =>
    vintedCategorySource(this.categories(), { included: [], excluded: [] }),
  );
  readonly brandOptions = toSignal(
    this.brandQueries.pipe(
      map((brand) => brand.trim()),
      debounceTime(250),
      switchMap((brand) => {
        this.brandSearchError.set(null);
        if (brand.length < 2 || brand.length > 100) return of([]);
        return from(this.api.searchBrands(this.workspaceId(), brand)).pipe(
          map((results) => results.map((result) => this.rememberBrand(result))),
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
    this.feedLink.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.linkError.set(null);
      this.linkImported.set(false);
    });
    this.form.controls.brand.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.brandImportError.set(null));
    effect(() => {
      const row = this.feed();
      this.importGeneration++;
      this.importingLink.set(false);
      this.linkError.set(null);
      this.linkImported.set(false);
      this.feedLink.reset('', { emitEvent: false });
      this.submitAttempted.set(false);
      const brand =
        row?.brand_id && row.brand
          ? this.rememberBrand({ id: row.brand_id, name: row.brand })
          : (row?.brand ?? '');
      this.form.reset({
        title: row?.title ?? '',
        catalog_id: row?.catalog_id == null ? null : String(row.catalog_id),
        sizes: feedSizeLabels(row?.sizes ?? []),
        brand,
        search_text: row?.search_text ?? '',
        condition: row?.condition ?? '',
        price_from: row?.price_from ?? null,
        price_to: row?.price_to ?? null,
      });
      this.brandImportError.set(null);
      this.initialFilter.set(this.filterSnapshot());
    });
    void this.loadCategories();
    afterNextRender(() =>
      this.element.nativeElement.querySelector<HTMLInputElement>('input')?.focus(),
    );
  }

  async loadCategories(): Promise<void> {
    this.categoryError.set(false);
    try {
      const categories = await this.api.categories();
      if (!this.destroyRef.destroyed) this.categories.set(categories);
    } catch {
      if (!this.destroyRef.destroyed) this.categoryError.set(true);
    }
  }

  private rememberBrand(brand: VintedBrand): string {
    const existing = this.brands.get(brand.name);
    const label =
      existing && existing.id !== brand.id ? `${brand.name} (#${brand.id})` : brand.name;
    this.brands.set(label, brand);
    return label;
  }

  private filterSnapshot(): string {
    const draft = this.form.getRawValue();
    return JSON.stringify({
      ...draft,
      title: draft.title.trim(),
      search_text: draft.search_text.trim(),
      sizes: feedSizeValues(draft.sizes).sort(),
    });
  }

  async importLink(): Promise<void> {
    if (this.importingLink() || this.saving()) return;
    const generation = ++this.importGeneration;
    this.linkError.set(null);
    this.linkImported.set(false);
    this.importingLink.set(true);
    try {
      const imported = parseVintedFeedLink(this.feedLink.value);
      const fields = await this.api.resolveFeedImport(this.workspaceId(), imported);
      if (generation !== this.importGeneration || this.destroyRef.destroyed) return;
      if (
        fields.condition &&
        !this.conditionOptions.some((option) => option.value === fields.condition)
      )
        throw new Error('Der Zustand aus dem Link wird im Feed nicht unterstützt.');
      this.form.patchValue({
        catalog_id: imported.categoryId === null ? null : String(imported.categoryId),
        brand: fields.brand ? this.rememberBrand(fields.brand) : '',
        condition: fields.condition,
        sizes: feedSizeLabels(fields.sizes),
        search_text: imported.searchText,
        price_from: imported.minPrice,
        price_to: imported.maxPrice,
      });
      this.brandImportError.set(fields.brandNotRecognized ? UNRECOGNIZED_LINK_BRAND_ERROR : null);
      this.feedLink.reset('', { emitEvent: false });
      this.linkImported.set(true);
    } catch (error) {
      if (generation === this.importGeneration && !this.destroyRef.destroyed)
        this.linkError.set(
          error instanceof Error ? error.message : 'Der Link konnte nicht übernommen werden.',
        );
    } finally {
      if (generation === this.importGeneration && !this.destroyRef.destroyed)
        this.importingLink.set(false);
    }
  }

  submit(): void {
    if (this.saving() || this.importingLink() || !this.hasChanges()) return;
    this.submitAttempted.set(true);
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.form.invalid || !value.title.trim()) return;
    const brand = this.brands.get(value.brand);
    this.saved.emit({
      id: this.feed()?.id ?? null,
      title: value.title.trim(),
      catalog_id: value.catalog_id === null ? null : Number(value.catalog_id),
      audience: this.feed()?.audience ?? null,
      brand: (brand ? brand.name : value.brand) || null,
      brand_id: brand?.id ?? null,
      search_text: value.search_text.trim() || null,
      condition: value.condition || null,
      sizes: feedSizeValues(value.sizes),
      price_from: value.price_from,
      price_to: value.price_to,
    });
  }
}
