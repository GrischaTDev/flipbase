import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideCheck, LucideChevronDown, LucideDynamicIcon } from '@lucide/angular';
import { ButtonComponent } from '../button/button.component';
import { CustomSearchInputComponent } from '../custom-search-input/custom-search-input.component';

export interface SearchMultiSelectOption {
  value: string | number;
  label: string;
}

const PANEL_MIN_WIDTH = 320;
const VIEWPORT_MARGIN = 8;
let nextSearchMultiSelectId = 0;

@Component({
  selector: 'app-search-multi-select',
  imports: [ButtonComponent, LucideDynamicIcon, CustomSearchInputComponent],
  templateUrl: './search-multi-select.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full', '(document:click)': 'onDocumentClick($event)' },
})
export class SearchMultiSelectComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly searchInput = viewChild(CustomSearchInputComponent);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly instanceId = ++nextSearchMultiSelectId;

  protected readonly supportsPopover = typeof HTMLElement.prototype.showPopover === 'function';
  protected readonly chevronIcon = LucideChevronDown;
  protected readonly checkIcon = LucideCheck;
  protected readonly panelPosition = signal({ left: 0, top: 0, width: PANEL_MIN_WIDTH });

  readonly controlId = input('');
  readonly label = input.required<string>();
  readonly placeholder = input('Auswählen');
  readonly searchPlaceholder = input('Suchen');
  readonly maxLength = input(100);
  readonly helpText = input('');
  readonly emptyText = input('Keine Treffer gefunden.');
  readonly options = input.required<readonly SearchMultiSelectOption[]>();
  readonly selectedCount = input(0);
  readonly singularLabel = input('Eintrag');
  readonly pluralLabel = input('Einträge');
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly disabled = input(false);

  readonly opened = output<void>();
  readonly searchTermChange = output<string>();
  readonly optionSelected = output<SearchMultiSelectOption>();
  readonly retry = output<void>();

  readonly isOpen = signal(false);
  readonly searchTerm = signal('');
  readonly activeIndex = signal(-1);
  readonly fieldId = computed(() => this.controlId() || `search-multi-select-${this.instanceId}`);
  readonly listboxId = computed(() => `${this.fieldId()}-listbox`);
  readonly activeDescendantId = computed(() => {
    const index = this.activeIndex();
    return this.isOpen() && index >= 0 && index < this.options().length
      ? `${this.listboxId()}-option-${index}`
      : null;
  });
  readonly valueLabel = computed(() => {
    const count = this.selectedCount();
    return count === 0
      ? this.placeholder()
      : `${count} ${count === 1 ? this.singularLabel() : this.pluralLabel()} ausgewählt`;
  });

  private readonly closeWhenDisabled = effect(() => {
    if (this.disabled() && this.isOpen()) this.close(false);
  });

  constructor() {
    const onPointerDown = (event: PointerEvent) => {
      if (this.isOpen() && !this.element.nativeElement.contains(event.target as Node))
        this.close(false);
    };
    const onScroll = (event: Event) => {
      if (this.panel()?.nativeElement.contains(event.target as Node)) return;
      if (this.isOpen()) this.close(false);
    };
    const onResize = () => {
      if (this.isOpen()) this.positionPanel(false);
    };
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onResize);
    });
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open();
  }

  open(): void {
    if (this.disabled() || this.isOpen()) return;
    this.isOpen.set(true);
    this.activeIndex.set(-1);
    this.opened.emit();
    afterNextRender(() => this.positionPanel(), { injector: this.injector });
  }

  close(restoreFocus = true): void {
    if (!this.isOpen()) return;
    const panel = this.panel()?.nativeElement;
    if (this.supportsPopover && panel?.matches(':popover-open')) panel.hidePopover();
    this.isOpen.set(false);
    this.activeIndex.set(-1);
    if (restoreFocus) queueMicrotask(() => this.trigger()?.nativeElement.focus());
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.element.nativeElement.contains(event.target as Node))
      this.close(false);
  }

  onSearchChanged(term: string): void {
    this.searchTerm.set(term);
    this.activeIndex.set(-1);
    this.searchTermChange.emit(term);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const options = this.options();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (this.loading() || this.error()) break;
        this.activeIndex.set(Math.min(this.activeIndex() + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.loading() || this.error()) break;
        this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        const option = options[this.activeIndex()];
        if (option && !this.loading() && !this.error()) {
          this.select(option);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close();
        break;
    }
  }

  select(option: SearchMultiSelectOption): void {
    if (this.disabled() || this.loading()) return;
    this.optionSelected.emit(option);
    this.activeIndex.set(-1);
    queueMicrotask(() => this.searchInput()?.inputElement()?.nativeElement.focus());
  }

  onPopoverToggle(event: Event): void {
    if (
      event.target === this.panel()?.nativeElement &&
      (event as ToggleEvent).newState === 'closed'
    )
      this.close(false);
  }

  onPanelEscape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.close();
  }

  onPanelFocusOut(event: FocusEvent): void {
    if (!this.panel()?.nativeElement.contains(event.relatedTarget as Node | null))
      this.close(false);
  }

  private positionPanel(focusSearch = true): void {
    const panel = this.panel()?.nativeElement;
    const trigger = this.trigger()?.nativeElement;
    if (!this.isOpen() || !panel || !trigger) return;
    if (this.supportsPopover) {
      if (!panel.matches(':popover-open')) panel.showPopover();
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(
        Math.max(rect.width, PANEL_MIN_WIDTH),
        window.innerWidth - VIEWPORT_MARGIN * 2,
      );
      this.panelPosition.set({
        left: Math.max(
          VIEWPORT_MARGIN,
          Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
        ),
        top: Math.max(
          VIEWPORT_MARGIN,
          Math.min(rect.top, window.innerHeight - panel.offsetHeight - VIEWPORT_MARGIN),
        ),
        width,
      });
    }
    if (focusSearch) this.searchInput()?.inputElement()?.nativeElement.focus();
  }
}
