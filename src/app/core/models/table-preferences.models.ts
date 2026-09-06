export type TableId =
  'sales' | 'inventory' | 'purchases' | 'accounting' | 'catalog' | 'beta_applications';

export type SortDirection = 'asc' | 'desc';

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
