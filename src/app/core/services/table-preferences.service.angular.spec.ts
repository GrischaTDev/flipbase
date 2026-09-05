import { beforeEach, describe, expect, it } from 'vitest';
import { TablePreferencesService } from './table-preferences.service';
import { SALES_TABLE_CONFIG } from '../config/table-defaults.config';

describe('TablePreferencesService', () => {
  let service: TablePreferencesService;
  const testWorkspaceId = 'test-ws-123';

  beforeEach(() => {
    localStorage.clear();
    service = new TablePreferencesService();
  });

  it('should return default preferences when nothing is stored', () => {
    const prefs = service.getTablePreferences('sales', testWorkspaceId)();
    expect(prefs.columns.length).toBe(SALES_TABLE_CONFIG.defaultColumns.length);
    expect(prefs.sort).toEqual(SALES_TABLE_CONFIG.defaultSort);

    const titleCol = prefs.columns.find((c) => c.id === 'title');
    expect(titleCol?.visible).toBe(true);

    const qtyCol = prefs.columns.find((c) => c.id === 'quantity');
    expect(qtyCol?.visible).toBe(true);
  });

  it('should toggle column visibility and persist to localStorage', () => {
    // Toggle quantity from true to false
    service.toggleColumnVisibility('sales', 'quantity', testWorkspaceId);

    const updated = service.getTablePreferences('sales', testWorkspaceId)();
    const qtyCol = updated.columns.find((c) => c.id === 'quantity');
    expect(qtyCol?.visible).toBe(false);

    // Verify localStorage
    const key = `flipbase:table_prefs:${testWorkspaceId}:sales`;
    const stored = JSON.parse(localStorage.getItem(key) || '{}') as StoredTablePreferences;
    const storedQty = stored.columns.find((c) => c.id === 'quantity');
    expect(storedQty?.visible).toBe(false);
  });

  it('should not hide locked columns', () => {
    // Title is locked
    service.toggleColumnVisibility('sales', 'title', testWorkspaceId);

    const prefs = service.getTablePreferences('sales', testWorkspaceId)();
    const titleCol = prefs.columns.find((c) => c.id === 'title');
    expect(titleCol?.visible).toBe(true);
  });

  it('should update and persist sort state', () => {
    service.setSort('sales', { field: 'revenue', direction: 'asc' }, testWorkspaceId);

    const prefs = service.getTablePreferences('sales', testWorkspaceId)();
    expect(prefs.sort).toEqual({ field: 'revenue', direction: 'asc' });

    const key = `flipbase:table_prefs:${testWorkspaceId}:sales`;
    const stored = JSON.parse(localStorage.getItem(key) || '{}');
    expect(stored.sort).toEqual({ field: 'revenue', direction: 'asc' });
  });

  it('should reorder columns properly', () => {
    const original = service.getTablePreferences('sales', testWorkspaceId)();
    const firstColId = original.columns[0].id;
    const secondColId = original.columns[1].id;

    service.reorderColumns('sales', 0, 1, testWorkspaceId);

    const updated = service.getTablePreferences('sales', testWorkspaceId)();
    expect(updated.columns[0].id).toBe(secondColId);
    expect(updated.columns[1].id).toBe(firstColId);
  });

  it('should reset preferences to defaults', () => {
    service.toggleColumnVisibility('sales', 'quantity', testWorkspaceId);
    service.setSort('sales', { field: 'revenue', direction: 'asc' }, testWorkspaceId);

    service.resetToDefaults('sales', testWorkspaceId);

    const prefs = service.getTablePreferences('sales', testWorkspaceId)();
    expect(prefs.columns.find((c) => c.id === 'quantity')?.visible).toBe(true);
    expect(prefs.sort).toEqual(SALES_TABLE_CONFIG.defaultSort);

    const key = `flipbase:table_prefs:${testWorkspaceId}:sales`;
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('should handle corrupted localStorage gracefully', () => {
    const key = `flipbase:table_prefs:${testWorkspaceId}:sales`;
    localStorage.setItem(key, '{ invalid json');

    const prefs = service.getTablePreferences('sales', testWorkspaceId)();
    expect(prefs.columns.length).toBe(SALES_TABLE_CONFIG.defaultColumns.length);
    expect(prefs.sort).toEqual(SALES_TABLE_CONFIG.defaultSort);
  });

  it('should reconcile schema drift when new columns exist in code', () => {
    const key = `flipbase:table_prefs:${testWorkspaceId}:sales`;
    // Stored preferences with only two columns
    const oldPrefs = {
      version: 1,
      columns: [
        { id: 'title', visible: true, order: 0 },
        { id: 'revenue', visible: true, order: 1 },
      ],
      sort: { field: 'revenue', direction: 'asc' },
    };
    localStorage.setItem(key, JSON.stringify(oldPrefs));

    const prefs = service.getTablePreferences('sales', testWorkspaceId)();
    // All current columns should still be present
    expect(prefs.columns.length).toBe(SALES_TABLE_CONFIG.defaultColumns.length);
    expect(prefs.sort).toEqual({ field: 'revenue', direction: 'asc' });
  });
});
