import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TableColumnOption } from '../../../core/models/table-preferences';

let nextPickerId = 0;
@Component({
  selector: 'app-table-column-picker',
  templateUrl: './table-column-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block',
    '(document:click)': 'onOutsideClick($event)',
    '(keydown.escape)': 'close($event)',
  },
})
export class TableColumnPickerComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  readonly definitions = input.required<readonly TableColumnOption[]>();
  readonly selected = input.required<readonly string[]>();
  readonly saveError = input<string | null>(null);
  readonly selectedChange = output<readonly string[]>();
  readonly isOpen = signal(false);
  readonly panelId = `table-columns-${++nextPickerId}`;

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
  onOutsideClick(event: Event): void {
    if (event.target instanceof Node && !this.element.nativeElement.contains(event.target))
      this.isOpen.set(false);
  }
}
