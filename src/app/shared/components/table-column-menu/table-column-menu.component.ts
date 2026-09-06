import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  LucideDynamicIcon,
  LucideArrowUpDown as ArrowUpDown,
  LucideEye as Eye,
  LucideEyeOff as EyeOff,
  LucideGripVertical as GripVertical,
  LucideLock as Lock,
  LucideRotateCcw as RotateCcw,
  LucideColumns3 as Columns3,
  LucideArrowUp as ArrowUp,
  LucideArrowDown as ArrowDown,
  LucideChevronDown as ChevronDown,
} from '@lucide/angular';
import {
  ColumnDefinition,
  SortDirection,
  SortFieldOption,
  TableSortState,
} from '../../../core/models/table-preferences.models';

let nextMenuId = 0;

@Component({
  selector: 'app-table-column-menu',
  imports: [LucideDynamicIcon],
  templateUrl: './table-column-menu.component.html',
  styleUrl: './table-column-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative inline-block',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'onEscapePressed()',
    '(window:resize)': 'onViewportChange()',
    '(window:scroll)': 'onViewportChange()',
  },
})
export class TableColumnMenuComponent<
  TColumnId extends string = string,
  TSortField extends string = string,
> {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly triggerBtn = viewChild<ElementRef<HTMLButtonElement>>('triggerBtn');
  private readonly panel = viewChild<ElementRef<HTMLDivElement>>('panel');

  readonly panelId = `table-column-menu-${++nextMenuId}`;
  readonly headingId = `${this.panelId}-heading`;

  protected readonly icons = {
    columns: Columns3,
    sort: ArrowUpDown,
    eye: Eye,
    eyeOff: EyeOff,
    drag: GripVertical,
    lock: Lock,
    reset: RotateCcw,
    asc: ArrowUp,
    desc: ArrowDown,
    chevron: ChevronDown,
  };

  // Inputs
  readonly columns = input.required<readonly ColumnDefinition<TColumnId>[]>();
  readonly sortOptions = input.required<readonly SortFieldOption<TSortField>[]>();
  readonly currentSort = input.required<TableSortState<TSortField>>();

  // Outputs
  readonly columnVisibilityToggled = output<TColumnId>();
  readonly columnsReordered = output<{ previousIndex: number; currentIndex: number }>();
  readonly sortChanged = output<TableSortState<TSortField>>();
  readonly resetRequested = output<void>();

  // State
  readonly isOpen = signal<boolean>(false);
  readonly isSortMenuOpen = signal<boolean>(false);
  readonly panelPosition = signal({ top: 8, left: 8 });
  readonly panelPlacement = signal<'above' | 'below'>('below');
  readonly panelMaxHeight = signal(828);
  protected readonly draggedIndex = signal<number | null>(null);

  protected readonly sortedColumns = computed(() =>
    [...this.columns()].sort((a, b) => a.order - b.order),
  );

  protected readonly visibleCount = computed(
    () => this.columns().filter((col) => col.visible).length,
  );

  toggleOpen(): void {
    const nextIsOpen = !this.isOpen();
    this.isOpen.set(nextIsOpen);
    if (nextIsOpen) {
      afterNextRender(
        {
          mixedReadWrite: () => {
            this.positionPanel();
            if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
              window.requestAnimationFrame(() => this.positionPanel());
            }
            this.panel()?.nativeElement.querySelector<HTMLElement>('[data-popover-focus]')?.focus();
          },
        },
        { injector: this.injector },
      );
    }
  }

  close(): void {
    if (this.isOpen()) {
      this.isOpen.set(false);
      this.isSortMenuOpen.set(false);
      this.triggerBtn()?.nativeElement.focus();
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) return;
    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.close();
    }
  }

  onEscapePressed(): void {
    if (this.isSortMenuOpen()) {
      this.isSortMenuOpen.set(false);
      return;
    }
    this.close();
  }

  toggleSortMenu(): void {
    this.isSortMenuOpen.update((isOpen) => !isOpen);
    if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
      window.requestAnimationFrame(() => this.positionPanel());
    }
  }

  selectSortField(field: TSortField): void {
    this.sortChanged.emit({ field, direction: this.currentSort().direction });
    this.isSortMenuOpen.set(false);
  }

  onViewportChange(): void {
    if (this.isOpen()) this.positionPanel();
  }

  private positionPanel(): void {
    const trigger = this.triggerBtn()?.nativeElement;
    const panel = this.panel()?.nativeElement;
    if (!trigger || !panel) return;

    const triggerBox = trigger.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const edge = 8;
    const gap = 8;
    const width = panelBox.width || 320;
    const height = panelBox.height || 480;

    const belowTop = triggerBox.bottom + gap;
    const aboveTop = triggerBox.top - height - gap;
    const top =
      belowTop + height <= viewportHeight - edge || aboveTop < edge
        ? Math.min(belowTop, viewportHeight - height - edge)
        : aboveTop;
    const placement =
      belowTop + height <= viewportHeight - edge || aboveTop < edge ? 'below' : 'above';
    const rightAlignedLeft = triggerBox.right - width;
    const left = Math.min(
      Math.max(edge, rightAlignedLeft),
      Math.max(edge, viewportWidth - width - edge),
    );

    const safeTop = Math.max(edge, top);
    this.panelPosition.set({
      top: safeTop,
      left,
    });
    this.panelPlacement.set(placement);
    this.panelMaxHeight.set(Math.max(180, viewportHeight - safeTop - edge));
  }

  toggleSortDirection(): void {
    const nextDir: SortDirection = this.currentSort().direction === 'asc' ? 'desc' : 'asc';
    this.sortChanged.emit({
      field: this.currentSort().field,
      direction: nextDir,
    });
  }

  moveColumnKeyboard(index: number, direction: 'up' | 'down', event: Event): void {
    event.preventDefault();
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex >= 0 && targetIndex < this.sortedColumns().length) {
      this.columnsReordered.emit({ previousIndex: index, currentIndex: targetIndex });
    }
  }

  onDragStart(index: number): void {
    this.draggedIndex.set(index);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(targetIndex: number): void {
    const fromIndex = this.draggedIndex();
    if (fromIndex !== null && fromIndex !== targetIndex) {
      this.columnsReordered.emit({ previousIndex: fromIndex, currentIndex: targetIndex });
    }
    this.draggedIndex.set(null);
  }

  onDragEnd(): void {
    this.draggedIndex.set(null);
  }
}
