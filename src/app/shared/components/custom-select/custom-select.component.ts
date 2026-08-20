import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  LucideDynamicIcon,
  LucideChevronDown as ChevronDown,
  LucideCheck as Check,
} from '@lucide/angular';

export interface SelectOption<T = string> {
  value: T;
  label: string;
  badgeClass?: string;
  colorClass?: string;
  icon?: any;
  description?: string;
}

@Component({
  selector: 'app-custom-select',
  imports: [LucideDynamicIcon],
  templateUrl: './custom-select.component.html',
  styleUrl: './custom-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomSelectComponent),
      multi: true,
    },
  ],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeDropdown()',
    '[class.relative]': 'true',
    '[class.z-50]': 'isOpen()',
  },
})
export class CustomSelectComponent<T = string> implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef);

  readonly options = input.required<SelectOption<T>[]>();
  readonly value = model<T | null>(null);
  readonly placeholder = input<string>('Bitte wählen...');
  readonly variant = input<'default' | 'pill' | 'filter'>('default');
  readonly size = input<'sm' | 'md'>('md');
  readonly disabledInput = input<boolean>(false, { alias: 'disabled' });
  readonly widthClass = input<string>('w-full');
  readonly openDirection = input<'auto' | 'down' | 'up'>('auto');

  readonly isOpen = signal<boolean>(false);
  readonly isDisabled = signal<boolean>(false);
  readonly isDropUp = signal<boolean>(false);

  readonly chevronIcon = ChevronDown;
  readonly checkIcon = Check;

  private onChange: (value: T | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  readonly effectiveDisabled = computed(() => this.disabledInput() || this.isDisabled());

  readonly selectedOption = computed(() => {
    const val = this.value();
    if (val === null || val === undefined) return null;
    return this.options().find((opt) => opt.value === val) || null;
  });

  // ControlValueAccessor methods
  writeValue(obj: T | null): void {
    this.value.set(obj);
  }

  registerOnChange(fn: (value: T | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  toggleDropdown(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (this.effectiveDisabled()) return;

    if (!this.isOpen()) {
      if (this.openDirection() === 'auto') {
        const rect = this.elementRef.nativeElement.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        // If less than 240px below and there's enough space above, open upwards
        this.isDropUp.set(spaceBelow < 240 && rect.top > spaceBelow);
      } else {
        this.isDropUp.set(this.openDirection() === 'up');
      }
      this.isOpen.set(true);
      this.onTouched();
    } else {
      this.isOpen.set(false);
    }
  }

  closeDropdown(): void {
    this.isOpen.set(false);
  }

  selectOption(option: SelectOption<T>, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (this.effectiveDisabled()) return;

    this.value.set(option.value);
    this.onChange(option.value);
    this.closeDropdown();
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) return;
    const target = event.target as HTMLElement;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.closeDropdown();
    }
  }
}
