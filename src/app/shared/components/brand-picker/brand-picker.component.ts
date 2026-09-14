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
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideDynamicIcon, LucidePlus, LucideX } from '@lucide/angular';
import { Brand } from '../../../core/models/product-category.models';
import { BrandService } from '../../../core/services/brand.service';

const VIEWPORT_MARGIN = 8;
const PANEL_GAP = 6;

let nextBrandPickerId = 0;

/** Auswahl einer Marke des Workspace; unbekannte Marken lassen sich direkt anlegen. */
@Component({
  selector: 'app-brand-picker',
  imports: [LucideDynamicIcon],
  templateUrl: './brand-picker.component.html',
  styleUrl: './brand-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => BrandPickerComponent),
      multi: true,
    },
  ],
  host: { class: 'block w-full', '(document:click)': 'onDocumentClick($event)' },
})
export class BrandPickerComponent implements ControlValueAccessor {
  protected readonly brandService = inject(BrandService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fieldElement = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly instanceId = ++nextBrandPickerId;
  protected readonly supportsPopover = typeof HTMLElement.prototype.showPopover === 'function';
  protected readonly panelPosition = signal({ left: 0, top: 0, width: 240 });

  readonly label = input('Marke');
  readonly labelHidden = input(false);
  readonly placeholder = input('Marke suchen oder anlegen');
  readonly suggestion = input<string | null>(null);
  readonly helpText = input('');
  readonly id = input('');

  readonly value = signal<string | null>(null);
  readonly query = signal('');
  readonly isOpen = signal(false);
  readonly isDisabled = signal(false);
  readonly activeIndex = signal(-1);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);

  readonly fieldId = computed(() => this.id() || `brand-picker-${this.instanceId}`);
  readonly listboxId = computed(() => `${this.fieldId()}-listbox`);
  readonly matches = computed(() => this.brandService.search(this.query()));
  readonly trimmedQuery = computed(() => this.query().trim());
  readonly canCreate = computed(
    () => !!this.trimmedQuery() && !this.brandService.findByName(this.trimmedQuery()),
  );
  readonly optionCount = computed(() => this.matches().length + (this.canCreate() ? 1 : 0));
  readonly createIndex = computed(() => (this.canCreate() ? this.matches().length : -1));
  readonly showPendingHint = computed(
    () => !this.isOpen() && !!this.trimmedQuery() && !this.value() && !this.createError(),
  );
  readonly activeDescendantId = computed(() => {
    const index = this.activeIndex();
    return this.isOpen() && index >= 0 && index < this.optionCount() ? this.optionId(index) : null;
  });

  protected readonly clearIcon = LucideX;
  protected readonly plusIcon = LucidePlus;

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private valueToken = 0;

  constructor() {
    effect(() => {
      const suggestion = this.suggestion()?.trim();
      if (suggestion) untracked(() => void this.applySuggestion(suggestion));
    });
    const closeOnViewportChange = (event: Event) => {
      if (this.panel()?.nativeElement.contains(event.target as Node)) return;
      if (this.isOpen()) this.close();
    };
    document.addEventListener('scroll', closeOnViewportChange, true);
    window.addEventListener('resize', closeOnViewportChange);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', closeOnViewportChange, true);
      window.removeEventListener('resize', closeOnViewportChange);
    });
  }

  writeValue(value: unknown): void {
    const id = typeof value === 'string' && value ? value : null;
    const token = ++this.valueToken;
    this.value.set(id);
    this.createError.set(null);
    if (!id) {
      this.query.set('');
      return;
    }
    const known = this.brandService.findById(id);
    if (known) {
      this.query.set(known.name);
      return;
    }
    void this.brandService.ensureLoaded().then(() => {
      if (token === this.valueToken) this.query.set(this.brandService.findById(id)?.name ?? '');
    });
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
    if (isDisabled) this.close();
  }

  onFocus(): void {
    void this.brandService.ensureLoaded();
  }

  onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.createError.set(null);
    if (this.value()) {
      this.valueToken++;
      this.value.set(null);
      this.onChange(null);
    }
    this.openList();
  }

  openList(): void {
    if (this.isDisabled()) return;
    void this.brandService.ensureLoaded();
    if (!this.isOpen()) {
      this.isOpen.set(true);
      afterNextRender(() => this.positionPanel(), { injector: this.injector });
    }
    this.activeIndex.set(this.optionCount() > 0 ? 0 : -1);
  }

  close(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.activeIndex.set(-1);
    this.onTouched();
  }

  choose(brand: Brand): void {
    this.valueToken++;
    this.value.set(brand.id);
    this.query.set(brand.name);
    this.createError.set(null);
    this.onChange(brand.id);
    this.close();
  }

  async createFromQuery(): Promise<void> {
    const name = this.trimmedQuery();
    if (!name || this.creating()) return;
    this.creating.set(true);
    this.createError.set(null);
    const result = await this.brandService.create(name);
    this.creating.set(false);
    if (result.error || !result.data) {
      this.createError.set(result.error?.message ?? 'Die Marke konnte nicht angelegt werden.');
      this.close();
      return;
    }
    this.choose(result.data);
  }

  activateIndex(index: number): void {
    if (index === this.createIndex()) void this.createFromQuery();
    else {
      const brand = this.matches()[index];
      if (brand) this.choose(brand);
    }
  }

  clear(): void {
    if (this.isDisabled()) return;
    this.valueToken++;
    this.value.set(null);
    this.query.set('');
    this.createError.set(null);
    this.onChange(null);
    this.onTouched();
    const field = this.fieldElement()?.nativeElement;
    queueMicrotask(() => field?.focus());
  }

  retryLoad(): void {
    void this.brandService.reload();
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.optionCount();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen()) this.openList();
        else if (count) this.activeIndex.set(Math.min(this.activeIndex() + 1, count - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
        break;
      case 'Enter':
        if (this.isOpen() && this.activeIndex() >= 0) {
          event.preventDefault();
          this.activateIndex(this.activeIndex());
        }
        break;
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          this.close();
        }
        break;
      case 'Tab':
        if (this.isOpen()) this.close();
        else this.onTouched();
        break;
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.elementRef.nativeElement.contains(event.target as Node))
      this.close();
  }

  optionId(index: number): string {
    return `${this.listboxId()}-option-${index}`;
  }

  private async applySuggestion(suggestion: string): Promise<void> {
    if (this.value() || this.query().trim()) return;
    await this.brandService.ensureLoaded();
    if (this.value() || this.query().trim()) return;
    const match = this.brandService.findByName(suggestion);
    if (match) this.choose(match);
    else this.query.set(suggestion);
  }

  private positionPanel(): void {
    const panel = this.panel()?.nativeElement;
    const field = this.fieldElement()?.nativeElement;
    if (!this.isOpen() || !panel || !field || !this.supportsPopover) return;
    panel.showPopover();
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
