import { Injectable, signal, WritableSignal, Signal } from '@angular/core';
import {
  ColumnDefinition,
  StoredTablePreferences,
  TableConfig,
  TableId,
  TableSortState,
} from '../models/table-preferences.models';
import {
  ACCOUNTING_TABLE_CONFIG,
  INVENTORY_TABLE_CONFIG,
  PURCHASES_TABLE_CONFIG,
  SALES_TABLE_CONFIG,
} from '../config/table-defaults.config';

const CURRENT_PREFERENCES_VERSION = 1;

export interface TableState<TColumnId extends string = string, TSortField extends string = string> {
  readonly columns: readonly ColumnDefinition<TColumnId>[];
  readonly sort: TableSortState<TSortField>;
}

@Injectable({
  providedIn: 'root',
})
export class TablePreferencesService {
  private readonly tableRegistry: Record<TableId, TableConfig> = {
    sales: SALES_TABLE_CONFIG,
    inventory: INVENTORY_TABLE_CONFIG,
    purchases: PURCHASES_TABLE_CONFIG,
    accounting: ACCOUNTING_TABLE_CONFIG,
  };

  private readonly stateSignals = new Map<string, WritableSignal<TableState>>();

  /**
   * Returns a reactive Signal of the preferences (columns and sort) for a given table and workspace.
   */
  getTablePreferences<TColumnId extends string, TSortField extends string>(
    tableId: TableId,
    workspaceId = 'default',
  ): Signal<TableState<TColumnId, TSortField>> {
    const key = this.getCacheKey(tableId, workspaceId);
    if (!this.stateSignals.has(key)) {
      const initial = this.loadPreferences<TColumnId, TSortField>(tableId, workspaceId);
      this.stateSignals.set(key, signal(initial as TableState));
    }
    return this.stateSignals.get(key)!.asReadonly() as Signal<TableState<TColumnId, TSortField>>;
  }

  /**
   * Toggles the visibility of a column in the specified table.
   * Locked columns cannot be hidden.
   */
  toggleColumnVisibility<TColumnId extends string>(
    tableId: TableId,
    columnId: TColumnId,
    workspaceId = 'default',
  ): void {
    const sig = this.getOrInitSignal(tableId, workspaceId);

    sig.update((prev) => {
      const updatedColumns = prev.columns.map((col) => {
        if (col.id === columnId && !col.locked) {
          return { ...col, visible: !col.visible };
        }
        return col;
      });
      this.savePreferences(tableId, workspaceId, updatedColumns, prev.sort);
      return { ...prev, columns: updatedColumns };
    });
  }

  /**
   * Updates the sort state (field and direction) for a table.
   */
  setSort<TSortField extends string>(
    tableId: TableId,
    sort: TableSortState<TSortField>,
    workspaceId = 'default',
  ): void {
    const sig = this.getOrInitSignal(tableId, workspaceId);

    sig.update((prev) => {
      this.savePreferences(tableId, workspaceId, prev.columns, sort);
      return { ...prev, sort };
    });
  }

  /**
   * Reorders columns in a table (e.g. via drag & drop or keyboard).
   */
  reorderColumns(
    tableId: TableId,
    fromIndex: number,
    toIndex: number,
    workspaceId = 'default',
  ): void {
    const sig = this.getOrInitSignal(tableId, workspaceId);

    sig.update((prev) => {
      const sorted = [...prev.columns].sort((a, b) => a.order - b.order);
      if (fromIndex < 0 || fromIndex >= sorted.length || toIndex < 0 || toIndex >= sorted.length) {
        return prev;
      }

      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);

      const updatedColumns = sorted.map((col, idx) => ({ ...col, order: idx }));
      this.savePreferences(tableId, workspaceId, updatedColumns, prev.sort);
      return { ...prev, columns: updatedColumns };
    });
  }

  /**
   * Resets table column visibility, order, and sorting to the default configuration.
   */
  resetToDefaults(tableId: TableId, workspaceId = 'default'): void {
    const config = this.tableRegistry[tableId];
    if (!config) return;

    try {
      localStorage.removeItem(this.getStorageKey(tableId, workspaceId));
    } catch {
      // Ignore storage errors in restricted contexts
    }

    const sig = this.getOrInitSignal(tableId, workspaceId);
    sig.set({
      columns: [...config.defaultColumns],
      sort: { ...config.defaultSort },
    });
  }

  /**
   * Returns the configuration (default columns, sort options) for a given table.
   */
  getTableConfig<TColumnId extends string, TSortField extends string>(
    tableId: TableId,
  ): TableConfig<TColumnId, TSortField> {
    const config = this.tableRegistry[tableId];
    if (!config) {
      throw new Error(`Tabelle ${tableId} ist nicht registriert.`);
    }
    return config as TableConfig<TColumnId, TSortField>;
  }

  // --- Private Helpers ---

  private getCacheKey(tableId: TableId, workspaceId: string): string {
    return `${workspaceId}:${tableId}`;
  }

  private getStorageKey(tableId: TableId, workspaceId: string): string {
    return `flipbase:table_prefs:${workspaceId}:${tableId}`;
  }

  private getOrInitSignal(tableId: TableId, workspaceId: string): WritableSignal<TableState> {
    const key = this.getCacheKey(tableId, workspaceId);
    let sig = this.stateSignals.get(key);
    if (!sig) {
      const initial = this.loadPreferences(tableId, workspaceId);
      sig = signal(initial);
      this.stateSignals.set(key, sig);
    }
    return sig;
  }

  private loadPreferences<TColumnId extends string, TSortField extends string>(
    tableId: TableId,
    workspaceId: string,
  ): TableState<TColumnId, TSortField> {
    const config = this.tableRegistry[tableId] as TableConfig<TColumnId, TSortField>;
    if (!config) {
      throw new Error(`Tabelle ${tableId} ist nicht registriert.`);
    }

    try {
      const raw = localStorage.getItem(this.getStorageKey(tableId, workspaceId));
      if (!raw) {
        return { columns: [...config.defaultColumns], sort: { ...config.defaultSort } };
      }

      const parsed = JSON.parse(raw) as StoredTablePreferences<TColumnId, TSortField>;
      if (
        !parsed ||
        parsed.version !== CURRENT_PREFERENCES_VERSION ||
        !Array.isArray(parsed.columns)
      ) {
        return { columns: [...config.defaultColumns], sort: { ...config.defaultSort } };
      }

      // Schema-drift merge: reconcile stored columns with defaults
      const storedMap = new Map(parsed.columns.map((c) => [c.id, c]));
      const mergedColumns: ColumnDefinition<TColumnId>[] = [];

      for (const defCol of config.defaultColumns) {
        const stored = storedMap.get(defCol.id);
        if (stored) {
          mergedColumns.push({
            ...defCol,
            visible: defCol.locked ? true : stored.visible,
            order: typeof stored.order === 'number' ? stored.order : defCol.order,
          });
          storedMap.delete(defCol.id);
        } else {
          // New column introduced in code
          mergedColumns.push({ ...defCol });
        }
      }

      mergedColumns.sort((a, b) => a.order - b.order);

      // Validate sort field
      const isValidSortField = config.sortOptions.some((s) => s.value === parsed.sort?.field);
      const validSort: TableSortState<TSortField> = isValidSortField
        ? parsed.sort
        : { ...config.defaultSort };

      return { columns: mergedColumns, sort: validSort };
    } catch {
      return { columns: [...config.defaultColumns], sort: { ...config.defaultSort } };
    }
  }

  private savePreferences(
    tableId: TableId,
    workspaceId: string,
    columns: readonly ColumnDefinition<string>[],
    sort: TableSortState<string>,
  ): void {
    try {
      const payload: StoredTablePreferences = {
        version: CURRENT_PREFERENCES_VERSION,
        columns: columns.map((c) => ({ id: c.id, visible: c.visible, order: c.order })),
        sort,
      };
      localStorage.setItem(this.getStorageKey(tableId, workspaceId), JSON.stringify(payload));
    } catch {
      // Ignore quota/security errors
    }
  }
}
