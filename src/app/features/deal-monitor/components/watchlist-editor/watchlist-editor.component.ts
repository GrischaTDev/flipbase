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
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { FeedCategory, Watchlist, WatchlistDraft } from '../../models/deal-monitor.model';

@Component({
  selector: 'app-watchlist-editor',
  imports: [
    ReactiveFormsModule,
    CardComponent,
    TextFieldComponent,
    NumberInputComponent,
    CustomSelectComponent,
    ButtonComponent,
  ],
  templateUrl: './watchlist-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistEditorComponent {
  readonly watchlist = input<Watchlist | null>(null);
  readonly categories = input<FeedCategory[]>([]);
  readonly saving = input(false);
  readonly saved = output<WatchlistDraft>();
  readonly cancelled = output<void>();
  readonly categorySearch = new FormControl('', { nonNullable: true });
  private readonly search = toSignal(this.categorySearch.valueChanges, { initialValue: '' });
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)],
    }),
    catalog_id: new FormControl<number | null>(null),
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
    discount_threshold_percent: new FormControl(40, {
      nonNullable: true,
      validators: [Validators.min(0.01), Validators.max(99.99)],
    }),
  });
  private readonly selectedCategory = toSignal(this.form.controls.catalog_id.valueChanges, {
    initialValue: null,
  });
  readonly categoryOptions = computed(() => {
    const term = this.search().toLocaleLowerCase('de');
    const matches = this.categories()
      .filter((c) => c.path.toLocaleLowerCase('de').includes(term))
      .slice(0, 30);
    const selected = this.categories().find((c) => c.id === this.selectedCategory());
    if (selected && !matches.some((c) => c.id === selected.id)) matches.unshift(selected);
    return [
      { value: null as number | null, label: 'Alle gesammelten Kategorien' },
      ...matches.map((c) => ({ value: c.id, label: c.path })),
    ];
  });
  readonly conditionOptions = [
    { value: '', label: 'Alle Zustände' },
    ...['Neu mit Etikett', 'Neu ohne Etikett', 'Sehr gut', 'Gut', 'Zufriedenstellend'].map(
      (value) => ({ value, label: value }),
    ),
  ];

  constructor() {
    effect(() => {
      const row = this.watchlist();
      this.form.reset({
        title: row?.title ?? '',
        catalog_id: row?.catalog_id ?? null,
        brand: row?.brand ?? '',
        search_text: row?.search_text ?? '',
        condition: row?.condition ?? '',
        price_from: row?.price_from ?? null,
        price_to: row?.price_to ?? null,
        discount_threshold_percent: row?.discount_threshold_percent ?? 40,
      });
    });
    afterNextRender(() =>
      this.element.nativeElement.querySelector<HTMLInputElement>('input')?.focus(),
    );
  }

  submit(): void {
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.saving() || this.form.invalid || !value.title.trim()) return;
    if (value.price_from !== null && value.price_to !== null && value.price_from > value.price_to) {
      this.form.setErrors({ priceRange: true });
      return;
    }
    this.saved.emit({
      ...value,
      id: this.watchlist()?.id ?? null,
      is_active: this.watchlist()?.is_active ?? true,
    });
  }
}
