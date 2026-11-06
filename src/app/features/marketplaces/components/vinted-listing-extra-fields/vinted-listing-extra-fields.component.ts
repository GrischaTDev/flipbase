import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormRecord, ReactiveFormsModule } from '@angular/forms';
import { AttributePickerComponent } from '../../../../shared/components/attribute-picker/attribute-picker.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import type { VintedListingExtraField } from '../../models/vinted-listing-catalog-fields';

type ChoiceField = Extract<VintedListingExtraField, { kind: 'choice' }>;
type TextField = Extract<VintedListingExtraField, { kind: 'text' }>;
const separator = ' · ';

/**
 * Zusatzfelder einer Vinted-Kategorie wie Rocklänge, Plattform oder Maße. Auswahlfelder liefern
 * Vinteds Kennungen, freie Felder Text; Pflicht ist nur, was Vinted verlangt.
 */
@Component({
  selector: 'app-vinted-listing-extra-fields',
  templateUrl: './vinted-listing-extra-fields.component.html',
  imports: [
    ReactiveFormsModule,
    CustomSelectComponent,
    AttributePickerComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class VintedListingExtraFieldsComponent {
  readonly fields = input.required<readonly VintedListingExtraField[]>();
  /** Aktuelle Inseratangaben (`attributes`). */
  readonly attributes = input.required<Readonly<Record<string, string>>>();
  readonly errors = input<Readonly<Record<string, string>>>({});
  readonly disabled = input(false);
  /** Alle Zusatzangaben dieser Kategorie; leere Werte heißen „nicht angegeben“. */
  readonly changed = output<Readonly<Record<string, string>>>();
  readonly form = new FormRecord<FormControl<string>>({});
  readonly choiceFields = computed(() =>
    this.fields().filter((field): field is ChoiceField => field.kind === 'choice'),
  );
  readonly textFields = computed(() =>
    this.fields().filter((field): field is TextField => field.kind === 'text'),
  );

  constructor() {
    effect(() => {
      const fields = this.fields();
      const attributes = this.attributes();
      untracked(() => this.sync(fields, attributes));
    });
    effect(() => {
      if (this.disabled()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.changed.emit(this.values()));
  }

  control(key: string): FormControl<string> {
    return this.form.controls[key] ?? new FormControl('', { nonNullable: true });
  }

  options(field: ChoiceField): readonly SelectOption<string>[] {
    const options = field.options.map((option) => ({
      value: String(option.id),
      label: option.label,
    }));
    return field.required ? options : [{ value: '', label: 'Nicht angegeben' }, ...options];
  }

  labels(field: ChoiceField): readonly string[] {
    return field.options.map((option) => option.label);
  }

  private sync(
    fields: readonly VintedListingExtraField[],
    attributes: Readonly<Record<string, string>>,
  ): void {
    for (const key of Object.keys(this.form.controls))
      if (!fields.some((field) => field.key === key))
        this.form.removeControl(key, { emitEvent: false });
    for (const field of fields) {
      const value = this.display(field, attributes[field.key] ?? '');
      const control = this.form.controls[field.key];
      if (!control)
        this.form.addControl(field.key, new FormControl(value, { nonNullable: true }), {
          emitEvent: false,
        });
      else if (control.value !== value) control.setValue(value, { emitEvent: false });
    }
  }

  /** Gespeicherter Wert → Anzeige: Mehrfachauswahl als Bezeichnungen, sonst unverändert. */
  private display(field: VintedListingExtraField, stored: string): string {
    if (field.kind !== 'choice' || !field.multiple) return stored;
    return stored
      .split(',')
      .flatMap((id) => field.options.find((option) => String(option.id) === id)?.label ?? [])
      .join(separator);
  }

  private values(): Readonly<Record<string, string>> {
    const values: Record<string, string> = {};
    for (const field of this.fields()) {
      const raw = this.control(field.key).value ?? '';
      if (field.kind === 'text') values[field.key] = raw.trim();
      else if (!field.multiple) values[field.key] = raw;
      else
        values[field.key] = raw
          .split(separator)
          .flatMap((label) => field.options.find((option) => option.label === label)?.id ?? [])
          .join(',');
    }
    return values;
  }
}
