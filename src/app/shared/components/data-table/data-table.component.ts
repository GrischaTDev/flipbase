import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  ColumnDefinition,
  SortFieldOption,
  TableSortState,
} from '../../../core/models/table-preferences.models';
import { CustomSearchInputComponent } from '../custom-search-input/custom-search-input.component';
import { TableColumnMenuComponent } from '../table-column-menu/table-column-menu.component';

@Component({
  selector: 'app-data-table',
  imports: [CustomSearchInputComponent, TableColumnMenuComponent],
  templateUrl: './data-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DataTableComponent<
  TColumnId extends string = string,
  TSortField extends string = string,
> {
  readonly ariaLabel = input('Datentabelle');
  readonly searchValue = input('');
  readonly searchPlaceholder = input('Suchen und filtern …');
  readonly searchAriaLabel = input('Liste durchsuchen');
  readonly searchEnabled = input(true);
  readonly toolbarVisible = input(true);
  readonly columns = input<readonly ColumnDefinition<TColumnId>[] | null>(null);
  readonly sortOptions = input<readonly SortFieldOption<TSortField>[] | null>(null);
  readonly currentSort = input<TableSortState<TSortField> | null>(null);
  readonly viewModified = input(false);
  readonly loading = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly hasRows = input(true);
  readonly loadingText = input('Daten werden geladen …');
  readonly emptyTitle = input('Keine Einträge gefunden');
  readonly emptyText = input('');

  readonly searchValueChange = output<string>();
  readonly columnVisibilityToggled = output<TColumnId>();
  readonly columnsReordered = output<{ previousIndex: number; currentIndex: number }>();
  readonly sortChanged = output<TableSortState<TSortField>>();
  readonly viewResetRequested = output<void>();

  protected readonly settings = computed(() => {
    const columns = this.columns();
    const sortOptions = this.sortOptions();
    const currentSort = this.currentSort();
    return columns && sortOptions && currentSort ? { columns, sortOptions, currentSort } : null;
  });
}
