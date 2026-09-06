import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  LucideArrowDown as ArrowDown,
  LucideArrowUp as ArrowUp,
  LucideArrowUpDown as ArrowUpDown,
  LucideDynamicIcon,
} from '@lucide/angular';
import { TableSortState } from '../../../core/models/table-preferences.models';

@Component({
  selector: 'app-table-sort-header',
  imports: [LucideDynamicIcon],
  templateUrl: './table-sort-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableSortHeaderComponent<TSortField extends string = string> {
  readonly label = input.required<string>();
  readonly sortField = input.required<TSortField>();
  readonly currentSort = input.required<TableSortState<TSortField>>();
  readonly description = input<string | null>(null);
  readonly align = input<'left' | 'center' | 'right'>('left');

  readonly sortChanged = output<TableSortState<TSortField>>();

  protected readonly isActive = computed(() => this.currentSort().field === this.sortField());
  protected readonly activeDirection = computed(() =>
    this.currentSort().direction === 'asc' ? ArrowUp : ArrowDown,
  );
  protected readonly inactiveDirection = ArrowUpDown;

  protected ariaSort(): 'ascending' | 'descending' | null {
    if (!this.isActive()) return null;
    return this.currentSort().direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sort(): void {
    const current = this.currentSort();
    const direction =
      current.field === this.sortField() && current.direction === 'asc' ? 'desc' : 'asc';
    this.sortChanged.emit({ field: this.sortField(), direction });
  }
}
