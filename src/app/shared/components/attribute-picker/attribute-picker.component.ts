import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  forwardRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideCheck, LucideDynamicIcon, LucideX } from '@lucide/angular';

const VIEWPORT_MARGIN = 8;
const PANEL_GAP = 6;
let nextAttributePickerId = 0;

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('de');
}

/** Einzel- oder Mehrfachauswahl aus Vorschlägen mit eigener Bezeichnung. */
@Component({
  selector: 'app-attribute-picker',
  imports: [LucideDynamicIcon],
  templateUrl: './attribute-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AttributePickerComponent),
      multi: true,
    },
  ],
  host: { class: 'block w-full', '(document:click)': 'onDocumentClick($event)' },
})
export class AttributePickerComponent implements ControlValueAccessor {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly fieldContainer = viewChild<ElementRef<HTMLElement>>('fieldContainer');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly instanceId = ++nextAttributePickerId;
  protected readonly supportsPopover = typeof HTMLElement.prototype.showPopover === 'function';
  protected readonly panelPosition = signal({ left: 0, top: 0, width: 240 });
  protected readonly checkIcon = LucideCheck;
  protected readonly removeIcon = LucideX;

  readonly label = input.required<string>();
  readonly options = input.required<readonly string[]>();
  readonly swatches = input<Readonly<Record<string, string>>>({});
  readonly multiple = input(false);
  readonly placeholder = input('Suchen oder eingeben');
  readonly id = input('');
  readonly fieldId = computed(() => this.id() || `attribute-picker-${this.instanceId}`);
  readonly listboxId = computed(() => `${this.fieldId()}-listbox`);
  readonly value = signal('');
  readonly query = signal('');
  readonly isEditing = signal(false);
  readonly isOpen = signal(false);
  readonly isDisabled = signal(false);
  readonly activeIndex = signal(0);
  readonly selected = computed(() => {
    const value = this.value().trim();
    if (!value) return [];
    if (!this.multiple()) return [value];
    // Kommas in bereits gespeicherten freien Bezeichnungen bleiben unverändert.
    return value.split(' · ').filter(Boolean);
  });
  readonly matches = computed(() => {
    const query = this.isEditing() ? normalized(this.query()) : '';
    return this.options().filter((option) => (query ? normalized(option).includes(query) : true));
  });
  readonly customValue = computed(() => {
    if (!this.isEditing()) return null;
    const query = this.query().trim();
    if (!query || (this.multiple() && query.includes(' · '))) return null;
    return this.options().some((option) => normalized(option) === normalized(query)) ? null : query;
  });
  readonly activeDescendantId = computed(() =>
    this.isOpen() && this.activeIndex() < this.matches().length + (this.customValue() ? 1 : 0)
      ? `${this.listboxId()}-${this.activeIndex()}`
      : null,
  );

  swatchStyle(name: string): string | null {
    const color = this.swatches()[name];
    return color ? `background: ${color};` : null;
  }

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    const updateOnViewportChange = (event: Event) => {
      if (this.panel()?.nativeElement.contains(event.target as Node)) return;
      if (this.isOpen()) this.positionPanel();
    };
    document.addEventListener('scroll', updateOnViewportChange, true);
    window.addEventListener('resize', updateOnViewportChange);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', updateOnViewportChange, true);
      window.removeEventListener('resize', updateOnViewportChange);
    });
  }

  writeValue(value: unknown): void {
    this.value.set(typeof value === 'string' ? value : '');
    if (!this.multiple()) this.query.set(this.value());
    this.isEditing.set(false);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.isDisabled.set(disabled);
    if (disabled) this.close(false);
  }

  open(): void {
    if (this.isDisabled() || this.isOpen()) return;
    this.isEditing.set(false);
    this.isOpen.set(true);
    this.activeIndex.set(0);
    afterNextRender(() => this.positionPanel(), { injector: this.injector });
  }

  close(restoreFocus = true): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.onTouched();
    if (!this.multiple()) this.query.set(this.value());
    else this.query.set('');
    this.isEditing.set(false);
    if (restoreFocus) queueMicrotask(() => this.field()?.nativeElement.focus());
  }

  onInput(event: Event): void {
    this.open();
    this.query.set((event.target as HTMLInputElement).value);
    this.isEditing.set(true);
    this.activeIndex.set(0);
  }

  choose(option: string): void {
    const value = option.trim();
    if (!value || this.isDisabled()) return;
    if (this.multiple()) {
      const selected = this.selected();
      if (!selected.some((item) => normalized(item) === normalized(value)))
        this.setValue([...selected, value].join(' · '));
      this.query.set('');
      this.isEditing.set(false);
      this.open();
      this.field()?.nativeElement.focus();
    } else {
      this.setValue(value);
      this.query.set(value);
      this.isEditing.set(false);
      this.field()?.nativeElement.focus();
    }
  }

  remove(option: string): void {
    if (this.isDisabled()) return;
    this.setValue(
      this.selected()
        .filter((item) => item !== option)
        .join(' · '),
    );
    this.field()?.nativeElement.focus();
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.matches().length + (this.customValue() ? 1 : 0);
    if (event.key === 'Escape' && this.isOpen()) {
      event.preventDefault();
      this.close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.open();
      this.activeIndex.set(Math.min(this.activeIndex() + 1, Math.max(count - 1, 0)));
    } else if (event.key === 'ArrowUp' && this.isOpen()) {
      event.preventDefault();
      this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
    } else if (event.key === 'Enter' && this.isOpen() && count) {
      event.preventDefault();
      this.choose(this.matches()[this.activeIndex()] ?? this.customValue() ?? '');
    } else if (event.key === 'Tab') {
      this.close(false);
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.element.nativeElement.contains(event.target as Node))
      this.close(false);
  }

  onPanelWheel(event: WheelEvent): void {
    const list = this.list()?.nativeElement;
    if (!list || !list.contains(event.target as Node)) {
      event.preventDefault();
      return;
    }
    const atTop = list.scrollTop <= 0 && event.deltaY < 0;
    const atBottom =
      list.scrollTop + list.clientHeight >= list.scrollHeight - 1 && event.deltaY > 0;
    if (atTop || atBottom) event.preventDefault();
  }

  private setValue(value: string): void {
    this.value.set(value);
    this.onChange(value);
    this.onTouched();
  }

  private positionPanel(): void {
    const panel = this.panel()?.nativeElement;
    const field = this.fieldContainer()?.nativeElement;
    if (!this.isOpen() || !panel || !field || !this.supportsPopover) return;
    if (!panel.matches(':popover-open')) panel.showPopover();
    const rect = field.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - VIEWPORT_MARGIN * 2);
    const height = panel.offsetHeight;
    const below = rect.bottom + PANEL_GAP;
    const above = rect.top - PANEL_GAP - height;
    this.panelPosition.set({
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
      ),
      top:
        below + height > window.innerHeight - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN
          ? above
          : below,
      width,
    });
  }
}
