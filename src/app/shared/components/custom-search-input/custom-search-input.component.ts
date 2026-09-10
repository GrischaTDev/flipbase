import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-custom-search-input',
  templateUrl: './custom-search-input.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomSearchInputComponent),
      multi: true,
    },
  ],
  host: {
    class: 'block w-full',
  },
})
export class CustomSearchInputComponent implements ControlValueAccessor {
  readonly inputElement = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly value = model<string>('');
  readonly placeholder = input<string>('Suchen...');
  readonly disabled = input<boolean>(false);
  readonly clearable = input<boolean>(true);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly variant = input<'default' | 'toolbar'>('default');
  readonly id = input<string>('');
  readonly ariaLabel = input<string>('Suche');

  readonly searched = output<string>();
  readonly clear = output<void>();

  readonly isDisabled = signal<boolean>(false);

  protected readonly inputClasses = computed(() => {
    const sizeClasses = {
      sm: 'h-8 text-[13px]',
      md: 'h-9 text-[13px]',
      lg: 'h-11 text-sm',
    } as const;

    const variantClass =
      this.variant() === 'toolbar'
        ? 'w-full rounded-lg border border-transparent bg-transparent hover:bg-fb-subtle focus:bg-fb-surface focus:border-fb-primary focus:ring-1 focus:ring-fb-primary'
        : 'linear-input w-full rounded-md border-fb-border bg-fb-subtle focus:border-fb-primary focus:ring-2 focus:ring-fb-primary/20';

    return [
      variantClass,
      'font-medium',
      'placeholder-fb-text-dimmed text-fb-text-primary transition-colors',
      'focus:outline-none',
      sizeClasses[this.size()],
      'pl-9',
    ].join(' ');
  });

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  readonly effectiveDisabled = computed(() => this.disabled() || this.isDisabled());

  // ControlValueAccessor methods
  writeValue(obj: string | null): void {
    this.value.set(obj ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const val = target.value;
    this.value.set(val);
    this.onChange(val);
    this.searched.emit(val);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.searched.emit(this.value());
    } else if (event.key === 'Escape' && this.clearable() && this.value()) {
      this.onClear();
    }
  }

  onClear(): void {
    if (this.effectiveDisabled()) return;
    this.value.set('');
    this.onChange('');
    this.clear.emit();
    this.searched.emit('');
    this.inputElement()?.nativeElement.focus();
  }

  onBlur(): void {
    this.onTouched();
  }
}
