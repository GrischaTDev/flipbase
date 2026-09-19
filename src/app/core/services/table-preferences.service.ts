import { Injectable, effect, inject, signal, Signal, WritableSignal } from '@angular/core';
import {
  ColumnDefinition,
  StoredTablePreferences,
  TableConfig,
  TableId,
  TableSortState,
} from '../models/table-preferences.models';
import {
  ACCOUNTING_TABLE_CONFIG,
  BETA_APPLICATIONS_TABLE_CONFIG,
  CATALOG_TABLE_CONFIG,
  EXPENSES_TABLE_CONFIG,
  INVENTORY_TABLE_CONFIG,
  PURCHASES_TABLE_CONFIG,
  SALES_TABLE_CONFIG,
} from '../config/table-defaults.config';
import {
  TableColumnOption,
  TablePreferences,
  parseTablePreferences,
} from '../models/table-preferences';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

const demoStorageKey = 'flipbase_demo_table_preferences_v1';
const CURRENT_PREFERENCES_VERSION = 1;

export interface TableState<TColumnId extends string = string, TSortField extends string = string> {
  readonly columns: readonly ColumnDefinition<TColumnId>[];
  readonly sort: TableSortState<TSortField>;
}

@Injectable({
  providedIn: 'root',
})
export class TablePreferencesService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);
  private readonly preferences = signal<TablePreferences>({});
  private readonly error = signal<string | null>(null);
  readonly saveError = this.error.asReadonly();
  private activeUserId: string | null = null;
  private generation = 0;
  private editRevision = 0;
  private queued: TablePreferences | null = null;
  private saving = false;

  private readonly tableRegistry: Record<TableId, TableConfig> = {
    sales: SALES_TABLE_CONFIG,
    inventory: INVENTORY_TABLE_CONFIG,
    purchases: PURCHASES_TABLE_CONFIG,
    accounting: ACCOUNTING_TABLE_CONFIG,
    catalog: CATALOG_TABLE_CONFIG,
    expenses: EXPENSES_TABLE_CONFIG,
    beta_applications: BETA_APPLICATIONS_TABLE_CONFIG,
  };

  private readonly stateSignals = new Map<string, WritableSignal<TableState>>();

  constructor() {
    this.synchronizeContext();
    effect(() => this.synchronizeContext());
  }

  // --- Column Picker / Preferences Methods (Codex API) ---

  visibleColumns(tableId: string, definitions: readonly TableColumnOption[]): readonly string[] {
    const saved = this.preferences()[tableId];
    return definitions
      .filter((column) => column.required || !saved || saved.includes(column.id))
      .map((column) => column.id);
  }

  setVisibleColumns(tableId: string, columnIds: readonly string[]): void {
    this.synchronizeContext();
    this.update({ ...this.preferences(), [tableId]: [...new Set(columnIds)] });
  }

  reset(tableId: string): void {
    this.synchronizeContext();
    const next = { ...this.preferences() };
    delete next[tableId];
    this.update(next);
  }

  // --- Polaris IndexTable Preferences Methods (Antigravity API) ---

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

  reorderColumns(
    tableId: TableId,
    fromIndex: number,
    toIndex: number,
    workspaceId = 'default',
  ): void {
    const sig = this.getOrInitSignal(tableId, workspaceId);

    sig.update((prev) => {
      const columns = [...prev.columns];
      if (
        fromIndex < 0 ||
        fromIndex >= columns.length ||
        toIndex < 0 ||
        toIndex >= columns.length
      ) {
        return prev;
      }

      const [moved] = columns.splice(fromIndex, 1);
      columns.splice(toIndex, 0, moved);

      const reordered = columns.map((col, idx) => ({ ...col, order: idx }));
      this.savePreferences(tableId, workspaceId, reordered, prev.sort);
      return { ...prev, columns: reordered };
    });
  }

  resetToDefaults(tableId: TableId, workspaceId = 'default'): void {
    const config = this.tableRegistry[tableId];
    if (!config) return;

    try {
      localStorage.removeItem(this.getStorageKey(tableId, workspaceId));
    } catch {
      // Ignore storage errors
    }

    const sig = this.getOrInitSignal(tableId, workspaceId);
    sig.set({
      columns: [...config.defaultColumns],
      sort: { ...config.defaultSort },
    });
  }

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
          mergedColumns.push({ ...defCol });
        }
      }

      mergedColumns.sort((a, b) => a.order - b.order);

      const isValidSortField = config.sortOptions.some((s) => s.value === parsed.sort?.field);
      const validSort: TableSortState<TSortField> = isValidSortField
        ? parsed.sort
        : { ...config.defaultSort };

      // Nur unveränderte alte Standardansichten umstellen. Bewusste
      // Spaltenwahl und Reihenfolge des Nutzers bleiben erhalten.
      const legacyInventoryColumns = [
        'selection',
        'title',
        'condition',
        'quantity',
        'status',
        'origin',
        'unit_cost',
        'inventory_value',
        'sale',
        'actions',
      ];
      if (
        tableId === 'inventory' &&
        parsed.columns.length === legacyInventoryColumns.length &&
        parsed.columns.every(
          (column, index) =>
            column.id === legacyInventoryColumns[index] &&
            column.visible === true &&
            column.order === index,
        )
      ) {
        const columns = [...config.defaultColumns];
        this.savePreferences(tableId, workspaceId, columns, validSort);
        return { columns, sort: validSort };
      }

      const legacyExpenseColumns = [
        'expense_date',
        'title',
        'category',
        'gross_amount',
        'vat_rate',
        'status',
        'due_or_paid',
        'recurring',
        'documents',
        'actions',
      ];
      if (
        tableId === 'expenses' &&
        parsed.columns.length === legacyExpenseColumns.length &&
        parsed.columns.every(
          (column, index) =>
            column.id === legacyExpenseColumns[index] &&
            column.visible === true &&
            column.order === index,
        )
      ) {
        const columns = [...config.defaultColumns];
        this.savePreferences(tableId, workspaceId, columns, validSort);
        return { columns, sort: validSort };
      }

      // Entfernte Einkaufsspalten dauerhaft aus Altpräferenzen entfernen;
      // übrige Sichtbarkeit und Reihenfolge bleiben bestehen.
      const removedPurchaseColumns = new Set(['type', 'cost_status', 'actions']);
      if (
        tableId === 'purchases' &&
        parsed.columns.some((column) => removedPurchaseColumns.has(column.id))
      ) {
        const migratedColumns = mergedColumns.map((column, order) => ({ ...column, order }));
        this.savePreferences(tableId, workspaceId, migratedColumns, validSort);
        return { columns: migratedColumns, sort: validSort };
      }
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
      // Ignore storage errors
    }
  }

  private update(preferences: TablePreferences): void {
    this.preferences.set(preferences);
    this.error.set(null);
    this.editRevision++;
    if (this.auth.isDemoMode()) {
      try {
        localStorage.setItem(demoStorageKey, JSON.stringify(preferences));
      } catch {
        this.error.set('Die Spaltenauswahl konnte lokal nicht gespeichert werden.');
      }
      return;
    }
    const userId = this.auth.currentUser()?.id;
    if (!userId || userId !== this.activeUserId) return;
    this.queued = preferences;
    void this.saveQueued(userId, this.generation);
  }

  private synchronizeContext(): void {
    const demo = this.auth.isDemoMode();
    const user = this.auth.currentUser();
    const id = demo ? 'demo' : (user?.id ?? null);
    if (this.activeUserId === id) return;
    this.activeUserId = id;
    this.generation++;
    this.editRevision = 0;
    this.queued = null;
    this.error.set(null);
    if (demo) {
      try {
        this.preferences.set(
          parseTablePreferences(JSON.parse(localStorage.getItem(demoStorageKey) ?? 'null')),
        );
      } catch {
        this.preferences.set({});
      }
    } else {
      this.preferences.set(parseTablePreferences(user?.user_metadata?.['table_preferences_v1']));
      if (id) void this.refresh(id, this.generation, this.editRevision);
    }
  }

  private isCurrent(userId: string, generation: number): boolean {
    return (
      this.generation === generation &&
      this.activeUserId === userId &&
      this.auth.currentUser()?.id === userId &&
      !this.auth.isDemoMode()
    );
  }

  private async refresh(userId: string, generation: number, revision: number): Promise<void> {
    try {
      const { data, error } = await this.supabase.client.auth.getUser();
      if (
        !error &&
        data.user?.id === userId &&
        this.isCurrent(userId, generation) &&
        this.editRevision === revision
      ) {
        this.preferences.set(
          parseTablePreferences(data.user.user_metadata?.['table_preferences_v1']),
        );
      }
    } catch {
      /* Bereits geladene Auswahl bleibt bei Netzwerkfehlern nutzbar. */
    }
  }

  private async saveQueued(userId: string, generation: number): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      while (this.queued && this.isCurrent(userId, generation)) {
        const next = this.queued;
        this.queued = null;
        try {
          const { error } = await this.supabase.client.auth.updateUser({
            data: { table_preferences_v1: next },
          });
          if (!this.isCurrent(userId, generation)) return;
          this.error.set(
            error ? `Die Spaltenauswahl konnte nicht gespeichert werden: ${error.message}` : null,
          );
        } catch (error: unknown) {
          if (!this.isCurrent(userId, generation)) return;
          this.error.set(
            `Die Spaltenauswahl konnte nicht gespeichert werden: ${error instanceof Error ? error.message : 'Netzwerkfehler'}`,
          );
        }
      }
    } finally {
      this.saving = false;
      if (this.queued && this.activeUserId && this.isCurrent(this.activeUserId, this.generation))
        void this.saveQueued(this.activeUserId, this.generation);
    }
  }
}
