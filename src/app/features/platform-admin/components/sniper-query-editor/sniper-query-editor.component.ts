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
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { LucidePencil, LucideX } from '@lucide/angular';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { FormFieldComponent } from '../../../../shared/components/form-field/form-field.component';
import {
  SearchMultiSelectComponent,
  SearchMultiSelectOption,
} from '../../../../shared/components/search-multi-select/search-multi-select.component';
import { VintedCategoryPickerComponent } from '../vinted-category-picker/vinted-category-picker.component';
import {
  QueryDraft,
  SniperQuery,
  TitleKeywordMode,
  normalizeFilterKeyword,
  queryDraftError,
} from '../../models/sniper-query.model';
import { VintedBrand } from '../../models/vinted-brand.model';
import { VintedCategory, CategorySyncStatus } from '../../models/vinted-category.model';
import { VintedCategoryService } from '../../services/vinted-category.service';
import { VintedBrandSearchService } from '../../services/vinted-brand-search.service';

@Component({
  selector: 'app-sniper-query-editor',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    TextFieldComponent,
    NumberInputComponent,
    ButtonComponent,
    CustomSelectComponent,
    FormFieldComponent,
    SearchMultiSelectComponent,
    VintedCategoryPickerComponent,
  ],
  templateUrl: './sniper-query-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SniperQueryEditorComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly categoryApi = inject(VintedCategoryService);
  private readonly brandApi = inject(VintedBrandSearchService);
  private searchTimer?: ReturnType<typeof setTimeout>;
  private brandRequest = 0;
  private categoryRequest = 0;
  readonly query = input<SniperQuery | null>(null);
  readonly saving = input(false);
  readonly saveError = input<string | null>(null);
  readonly saved = output<QueryDraft>();
  readonly cancelled = output<void>();
  readonly editing = computed(() => this.query()?.id ?? null);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);
  readonly categories = signal<VintedCategory[]>([]);
  readonly categoryStatus = signal<CategorySyncStatus | null>(null);
  readonly categoryLoading = signal(false);
  readonly categoryError = signal<string | null>(null);
  readonly brands = signal<VintedBrand[]>([]);
  readonly brandResults = signal<VintedBrand[]>([]);
  readonly brandTerm = signal('');
  readonly brandLoading = signal(false);
  readonly brandError = signal<string | null>(null);
  readonly keywords = signal<string[]>([]);
  readonly excludedKeywords = signal<string[]>([]);
  readonly removeIcon = LucideX;
  readonly editIcon = LucidePencil;
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/u), Validators.maxLength(100)],
    }),
    catalogId: new FormControl<number | null>(null),
    keywordEntry: new FormControl('', { nonNullable: true }),
    excludedKeywordEntry: new FormControl('', { nonNullable: true }),
    keywordMode: new FormControl<TitleKeywordMode>('all', { nonNullable: true }),
    intervalSeconds: new FormControl(5, {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.min(1),
        Validators.max(86400),
        Validators.pattern(/^\d+$/u),
      ],
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
    searchText: new FormControl('', { nonNullable: true }),
    priceFrom: new FormControl<number | null>(null, [
      Validators.min(0),
      Validators.max(9999999999.99),
    ]),
    priceTo: new FormControl<number | null>(null, [
      Validators.min(0),
      Validators.max(9999999999.99),
    ]),
  });
  readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly catalogId = computed(() => this.formValue().catalogId ?? null);
  readonly categoryMissing = computed(
    () =>
      this.catalogId() !== null &&
      !this.categories().some((category) => category.id === this.catalogId()),
  );
  readonly hasUnresolvedBrandNames = computed(() =>
    this.brands().some((brand) => brand.name === 'Gespeicherte Marke'),
  );
  readonly brandOptions = computed<SearchMultiSelectOption[]>(() =>
    this.brandResults()
      .filter((brand) => !this.brands().some((selected) => selected.id === brand.id))
      .map((brand) => ({ value: brand.id, label: brand.name })),
  );
  readonly modeOptions = [
    { value: 'all' as const, label: 'Alle' },
    { value: 'any' as const, label: 'Mindestens eines' },
  ];
  readonly titleSuggestions = [
    {
      id: 'puffer' as const,
      title: 'Pufferjacken',
      terms: ['puffer', 'pufferjacke', 'puffer jacke', 'pufferjacken', 'puffer jacken'],
    },
    {
      id: 'cable' as const,
      title: 'Zopfpullover',
      terms: ['zopfpullover', 'zopf pullover', 'cable knit'],
    },
  ];
  readonly summary = computed(() => {
    const category =
      this.catalogId() === null
        ? 'Alle Kategorien'
        : (this.categories().find((row) => row.id === this.catalogId())?.path ??
          'Nicht verfügbare Kategorie');
    const brands = this.brands().length
      ? this.brands()
          .map((brand) => brand.name)
          .join(' oder ')
      : 'alle Marken';
    const words = this.keywords().length
      ? ` · Titel enthält ${this.formValue().keywordMode === 'any' ? 'mindestens einen Begriff' : 'alle Begriffe'}: ${this.keywords().join(', ')}`
      : '';
    const value = this.formValue();
    const legacy = value.searchText?.trim() ? ` · Vinted-Suchtext: ${value.searchText.trim()}` : '';
    const prices = [
      value.priceFrom == null ? '' : `ab ${value.priceFrom.toLocaleString('de-DE')} €`,
      value.priceTo == null ? '' : `bis ${value.priceTo.toLocaleString('de-DE')} €`,
    ]
      .filter(Boolean)
      .join(' ');
    const excluded = this.excludedKeywords().length
      ? ` · ohne: ${this.excludedKeywords().join(', ')}`
      : '';
    return `${category} · ${brands}${words}${excluded}${legacy}${prices ? ' · ' + prices : ''}`;
  });
  readonly categoryStale = signal(false);

  constructor() {
    effect(() => this.edit(this.query()));
    effect(() => {
      if (this.saving()) this.form.disable();
      else this.form.enable();
    });
    afterNextRender(() =>
      this.element.nativeElement.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus(),
    );
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.searchTimer);
      this.brandRequest += 1;
      this.categoryRequest += 1;
    });
    void this.loadCategories();
  }

  edit(query: SniperQuery | null): void {
    this.form.reset({
      title: query?.title ?? '',
      catalogId: query?.catalog_id ?? null,
      keywordEntry: '',
      excludedKeywordEntry: '',
      keywordMode: query?.keyword_mode === 'any' ? 'any' : 'all',
      intervalSeconds: (query?.poll_interval_ms ?? 5000) / 1000,
      notes: query?.notes ?? '',
      searchText: query?.search_text ?? '',
      priceFrom: query?.price_from ?? null,
      priceTo: query?.price_to ?? null,
    });
    const ids = query?.brand_ids?.length
      ? query.brand_ids
      : query?.brand_id
        ? [query.brand_id]
        : [];
    this.brands.set(
      ids.map((id, index) => ({ id, name: query?.brand_names?.[index] || 'Gespeicherte Marke' })),
    );
    this.keywords.set([...(query?.title_keywords ?? [])]);
    this.excludedKeywords.set([...(query?.excluded_title_keywords ?? [])]);
    this.error.set(null);
    this.submitted.set(false);
  }

  fieldError(
    field: 'title' | 'intervalSeconds' | 'priceFrom' | 'priceTo' | 'notes',
  ): string | null {
    if (!this.submitted()) return null;
    const values = this.formValue();
    if (
      field === 'priceTo' &&
      values.priceFrom != null &&
      values.priceTo != null &&
      values.priceFrom > values.priceTo
    )
      return 'Der Höchstpreis muss mindestens so hoch wie der Mindestpreis sein.';
    if (!this.form.controls[field].invalid) return null;
    switch (field) {
      case 'title':
        return 'Gib einen Filternamen mit 1 bis 100 Zeichen an.';
      case 'intervalSeconds':
        return 'Gib eine ganze Zahl von 1 bis 86.400 Sekunden an.';
      case 'notes':
        return 'Deine Notiz darf höchstens 2.000 Zeichen enthalten.';
      default:
        return 'Gib einen gültigen Preis ab 0 € an.';
    }
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty;
  }

  async loadCategories(): Promise<void> {
    const request = ++this.categoryRequest;
    this.categoryLoading.set(true);
    this.categoryError.set(null);
    try {
      const snapshot = await this.categoryApi.readSnapshot();
      if (request !== this.categoryRequest || this.destroyRef.destroyed) return;
      this.categories.set(snapshot.categories);
      this.categoryStatus.set(snapshot.status);
      const refreshedAt = Date.parse(snapshot.status.refreshedAt ?? '');
      this.categoryStale.set(!Number.isFinite(refreshedAt) || Date.now() - refreshedAt > 86400000);
    } catch (error) {
      if (request === this.categoryRequest && !this.destroyRef.destroyed)
        this.categoryError.set(
          error instanceof Error ? error.message : 'Kategorien konnten nicht geladen werden.',
        );
    } finally {
      if (request === this.categoryRequest && !this.destroyRef.destroyed)
        this.categoryLoading.set(false);
    }
  }

  categoryChanged(id: number | null): void {
    if (this.saving()) return;
    this.form.controls.catalogId.setValue(id);
    this.form.markAsDirty();
  }

  brandSearchChanged(term: string): void {
    this.brandTerm.set(term);
    clearTimeout(this.searchTimer);
    this.brandRequest += 1;
    this.brandResults.set([]);
    this.brandError.set(null);
    this.brandLoading.set(false);
    if (term.trim().length < 2) return;
    this.brandLoading.set(true);
    this.searchTimer = setTimeout(() => void this.searchBrands(), 250);
  }

  async searchBrands(): Promise<void> {
    const keyword = this.brandTerm().trim();
    if (keyword.length < 2) return;
    const request = ++this.brandRequest;
    this.brandLoading.set(true);
    this.brandError.set(null);
    try {
      const brands = await this.brandApi.search(keyword);
      if (request === this.brandRequest && !this.destroyRef.destroyed)
        this.brandResults.set(brands);
    } catch (error) {
      if (request === this.brandRequest && !this.destroyRef.destroyed)
        this.brandError.set(error instanceof Error ? error.message : 'Markensuche fehlgeschlagen.');
    } finally {
      if (request === this.brandRequest && !this.destroyRef.destroyed) this.brandLoading.set(false);
    }
  }

  addBrand(option: SearchMultiSelectOption): void {
    if (this.saving()) return;
    const brand = this.brandResults().find((entry) => entry.id === option.value);
    if (!brand || this.brands().some((entry) => entry.id === brand.id)) return;
    if (this.brands().length >= 10) {
      this.error.set('Bitte höchstens zehn Marken auswählen.');
      return;
    }
    this.brands.update((values) => [...values, brand]);
    this.form.markAsDirty();
    this.error.set(null);
  }
  removeBrand(id: number): void {
    if (this.saving()) return;
    this.brands.update((values) => values.filter((brand) => brand.id !== id));
    this.form.markAsDirty();
  }
  keywordKeydown(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.addKeyword();
  }
  addKeyword(): boolean {
    if (this.saving()) return false;
    const keyword = normalizeFilterKeyword(this.form.controls.keywordEntry.value);
    if (!keyword) return true;
    if ([...keyword].length > 80 || !/[\p{L}\p{N}]/u.test(keyword)) {
      this.error.set('Ein Titelbegriff braucht 1 bis 80 Zeichen und Buchstaben oder Zahlen.');
      return false;
    }
    if (!this.keywords().includes(keyword)) {
      if (this.keywords().length >= 10) {
        this.error.set('Bitte höchstens zehn Titelbegriffe angeben.');
        return false;
      }
      this.keywords.update((values) => [...values, keyword]);
    }
    this.form.controls.keywordEntry.setValue('');
    this.form.markAsDirty();
    this.error.set(null);
    return true;
  }
  removeKeyword(keyword: string): void {
    if (this.saving()) return;
    this.keywords.update((values) => values.filter((value) => value !== keyword));
    this.form.markAsDirty();
  }

  editKeyword(keyword: string): void {
    if (this.saving() || !this.addKeyword()) return;
    this.removeKeyword(keyword);
    this.form.controls.keywordEntry.setValue(keyword);
    this.element.nativeElement.querySelector<HTMLInputElement>('#sniper-keyword-entry')?.focus();
  }

  applyTitleSuggestion(id: 'puffer' | 'cable'): void {
    if (this.saving()) return;
    const suggestion = this.titleSuggestions.find((entry) => entry.id === id)!;
    const next = [...new Set([...this.keywords(), ...suggestion.terms])];
    if (next.length > 10) {
      this.error.set('Bitte höchstens zehn Titelbegriffe angeben. Entferne zuerst einen Begriff.');
      return;
    }
    if (!this.keywords().length) this.form.controls.keywordMode.setValue('any');
    this.keywords.set(next);
    this.form.markAsDirty();
    this.error.set(null);
  }

  excludedKeywordKeydown(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.addExcludedKeyword();
  }

  addExcludedKeyword(): boolean {
    if (this.saving()) return false;
    const keyword = normalizeFilterKeyword(this.form.controls.excludedKeywordEntry.value);
    if (!keyword) return true;
    if ([...keyword].length > 80 || !/[\p{L}\p{N}]/u.test(keyword)) {
      this.error.set('Ein Ausschlussbegriff braucht 1 bis 80 Zeichen und Buchstaben oder Zahlen.');
      return false;
    }
    if (!this.excludedKeywords().includes(keyword)) {
      if (this.excludedKeywords().length >= 10) {
        this.error.set('Bitte höchstens zehn Ausschlussbegriffe angeben.');
        return false;
      }
      this.excludedKeywords.update((values) => [...values, keyword]);
    }
    this.form.controls.excludedKeywordEntry.setValue('');
    this.form.markAsDirty();
    this.error.set(null);
    return true;
  }

  removeExcludedKeyword(keyword: string): void {
    if (this.saving()) return;
    this.excludedKeywords.update((values) => values.filter((value) => value !== keyword));
    this.form.markAsDirty();
  }

  editExcludedKeyword(keyword: string): void {
    if (this.saving() || !this.addExcludedKeyword()) return;
    this.removeExcludedKeyword(keyword);
    this.form.controls.excludedKeywordEntry.setValue(keyword);
    this.element.nativeElement.querySelector<HTMLInputElement>('#sniper-excluded-entry')?.focus();
  }

  submit(): void {
    if (this.saving() || !this.addKeyword() || !this.addExcludedKeyword()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const invalid = (['title', 'priceFrom', 'priceTo', 'intervalSeconds', 'notes'] as const).find(
      (field) => this.fieldError(field),
    );
    if (invalid) {
      const ids = {
        title: 'sniper-title',
        priceFrom: 'sniper-price-from',
        priceTo: 'sniper-price-to',
        intervalSeconds: 'sniper-interval',
        notes: 'sniper-notes',
      };
      this.element.nativeElement.querySelector<HTMLElement>('#' + ids[invalid])?.focus();
      return;
    }
    if (this.categoryMissing()) {
      this.error.set(
        'Die ausgewählte Kategorie ist nicht verfügbar. Bitte lade die Kategorien erneut oder wähle ausdrücklich einen anderen Bereich.',
      );
      return;
    }
    const values = this.form.getRawValue();
    const draft: QueryDraft = {
      id: this.editing(),
      title: values.title,
      brandId: this.brands().length === 1 ? this.brands()[0]!.id : null,
      catalogId: values.catalogId,
      brands: [...this.brands()],
      titleKeywords: [...this.keywords()],
      excludedTitleKeywords: [...this.excludedKeywords()],
      keywordMode: values.keywordMode,
      intervalSeconds: values.intervalSeconds,
      notes: values.notes,
      revision: this.query()?.filter_revision ?? (this.query() ? 1 : null),
      searchText: values.searchText || null,
      priceFrom: values.priceFrom,
      priceTo: values.priceTo,
    };
    const error = queryDraftError(draft);
    this.error.set(error);
    if (!error) this.saved.emit(draft);
  }
}
