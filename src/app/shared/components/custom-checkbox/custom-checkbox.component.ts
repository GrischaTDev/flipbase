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

@Component({
  selector: 'app-custom-checkbox',
  imports: [],
  templateUrl: './custom-checkbox.component.html',
  styleUrl: './custom-checkbox.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomCheckboxComponent),
      multi: true,
    },
  ],
  host: {
    '[class.inline-flex]': 'true',
    '[class.items-center]': 'true',
    '[class.opacity-40]': 'effectiveDisabled()',
  },
})
export class CustomCheckboxComponent implements ControlValueAccessor {
  readonly checked = model<boolean>(false);
  readonly indeterminate = input<boolean>(false);
  readonly label = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly color = input<'emerald' | 'indigo' | 'brand'>('brand');
  readonly ariaLabel = input<string>('');
  readonly id = input<string>('');

  readonly isDisabled = signal<boolean>(false);

  private onChange: (value: boolean) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  readonly effectiveDisabled = computed(() => this.disabled() || this.isDisabled());

  // ControlValueAccessor methods
  writeValue(obj: boolean | null): void {
    this.checked.set(Boolean(obj));
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  toggle(event?: MouseEvent | KeyboardEvent): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (this.effectiveDisabled()) return;

    const newValue = !this.checked();
    this.checked.set(newValue);
    this.onChange(newValue);
    this.onTouched();
  }

  onBlur(): void {
    this.onTouched();
  }
}
