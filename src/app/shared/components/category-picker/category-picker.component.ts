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
import {
  LucideChevronDown,
  LucideChevronLeft,
  LucideChevronRight,
  LucideDynamicIcon,
  LucideX,
} from '@lucide/angular';
import { ProductCategory, categoryPathParts } from '../../../core/models/product-category.models';
import { ProductCategoryService } from '../../../core/services/product-category.service';

type PickerStatus = 'idle' | 'loading' | 'ready' | 'error';

const SEARCH_DEBOUNCE_MS = 200;
const MIN_SEARCH_LENGTH = 2;
const PANEL_MIN_WIDTH = 320;
const VIEWPORT_MARGIN = 8;
const PANEL_GAP = 6;

let nextCategoryPickerId = 0;

/**
 * Auswahl einer Shopify-Kategorie. Ebenen mit Unterkategorien werden per Klick
 * geöffnet; die Oberkategorie selbst wählt man über die Kopfzeile. So gibt es keine
 * verschachtelten Schaltflächen in der Liste.
 */
@Component({
  selector: 'app-category-picker',
  imports: [LucideDynamicIcon],
  templateUrl: './category-picker.component.html',
  styleUrl: './category-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CategoryPickerComponent),
      multi: true,
    },
  ],
  host: { class: 'block w-full', '(document:click)': 'onDocumentClick($event)' },
})
export class CategoryPickerComponent implements ControlValueAccessor {
  private readonly categories = inject(ProductCategoryService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly instanceId = ++nextCategoryPickerId;
  protected readonly supportsPopover = typeof HTMLElement.prototype.showPopover === 'function';
  protected readonly panelPosition = signal({ left: 0, top: 0, width: PANEL_MIN_WIDTH });

  readonly label = input('Kategorie');
  readonly labelHidden = input(false);
  readonly placeholder = input('Kategorie wählen');
  readonly suggestion = input<string | null>(null);
  readonly helpText = input('');
  readonly id = input('');

  readonly value = signal<string | null>(null);
  readonly selected = signal<ProductCategory | null>(null);
  readonly isOpen = signal(false);
  readonly isDisabled = signal(false);
  readonly status = signal<PickerStatus>('idle');
  readonly searchTerm = signal('');
  readonly trail = signal<readonly ProductCategory[]>([]);
  readonly entries = signal<readonly ProductCategory[]>([]);
  readonly hasMore = signal(false);
  readonly activeIndex = signal(-1);

  readonly fieldId = computed(() => this.id() || `category-picker-${this.instanceId}`);
  readonly listboxId = computed(() => `${this.fieldId()}-listbox`);
  readonly isSearching = computed(() => this.searchTerm().trim().length >= MIN_SEARCH_LENGTH);
  readonly currentParent = computed(() => this.trail().at(-1) ?? null);
  readonly selectedPath = computed(() => {
    const category = this.selected();
    return category ? categoryPathParts(category.fullName).join(' › ') : '';
  });
  readonly parentPath = computed(() => {
    const parent = this.currentParent();
    return parent ? categoryPathParts(parent.fullName).join(' › ') : '';
  });
  readonly activeDescendantId = computed(() => {
    const index = this.activeIndex();
    return this.isOpen() && this.status() === 'ready' && index >= 0 && index < this.entries().length
      ? this.optionId(index)
      : null;
  });

  protected readonly chevronDownIcon = LucideChevronDown;
  protected readonly chevronLeftIcon = LucideChevronLeft;
  protected readonly chevronRightIcon = LucideChevronRight;
  protected readonly clearIcon = LucideX;

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private requestToken = 0;
  private valueToken = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const closeOnViewportChange = (event: Event) => {
      if (this.panel()?.nativeElement.contains(event.target as Node)) return;
      if (this.isOpen()) this.close(false);
    };
    document.addEventListener('scroll', closeOnViewportChange, true);
    window.addEventListener('resize', closeOnViewportChange);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', closeOnViewportChange, true);
      window.removeEventListener('resize', closeOnViewportChange);
      this.clearSearchTimer();
    });
  }

  writeValue(value: unknown): void {
    const id = typeof value === 'string' && value ? value : null;
    const token = ++this.valueToken;
    this.value.set(id);
    if (!id) {
      this.selected.set(null);
      return;
    }
    if (this.selected()?.id === id) return;
    this.selected.set(null);
    this.categories.getById(id).then(
      (category) => {
        if (token === this.valueToken) this.selected.set(category);
      },
      () => {
        if (token === this.valueToken) this.selected.set(null);
      },
    );
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
    if (isDisabled) this.close(false);
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open();
  }

  open(): void {
    if (this.isDisabled() || this.isOpen()) return;
    this.isOpen.set(true);
    this.onTouched();
    const suggestion = this.suggestion()?.trim() ?? '';
    this.searchTerm.set(suggestion);
    if (suggestion.length >= MIN_SEARCH_LENGTH) void this.runSearch(suggestion);
    else void this.showLevel(this.trail());
    afterNextRender(() => this.positionPanel(), { injector: this.injector });
  }

  close(restoreFocus = true): void {
    if (!this.isOpen()) return;
    this.clearSearchTimer();
    this.requestToken++;
    this.isOpen.set(false);
    this.activeIndex.set(-1);
    if (!restoreFocus) return;
    const trigger = this.trigger()?.nativeElement;
    queueMicrotask(() => trigger?.focus());
  }

  clear(): void {
    if (this.isDisabled()) return;
    this.valueToken++;
    this.value.set(null);
    this.selected.set(null);
    this.onChange(null);
    this.onTouched();
    const trigger = this.trigger()?.nativeElement;
    queueMicrotask(() => trigger?.focus());
  }

  select(category: ProductCategory): void {
    this.valueToken++;
    this.value.set(category.id);
    this.selected.set(category);
    this.onChange(category.id);
    this.close();
  }

  activate(category: ProductCategory): void {
    if (!this.isSearching() && !category.isLeaf) void this.showLevel([...this.trail(), category]);
    else this.select(category);
  }

  back(): void {
    if (this.isSearching() || this.trail().length === 0) return;
    void this.showLevel(this.trail().slice(0, -1));
    const search = this.searchInput()?.nativeElement;
    queueMicrotask(() => search?.focus());
  }

  retry(): void {
    if (this.isSearching()) void this.runSearch(this.searchTerm());
    else void this.showLevel(this.trail());
  }

  onSearchInput(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.searchTerm.set(term);
    this.clearSearchTimer();
    if (term.trim().length < MIN_SEARCH_LENGTH) {
      void this.showLevel(this.trail());
      return;
    }
    this.status.set('loading');
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      void this.runSearch(term);
    }, SEARCH_DEBOUNCE_MS);
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.open();
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const active = this.entries()[this.activeIndex()];
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveActive(-1);
        break;
      case 'Enter':
        event.preventDefault();
        if (active && this.status() === 'ready') this.activate(active);
        break;
      case 'ArrowRight':
        if (!this.isSearching() && active && !active.isLeaf) {
          event.preventDefault();
          void this.showLevel([...this.trail(), active]);
        }
        break;
      case 'ArrowLeft':
        if (!this.searchTerm() && this.trail().length > 0) {
          event.preventDefault();
          this.back();
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'Tab':
        this.close(false);
        break;
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.elementRef.nativeElement.contains(event.target as Node))
      this.close(false);
  }

  optionId(index: number): string {
    return `${this.listboxId()}-option-${index}`;
  }

  displayPath(category: ProductCategory): string {
    return categoryPathParts(category.fullName).join(' › ');
  }

  private moveActive(step: number): void {
    const count = this.entries().length;
    if (count === 0 || this.status() !== 'ready') return;
    const next = Math.min(Math.max(this.activeIndex() + step, 0), count - 1);
    this.activeIndex.set(next);
    afterNextRender(
      () => document.getElementById(this.optionId(next))?.scrollIntoView?.({ block: 'nearest' }),
      { injector: this.injector },
    );
  }

  private async showLevel(trail: readonly ProductCategory[]): Promise<void> {
    const token = ++this.requestToken;
    this.trail.set(trail);
    this.hasMore.set(false);
    this.status.set('loading');
    try {
      const entries = await this.categories.loadChildren(trail.at(-1)?.id ?? null);
      if (token !== this.requestToken) return;
      this.entries.set(entries);
      this.activeIndex.set(entries.length ? 0 : -1);
      this.status.set('ready');
    } catch {
      if (token !== this.requestToken) return;
      this.entries.set([]);
      this.activeIndex.set(-1);
      this.status.set('error');
    }
  }

  private async runSearch(term: string): Promise<void> {
    const token = ++this.requestToken;
    this.status.set('loading');
    try {
      const result = await this.categories.search(term);
      if (token !== this.requestToken) return;
      this.entries.set(result.categories);
      this.hasMore.set(result.hasMore);
      this.activeIndex.set(result.categories.length ? 0 : -1);
      this.status.set('ready');
    } catch {
      if (token !== this.requestToken) return;
      this.entries.set([]);
      this.hasMore.set(false);
      this.activeIndex.set(-1);
      this.status.set('error');
    }
  }

  private positionPanel(): void {
    const panel = this.panel()?.nativeElement;
    const trigger = this.trigger()?.nativeElement;
    if (!this.isOpen() || !panel || !trigger) return;
    if (this.supportsPopover) {
      // Die oberste Ebene entkommt dem Überlauf von Dialogen und Karten.
      panel.showPopover();
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(
        Math.max(rect.width, PANEL_MIN_WIDTH),
        window.innerWidth - VIEWPORT_MARGIN * 2,
      );
      const height = panel.offsetHeight;
      const below = rect.bottom + PANEL_GAP;
      const above = rect.top - PANEL_GAP - height;
      const top =
        below + height > window.innerHeight - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN
          ? above
          : below;
      this.panelPosition.set({
        left: Math.max(
          VIEWPORT_MARGIN,
          Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
        ),
        top,
        width,
      });
    }
    this.searchInput()?.nativeElement.focus();
  }

  private clearSearchTimer(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = null;
  }
}
