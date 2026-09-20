import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  LucideDynamicIcon,
  LucideIconInput,
  LucideChevronDown as ChevronDown,
  LucideCheck as Check,
} from '@lucide/angular';

export interface SelectOption<T = string> {
  value: T;
  label: string;
  badgeClass?: string;
  colorClass?: string;
  icon?: LucideIconInput;
  description?: string;
}

let nextCustomSelectId = 0;

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
    /*
      Ohne dieses `block` ist das eigene Element ein Inline-Element und damit
      nur so breit wie sein Inhalt - das `w-full` im Inneren bezieht sich dann
      auf genau diese Breite und bewirkt nichts. Die Felder schrumpfen auf die
      Laenge des laengsten Eintrags zusammen.
    */
    class: 'block',
    '(document:click)': 'onDocumentClick($event)',
    '[class.relative]': 'true',
    '[class.z-50]': 'isOpen()',
  },
})
export class CustomSelectComponent<T = string> implements ControlValueAccessor {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly destroyRef = inject(DestroyRef);
  private readonly instanceId = ++nextCustomSelectId;
  protected readonly supportsPopover = typeof HTMLElement.prototype.showPopover === 'function';
  protected readonly panelPosition = signal({ left: 0, top: 0, width: 160, maxHeight: 240 });

  readonly options = input.required<readonly SelectOption<T>[]>();
  readonly value = model<T | null>(null);
  readonly placeholder = input<string>('Bitte wählen...');
  readonly variant = input<'default' | 'pill' | 'filter' | 'toolbar'>('default');
  readonly size = input<'sm' | 'md'>('md');
  readonly disabled = input<boolean>(false);
  readonly widthClass = input<string>('w-full');
  readonly openDirection = input<'auto' | 'down' | 'up'>('auto');
  readonly ariaLabel = input.required<string>();
  readonly triggerId = input<string>('');
  readonly actionLabel = input<string | null>(null);
  readonly required = input(false);
  readonly action = output<void>();

  /**
   * Innenabstand je Groesse.
   *
   * `sm` traegt genau die Masse der uebrigen Eingabefelder
   * (`px-2.5 py-1.5 text-xs`), damit in einer Formularzeile alle Felder
   * gleich hoch sind. Die Eingabe `size` gab es schon, ausgewertet wurde sie
   * nicht - die Auswahlfelder waren dadurch hoeher als ihre Nachbarn.
   */
  readonly groessenKlasse = computed(() =>
    this.size() === 'sm' ? 'min-h-9 px-2.5 py-1.5 text-[13px]' : 'min-h-10 px-3 py-2 text-[13px]',
  );

  readonly isOpen = signal<boolean>(false);
  readonly isDisabled = signal<boolean>(false);
  readonly isDropUp = signal<boolean>(false);
  readonly activeIndex = signal(-1);
  private readonly activeOption = signal<SelectOption<T> | null>(null);

  readonly resolvedTriggerId = computed(
    () => this.triggerId() || `custom-select-trigger-${this.instanceId}`,
  );
  readonly listboxId = computed(() => `${this.resolvedTriggerId()}-listbox`);
  readonly activeDescendantId = computed(() =>
    this.isOpen() && this.activeIndex() >= 0 && this.activeIndex() < this.options().length
      ? this.optionId(this.activeIndex())
      : null,
  );

  readonly chevronIcon = ChevronDown;
  readonly checkIcon = Check;

  private onChange: (value: T | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  readonly effectiveDisabled = computed(() => this.disabled() || this.isDisabled());

  private readonly closeWhenDisabled = effect(() => {
    if (this.effectiveDisabled() && this.isOpen()) this.closeDropdown(false);
  });

  private readonly reconcileActiveIndex = effect(() => {
    if (!this.isOpen()) return;
    const options = this.options();

    const currentIndex = this.activeIndex();
    if (options.length === 0) {
      if (currentIndex !== -1) this.setActiveIndex(-1);
      return;
    }

    const currentActiveOption = this.activeOption();
    const retainedIndex = currentActiveOption
      ? options.findIndex((option) => option.value === currentActiveOption.value)
      : -1;
    if (retainedIndex >= 0) {
      if (currentIndex !== retainedIndex) this.setActiveIndex(retainedIndex);
      return;
    }

    const selectedIndex = options.findIndex((option) => option.value === this.value());
    this.setActiveIndex(
      selectedIndex >= 0 ? selectedIndex : Math.min(Math.max(currentIndex, 0), options.length - 1),
    );
  });

  readonly selectedOption = computed(() => {
    const val = this.value();
    if (val === null || val === undefined) return null;
    return this.options().find((opt) => opt.value === val) || null;
  });

  constructor() {
    // Scrollen der Liste ist erlaubt; bei bewegtem Anker schließen, statt ein losgelöstes Menü zu zeigen.
    const onScroll = (event: Event) => {
      if (this.panel()?.nativeElement.contains(event.target as Node)) return;
      if (this.isOpen()) this.closeDropdown(false);
    };
    const onResize = () => {
      if (this.isOpen()) this.closeDropdown(false);
    };
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    });
  }

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
      event.preventDefault();
    }
    if (this.effectiveDisabled()) return;

    if (!this.isOpen()) this.openDropdown('selected');
    else this.closeDropdown();
  }

  openDropdown(initial: 'selected' | 'first' | 'last'): void {
    if (this.effectiveDisabled()) return;

    if (this.openDirection() === 'auto') {
      const rect = this.elementRef.nativeElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // If less than 240px below and there's enough space above, open upwards
      this.isDropUp.set(spaceBelow < 240 && rect.top > spaceBelow);
    } else {
      this.isDropUp.set(this.openDirection() === 'up');
    }

    const selectedIndex = this.options().findIndex((option) => option.value === this.value());
    const fallbackIndex = initial === 'last' ? this.options().length - 1 : 0;
    this.setActiveIndex(selectedIndex >= 0 ? selectedIndex : fallbackIndex);
    this.isOpen.set(true);
    this.onTouched();
    if (this.supportsPopover) {
      afterNextRender(
        () => {
          const panel = this.panel()?.nativeElement;
          if (!this.isOpen() || !panel) return;
          // Die native oberste Ebene entkommt Overflow und Transform der Modal-Vorfahren.
          panel.showPopover();
          const rect = this.trigger().nativeElement.getBoundingClientRect();
          const margin = 8;
          const gap = 6;
          const width = Math.min(Math.max(rect.width, 160), window.innerWidth - margin * 2);
          const available = this.isDropUp()
            ? rect.top - gap - margin
            : window.innerHeight - rect.bottom - gap - margin;
          const maxHeight = Math.max(0, Math.min(240, available));
          const height = Math.min(panel.offsetHeight, maxHeight);
          this.panelPosition.set({
            left: Math.max(
              margin,
              Math.min(
                this.variant() === 'pill' ? rect.right - width : rect.left,
                window.innerWidth - width - margin,
              ),
            ),
            top: this.isDropUp() ? Math.max(margin, rect.top - gap - height) : rect.bottom + gap,
            width,
            maxHeight,
          });
          this.scrollActiveOptionIntoViewAfterRender();
        },
        { injector: this.injector },
      );
    }
  }

  closeDropdown(restoreFocus = true): void {
    this.isOpen.set(false);
    this.clearActiveOption();
    if (!restoreFocus) return;

    const trigger = this.trigger().nativeElement;
    queueMicrotask(() => trigger.focus());
  }

  selectOption(option: SelectOption<T>, event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
    }
    if (this.effectiveDisabled()) return;

    this.value.set(option.value);
    this.onChange(option.value);
    this.closeDropdown();
  }

  triggerAction(): void {
    if (this.effectiveDisabled()) return;
    this.closeDropdown(false);
    this.action.emit();
  }

  setActiveIndex(index: number): void {
    const lastIndex = this.options().length - 1;
    const nextIndex = lastIndex < 0 ? -1 : Math.min(Math.max(index, 0), lastIndex);
    if (nextIndex < 0) {
      this.clearActiveOption();
      return;
    }

    this.activeIndex.set(nextIndex);
    this.activeOption.set(this.options()[nextIndex] ?? null);
    this.scrollActiveOptionIntoViewAfterRender();
  }

  onTriggerBlur(): void {
    this.onTouched();
  }

  selectActiveOption(): void {
    if (this.effectiveDisabled()) return;
    const option = this.options()[this.activeIndex()];
    if (option) this.selectOption(option);
  }

  optionId(index: number): string {
    return `${this.listboxId()}-option-${index}`;
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (this.effectiveDisabled()) return;

    if (event.key === 'Tab') {
      if (this.isOpen()) this.closeDropdown(false);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (this.isOpen()) this.selectActiveOption();
      else this.openDropdown('selected');
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.isOpen()) this.setActiveIndex(this.activeIndex() + 1);
      else this.openDropdown('first');
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.isOpen()) this.setActiveIndex(this.activeIndex() - 1);
      else this.openDropdown('last');
      return;
    }

    if (!this.isOpen()) return;

    if (event.key === 'Home') {
      event.preventDefault();
      this.setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      this.setActiveIndex(this.options().length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeDropdown();
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) return;
    const target = event.target as HTMLElement;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.closeDropdown(false);
    }
  }

  private scrollActiveOptionIntoViewAfterRender(): void {
    afterNextRender(
      {
        mixedReadWrite: () => {
          if (!this.isOpen()) return;
          const option =
            this.elementRef.nativeElement.querySelectorAll<HTMLElement>('[role="option"]')[
              this.activeIndex()
            ];
          option?.scrollIntoView?.({
            block: 'nearest',
          });
        },
      },
      { injector: this.injector },
    );
  }

  private clearActiveOption(): void {
    this.activeIndex.set(-1);
    this.activeOption.set(null);
  }
}
