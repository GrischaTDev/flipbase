import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideX } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import {
  SearchMultiSelectComponent,
  SearchMultiSelectOption,
} from '../../../../shared/components/search-multi-select/search-multi-select.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { QueryDraft, queryDraftError } from '../../models/sniper-query.model';
import { VintedBrand } from '../../models/vinted-brand.model';
import { VintedBrandSearchService } from '../../services/vinted-brand-search.service';

@Component({
  selector: 'app-sniper-brand-create',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    NumberInputComponent,
    SearchMultiSelectComponent,
    TextFieldComponent,
  ],
  templateUrl: './sniper-brand-create.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SniperBrandCreateComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly brandSearch = inject(VintedBrandSearchService);
  private searchTimer?: ReturnType<typeof setTimeout>;
  private searchRequest = 0;

  readonly existingBrandIds = input.required<readonly number[]>();
  readonly saving = input(false);
  readonly saveError = input<string | null>(null);
  readonly saved = output<QueryDraft[]>();
  readonly cancelled = output<void>();
  readonly keyword = signal('');
  readonly results = signal<VintedBrand[]>([]);
  readonly selected = signal<VintedBrand[]>([]);
  readonly loading = signal(false);
  readonly searchError = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly available = computed(() => {
    const taken = new Set([
      ...this.existingBrandIds(),
      ...this.selected().map((brand) => brand.id),
    ]);
    return this.results().filter((brand) => !taken.has(brand.id));
  });
  readonly availableOptions = computed<SearchMultiSelectOption[]>(() =>
    this.available().map((brand) => ({ value: brand.id, label: brand.name })),
  );
  readonly removeIcon = LucideX;
  readonly form = new FormGroup({
    intervalSeconds: new FormControl(20, { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    afterNextRender(() => {
      this.element.nativeElement.querySelector<HTMLButtonElement>('#vinted-brand-picker')?.focus();
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.searchTimer);
      this.searchRequest += 1;
    });
  }

  pickerOpened(): void {
    if (!this.loading() && !this.results().length && !this.searchError())
      void this.searchBrands(this.keyword().trim());
  }

  hasUnsavedChanges(): boolean {
    return (
      this.selected().length > 0 ||
      this.form.controls.intervalSeconds.dirty ||
      this.form.controls.notes.dirty
    );
  }

  searchChanged(value: string): void {
    this.keyword.set(value);
    this.searchError.set(null);
    clearTimeout(this.searchTimer);
    this.searchRequest += 1;
    this.results.set([]);
    if (value.trim().length < 2) {
      this.loading.set(!value.trim());
      if (!value.trim()) this.searchTimer = setTimeout(() => void this.searchBrands(''), 250);
      return;
    }
    this.loading.set(true);
    this.searchTimer = setTimeout(() => void this.searchBrands(value.trim()), 250);
  }

  async searchBrands(keyword: string): Promise<void> {
    const request = ++this.searchRequest;
    this.loading.set(true);
    this.searchError.set(null);
    try {
      const brands = await this.brandSearch.search(keyword);
      if (request !== this.searchRequest || this.destroyRef.destroyed) return;
      this.results.set(brands);
    } catch (error) {
      if (request !== this.searchRequest || this.destroyRef.destroyed) return;
      this.results.set([]);
      this.searchError.set(error instanceof Error ? error.message : 'Markensuche fehlgeschlagen.');
    } finally {
      if (request === this.searchRequest && !this.destroyRef.destroyed) this.loading.set(false);
    }
  }

  add(brand: VintedBrand): void {
    if (
      this.existingBrandIds().includes(brand.id) ||
      this.selected().some((b) => b.id === brand.id)
    )
      return;
    this.selected.update((brands) => [...brands, brand]);
    this.error.set(null);
  }

  addOption(option: SearchMultiSelectOption): void {
    const brand = this.results().find((entry) => entry.id === option.value);
    if (brand) this.add(brand);
  }

  remove(id: number): void {
    this.selected.update((brands) => brands.filter((brand) => brand.id !== id));
  }

  removeSaved(ids: readonly number[]): void {
    const saved = new Set(ids);
    this.selected.update((brands) => brands.filter((brand) => !saved.has(brand.id)));
  }

  submit(): void {
    if (this.saving()) return;
    const selected = this.selected();
    if (!selected.length) {
      this.error.set('Bitte mindestens eine Marke auswählen.');
      return;
    }
    const values = this.form.getRawValue();
    const drafts = selected.map((brand) => ({
      id: null,
      title: brand.name.slice(0, 100),
      brandId: brand.id,
      intervalSeconds: values.intervalSeconds,
      notes: values.notes,
    }));
    const error = drafts.map(queryDraftError).find(Boolean) ?? null;
    this.error.set(error);
    if (!error) this.saved.emit(drafts);
  }
}
