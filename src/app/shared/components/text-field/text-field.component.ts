import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideCircleAlert, LucideDynamicIcon, LucideIconInput, LucideX } from '@lucide/angular';

let nextUniqueId = 0;

export type TextFieldType = 'text' | 'email' | 'password' | 'search' | 'url' | 'tel';

@Component({
  selector: 'app-text-field',
  imports: [LucideDynamicIcon],
  templateUrl: './text-field.component.html',
  styleUrl: './text-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextFieldComponent),
      multi: true,
    },
  ],
  host: {
    class: 'block w-full',
  },
})
export class TextFieldComponent implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly labelHidden = input<boolean>(false);
  readonly placeholder = input<string>('');
  readonly type = input<TextFieldType>('text');
  readonly multiline = input<boolean | number>(false);
  readonly prefix = input<string>('');
  readonly suffix = input<string>('');
  readonly prefixIcon = input<LucideIconInput | null>(null);
  readonly clearable = input<boolean>(false);
  readonly monospaced = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly helpText = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly id = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly autocomplete = input<string>('off');

  readonly cleared = output<void>();

  readonly value = signal<string>('');
  readonly isAccessorDisabled = signal<boolean>(false);

  protected readonly clearIcon = LucideX;
  protected readonly errorIcon = LucideCircleAlert;

  private readonly generatedId = `fb-field-${++nextUniqueId}`;
  readonly fieldId = computed(() => this.id() || this.generatedId);
  readonly effectiveDisabled = computed(() => this.disabled() || this.isAccessorDisabled());

  protected readonly isTextarea = computed(() => Boolean(this.multiline()));
  protected readonly textareaRows = computed(() => {
    const multi = this.multiline();
    return typeof multi === 'number' ? multi : 3;
  });

  protected readonly inputClasses = computed(() => {
    const base =
      'linear-input w-full rounded-md text-[13px] py-2 px-3 transition-colors outline-none ' +
      'disabled:cursor-not-allowed disabled:opacity-40';

    const mono = this.monospaced() ? 'font-mono' : '';
    const err = this.error()
      ? 'border-rose-500/70 focus:border-rose-500 focus:ring-rose-500/30 text-rose-300'
      : '';

    const pl = this.prefixIcon() ? 'pl-9' : this.prefix() ? 'pl-7' : '';
    const pr = this.clearable() || this.suffix() ? 'pr-8' : '';

    return [base, mono, err, pl, pr].filter(Boolean).join(' ');
  });

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(obj: unknown): void {
    this.value.set(obj != null ? String(obj) : '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isAccessorDisabled.set(isDisabled);
  }

  protected handleInput(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    this.value.set(target.value);
    this.onChange(target.value);
  }

  protected handleBlur(): void {
    this.onTouched();
  }

  protected handleClear(): void {
    this.value.set('');
    this.onChange('');
    this.cleared.emit();
  }
}
