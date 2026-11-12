import { FormFieldComponent } from '../form-field/form-field.component';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  LOCALE_ID,
  model,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  NG_VALIDATORS,
  ReactiveFormsModule,
  ValidationErrors,
  Validator,
} from '@angular/forms';

let nextUniqueId = 0;

/**
 * Einheitliches Zahlenfeld ohne sichtbare Hoch-/Runter-Schaltflächen.
 *
 * Der Eingabetext bleibt sprachabhängig und auch bei unfertigen Dezimalen erhalten.
 * Formular und Signal-Aufrufer erhalten weiterhin ausschließlich Zahlen oder null.
 */
@Component({
  selector: 'app-number-input',
  imports: [FormFieldComponent, ReactiveFormsModule],
  templateUrl: './number-input.component.html',
  host: {
    class: 'block',
    '[attr.id]': 'null',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NumberInputComponent),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => NumberInputComponent),
      multi: true,
    },
  ],
})
export class NumberInputComponent implements ControlValueAccessor, Validator {
  readonly locale = inject(LOCALE_ID);
  private readonly decimalSeparator =
    new Intl.NumberFormat(this.locale).formatToParts(1.1).find((part) => part.type === 'decimal')
      ?.value ?? '.';
  readonly label = input('');
  readonly helpText = input('');
  readonly error = input<string | null>(null);
  readonly value = model<number | null>(null);

  // Canonical English Inputs
  readonly placeholder = input<string>('');
  readonly step = input<number>(1);
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly unit = input<string>('');
  readonly id = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly ariaDescribedby = input<string>('');
  readonly ariaInvalid = input<boolean | string | null>(null);
  readonly asCurrency = input<boolean>(false);
  readonly inputControl = new FormControl('', { nonNullable: true });
  readonly disabled = input<boolean>(false);
  /** Kompatibilität für bestehende Aufrufer; visuelle Stepper werden nicht mehr gerendert. */
  readonly showStepper = input(false);

  // Backward-compatible German Inputs (legacy aliases)
  readonly platzhalter = input<string>('');
  readonly schritt = input<number | null>(null);
  readonly minimum = input<number | null>(null);
  readonly maximum = input<number | null>(null);
  readonly einheit = input<string>('');
  readonly feldId = input<string>('');
  readonly beschriftung = input<string>('');
  readonly alsBetrag = input<boolean>(false);

  readonly isAccessorDisabled = signal<boolean>(false);

  private readonly generatedId = `fb-num-${++nextUniqueId}`;

  // Effective unified properties
  readonly effectiveId = computed(() => this.id() || this.feldId() || this.generatedId);
  readonly effectivePlaceholder = computed(() => this.placeholder() || this.platzhalter());
  readonly effectiveStep = computed(() => this.schritt() ?? this.step());
  readonly effectiveMin = computed(() => this.min() ?? this.minimum());
  readonly effectiveMax = computed(() => this.max() ?? this.maximum());
  readonly effectiveUnit = computed(() => this.unit() || this.einheit());
  readonly effectiveAriaLabel = computed(() => this.ariaLabel() || this.beschriftung());
  readonly effectiveAsCurrency = computed(() => this.asCurrency() || this.alsBetrag());
  readonly effectiveDisabled = computed(() => this.disabled() || this.isAccessorDisabled());

  readonly isAtMin = computed(() => {
    const minVal = this.effectiveMin();
    return minVal !== null && (this.value() ?? 0) <= minVal;
  });

  readonly isAtMax = computed(() => {
    const maxVal = this.effectiveMax();
    return maxVal !== null && (this.value() ?? 0) >= maxVal;
  });

  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private onValidatorChange: () => void = () => undefined;

  constructor() {
    this.inputControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((text) => {
      const amount = this.parseAmount(text);
      this.onChange(amount);
      this.value.set(amount);
    });
    effect(() => {
      const amount = this.value();
      // Numerisch gleiche Rückmeldungen dürfen Eingabetext und Cursor nicht ersetzen.
      if (this.parseAmount(this.inputControl.value) !== amount) {
        this.inputControl.setValue(this.formatAmount(amount), { emitEvent: false });
      }
    });
    effect(() => {
      if (this.effectiveDisabled()) {
        this.inputControl.disable({ emitEvent: false });
      } else {
        this.inputControl.enable({ emitEvent: false });
      }
    });
    effect(() => {
      this.effectiveMin();
      this.effectiveMax();
      this.onValidatorChange();
    });
  }

  writeValue(val: number | null): void {
    this.inputControl.setValue(this.formatAmount(val), { emitEvent: false });
    this.value.set(val);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isAccessorDisabled.set(isDisabled);
  }

  validate(_control: AbstractControl): ValidationErrors | null {
    const amount = this.parseAmount(this.inputControl.value);
    if (amount === null) return this.inputControl.value.trim() ? { number: true } : null;
    const minimum = this.effectiveMin();
    const maximum = this.effectiveMax();
    if (minimum !== null && amount < minimum) return { min: { min: minimum, actual: amount } };
    if (maximum !== null && amount > maximum) return { max: { max: maximum, actual: amount } };
    return null;
  }

  registerOnValidatorChange(onChange: () => void): void {
    this.onValidatorChange = onChange;
  }

  handleInput(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || (event instanceof InputEvent && event.isComposing))
      return;
    const normalized = input.value.replace(/[.,]/g, this.decimalSeparator);
    if (normalized === input.value) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const direction = input.selectionDirection;
    this.inputControl.setValue(normalized, { emitEvent: false });
    input.setSelectionRange(start, end, direction ?? undefined);
  }

  handleKeydown(event: KeyboardEvent): void {
    if (
      this.effectiveDisabled() ||
      event.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    )
      return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    if (event.key === 'ArrowUp') this.increment();
    else this.decrement();
  }

  handleBlur(): void {
    this.onTouched();
  }

  increment(): void {
    this.setValue(this.clamp((this.value() ?? 0) + this.effectiveStep()));
  }

  decrement(): void {
    this.setValue(this.clamp((this.value() ?? 0) - this.effectiveStep()));
  }

  // Legacy method aliases
  zaehleHoch(): void {
    this.increment();
  }

  zaehleRunter(): void {
    this.decrement();
  }

  onVerlassen(): void {
    this.handleBlur();
  }

  private clamp(val: number): number {
    const stepVal = this.effectiveStep();
    const decimalPlaces = (String(stepVal).split('.')[1] || '').length;
    let result = Number(val.toFixed(decimalPlaces));
    const minVal = this.effectiveMin();
    const maxVal = this.effectiveMax();
    if (minVal !== null) result = Math.max(minVal, result);
    if (maxVal !== null) result = Math.min(maxVal, result);
    return result;
  }

  private setValue(val: number | null): void {
    this.inputControl.setValue(this.formatAmount(val));
  }

  private parseAmount(text: string): number | null {
    const normalized = text.trim().replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
  }

  private formatAmount(amount: number | null): string {
    return amount === null || !Number.isFinite(amount)
      ? ''
      : String(amount).replace('.', this.decimalSeparator);
  }
}
