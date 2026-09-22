import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  model,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideDynamicIcon, LucideMinus as Minus, LucidePlus as Plus } from '@lucide/angular';

let nextUniqueId = 0;

/**
 * Zahlenfeld mit eigenen Schaltflaechen zum Hoch- und Runterzaehlen.
 *
 * Die Pfeilchen, die der Browser an ein `input[type=number]` haengt, zeichnet
 * er selbst. In einer einheitlichen Oberflaeche fallen sie auf.
 * Sie sind deshalb ausgeblendet (siehe styles.css), und diese Komponente
 * uebernimmt ihre Aufgabe im Design der Anwendung.
 */
@Component({
  selector: 'app-number-input',
  imports: [LucideDynamicIcon],
  templateUrl: './number-input.component.html',
  styleUrl: './number-input.component.scss',
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
  ],
})
export class NumberInputComponent implements ControlValueAccessor {
  readonly value = model<number | null>(null);

  // Canonical English Inputs
  readonly placeholder = input<string>('');
  readonly step = input<number>(1);
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly unit = input<string>('');
  readonly id = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly asCurrency = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly showStepper = input(true);

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

  writeValue(val: number | null): void {
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

  handleInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.setValue(raw === '' ? null : Number(raw));
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

  onEingabe(event: Event): void {
    this.handleInput(event);
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
    this.onChange(val);
    this.value.set(val);
  }

  protected readonly plusIcon = Plus;
  protected readonly minusIcon = Minus;
}
