import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  input,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DecimalPipe } from '@angular/common';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import {
  QueryDraft,
  SniperQuery,
  parseVintedSearchUrl,
  queryDraftError,
} from '../../models/sniper-query.model';
import { VintedCategory } from '../../models/vinted-category.model';

@Component({
  selector: 'app-sniper-query-editor',
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    TextFieldComponent,
    NumberInputComponent,
    CustomSelectComponent,
    ButtonComponent,
    CardComponent,
  ],
  templateUrl: './sniper-query-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SniperQueryEditorComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly query = input<SniperQuery | null>(null);
  readonly categories = input.required<VintedCategory[]>();
  readonly saving = input(false);
  readonly plannedRate = input(0);
  readonly budget = input<number | null>(null);
  readonly saved = output<QueryDraft>();
  readonly cancelled = output<void>();
  readonly editing = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly categorySearch = new FormControl('', { nonNullable: true });
  readonly searchTerm = toSignal(this.categorySearch.valueChanges, { initialValue: '' });
  readonly searchUrl = new FormControl('', { nonNullable: true });
  readonly form = new FormGroup({
    searchText: new FormControl('', { nonNullable: true }),
    catalogId: new FormControl<number | null>(null),
    brandId: new FormControl<number | null>(null),
    priceFrom: new FormControl<number | null>(null),
    priceTo: new FormControl<number | null>(null),
    intervalSeconds: new FormControl(60, { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });
  private readonly values = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );
  private readonly previousRate = signal(0);
  readonly ownRate = computed(() => 60 / (this.values().intervalSeconds || 60));
  readonly totalRate = computed(() => this.plannedRate() - this.previousRate() + this.ownRate());
  readonly selectedCategory = computed(() =>
    this.categories().find((c) => c.id === this.values().catalogId),
  );
  readonly matches = computed(() => {
    const terms = this.searchTerm().toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
    return this.categories().filter((c) =>
      terms.every((term) => c.path.toLocaleLowerCase('de').includes(term)),
    );
  });
  readonly categoryOptions = computed(() => {
    const rows = this.matches().slice(0, 30);
    const selected = this.selectedCategory();
    if (selected && !rows.some((c) => c.id === selected.id)) rows.unshift(selected);
    return [
      { value: null as number | null, label: 'Ohne Kategorie (Suchbegriff erforderlich)' },
      ...rows.map((c) => ({ value: c.id, label: c.path })),
    ];
  });

  constructor() {
    afterNextRender(() =>
      this.element.nativeElement.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus(),
    );
    effect(() => {
      const query = this.query();
      if (query) this.edit(query);
    });
  }

  edit(query: SniperQuery): void {
    this.editing.set(query.id);
    this.previousRate.set(query.is_active ? 60_000 / query.poll_interval_ms : 0);
    this.form.reset({
      searchText: query.search_text ?? '',
      catalogId: query.catalog_id,
      brandId: query.brand_id,
      priceFrom: query.price_from,
      priceTo: query.price_to,
      intervalSeconds: query.poll_interval_ms / 1000,
      notes: query.notes ?? '',
    });
    this.lockFilters();
  }

  private lockFilters(): void {
    for (const key of ['searchText', 'catalogId', 'brandId', 'priceFrom', 'priceTo'] as const)
      this.form.controls[key].disable();
  }

  importUrl(): void {
    try {
      const values = parseVintedSearchUrl(this.searchUrl.value.trim());
      if (values.catalogId && !this.categories().some((c) => c.id === values.catalogId))
        throw new Error(
          'Bitte im Vinted-Suchlink eine konkrete Unterkategorie wählen, die in der gespeicherten Kategorieliste vorhanden ist.',
        );
      this.form.patchValue(values);
      this.form.markAsDirty();
      this.categorySearch.setValue('');
      this.error.set(null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Der Suchlink ist ungültig.');
    }
  }

  submit(): void {
    if (this.saving()) return;
    const draft = { id: this.editing(), ...this.form.getRawValue() };
    const error = queryDraftError(draft);
    this.error.set(error);
    if (!error) this.saved.emit(draft);
  }
}
