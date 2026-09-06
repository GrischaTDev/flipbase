import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideColumns3, LucideDynamicIcon } from '@lucide/angular';
import { TableColumnOption } from '../../../core/models/table-preferences';

let nextPickerId = 0;
@Component({
  selector: 'app-table-column-picker',
  imports: [LucideDynamicIcon],
  templateUrl: './table-column-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block',
    '(document:click)': 'onOutsideClick($event)',
    '(keydown.escape)': 'close($event)',
    '(window:resize)': 'onViewportChange()',
    '(window:scroll)': 'onViewportChange()',
  },
})
export class TableColumnPickerComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLFieldSetElement>>('panel');
  readonly definitions = input.required<readonly TableColumnOption[]>();
  readonly selected = input.required<readonly string[]>();
  readonly saveError = input<string | null>(null);
  readonly selectedChange = output<readonly string[]>();
  readonly isOpen = signal(false);
  readonly panelPosition = signal({ top: 8, left: 8 });
  readonly panelPlacement = signal<'above' | 'below'>('below');
  readonly panelId = `table-columns-${++nextPickerId}`;
  readonly headingId = `${this.panelId}-heading`;
  readonly columnsIcon = LucideColumns3;

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
            this.panel()?.nativeElement.querySelector<HTMLInputElement>('input')?.focus();
          },
        },
        { injector: this.injector },
      );
    }
  }

  showAll(): void {
    this.selectedChange.emit(this.definitions().map((column) => column.id));
  }

  toggleColumn(column: TableColumnOption): void {
    if (column.required) return;
    const selected = new Set(this.selected());
    if (selected.has(column.id)) selected.delete(column.id);
    else selected.add(column.id);
    this.selectedChange.emit(
      this.definitions()
        .filter((value) => value.required || selected.has(value.id))
        .map((value) => value.id),
    );
  }
  close(event: Event): void {
    if (!this.isOpen()) return;
    event.stopPropagation();
    this.isOpen.set(false);
    this.trigger()?.nativeElement.focus();
  }

  onViewportChange(): void {
    if (this.isOpen()) this.positionPanel();
  }

  private positionPanel(): void {
    const trigger = this.trigger()?.nativeElement;
    const panel = this.panel()?.nativeElement;
    if (!trigger || !panel) return;

    const triggerBox = trigger.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const edge = 8;
    const gap = 8;
    const width = panelBox.width || 288;
    const height = panelBox.height || 320;
    const belowTop = triggerBox.bottom + gap;
    const aboveTop = triggerBox.top - height - gap;
    const top =
      belowTop + height <= viewportHeight - edge || aboveTop < edge
        ? Math.min(belowTop, viewportHeight - height - edge)
        : aboveTop;
    const placement =
      belowTop + height <= viewportHeight - edge || aboveTop < edge ? 'below' : 'above';
    const left = Math.min(
      Math.max(edge, triggerBox.right - width),
      Math.max(edge, viewportWidth - width - edge),
    );

    this.panelPosition.set({ top: Math.max(edge, top), left });
    this.panelPlacement.set(placement);
  }
  onOutsideClick(event: Event): void {
    if (event.target instanceof Node && !this.element.nativeElement.contains(event.target)) {
      this.close(event);
    }
  }
}
