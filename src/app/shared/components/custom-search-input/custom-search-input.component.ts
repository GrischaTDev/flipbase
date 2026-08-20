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
import { LucideAngularModule, Search, X } from 'lucide-angular';

@Component({
  selector: 'app-custom-search-input',
  imports: [LucideAngularModule],
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
  readonly disabledInput = input<boolean>(false, { alias: 'disabled' });
  readonly clearable = input<boolean>(true);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly id = input<string>('');
  readonly ariaLabel = input<string>('Suche');

  readonly search = output<string>();
  readonly clear = output<void>();

  readonly isDisabled = signal<boolean>(false);

  readonly searchIcon = Search;
  readonly xIcon = X;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  readonly effectiveDisabled = computed(
    () => this.disabledInput() || this.isDisabled()
  );

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
    this.search.emit(val);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.search.emit(this.value());
    } else if (event.key === 'Escape' && this.clearable() && this.value()) {
      this.onClear();
    }
  }

  onClear(): void {
    if (this.effectiveDisabled()) return;
    this.value.set('');
    this.onChange('');
    this.clear.emit();
    this.search.emit('');
    this.inputElement()?.nativeElement.focus();
  }

  onBlur(): void {
    this.onTouched();
  }
}
