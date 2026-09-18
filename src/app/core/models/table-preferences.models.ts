export type TableId =
  'sales' | 'inventory' | 'purchases' | 'accounting' | 'catalog' | 'expenses' | 'beta_applications';

export type SortDirection = 'asc' | 'desc';
export type SortValueKind = 'text' | 'number' | 'date';

export interface ColumnDefinition<TColumnId extends string = string> {
  readonly id: TColumnId;
  readonly label: string;
  readonly visible: boolean;
  readonly order: number;
  readonly locked?: boolean; // Locked columns (e.g. title/actions) cannot be hidden
  readonly defaultVisible?: boolean;
}

export interface SortFieldOption<TSortField extends string = string> {
  readonly value: TSortField;
  readonly label: string;
  readonly kind: SortValueKind;
}

export interface TableSortState<TSortField extends string = string> {
  readonly field: TSortField;
  readonly direction: SortDirection;
}

export interface StoredTablePreferences<
  TColumnId extends string = string,
  TSortField extends string = string,
> {
  readonly version: number;
  readonly columns: readonly {
    readonly id: TColumnId;
    readonly visible: boolean;
    readonly order: number;
  }[];
  readonly sort: {
    readonly field: TSortField;
    readonly direction: SortDirection;
  };
}

export interface TableConfig<
  TColumnId extends string = string,
  TSortField extends string = string,
> {
  readonly defaultColumns: readonly ColumnDefinition<TColumnId>[];
  readonly defaultSort: TableSortState<TSortField>;
  readonly sortOptions: readonly SortFieldOption<TSortField>[];
}

export function tableStateDiffersFromDefaults<TColumnId extends string, TSortField extends string>(
  state: TableStateLike<TColumnId, TSortField>,
  config: TableConfig<TColumnId, TSortField>,
): boolean {
  if (
    state.sort.field !== config.defaultSort.field ||
    state.sort.direction !== config.defaultSort.direction
  ) {
    return true;
  }

  if (state.columns.length !== config.defaultColumns.length) return true;

  return state.columns.some((column) => {
    const defaultColumn = config.defaultColumns.find((candidate) => candidate.id === column.id);
    return (
      !defaultColumn ||
      column.visible !== defaultColumn.visible ||
      column.order !== defaultColumn.order
    );
  });
}

export type TableStateLike<
  TColumnId extends string = string,
  TSortField extends string = string,
> = Pick<StoredTablePreferences<TColumnId, TSortField>, 'columns' | 'sort'>;
