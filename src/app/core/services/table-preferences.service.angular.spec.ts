import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TablePreferencesService } from './table-preferences.service';
import {
  EXPENSES_TABLE_CONFIG,
  INVENTORY_TABLE_CONFIG,
  SALES_TABLE_CONFIG,
} from '../config/table-defaults.config';
import { StoredTablePreferences } from '../models/table-preferences.models';

const definitions = [
  { id: 'title', label: 'Artikel', required: true },
  { id: 'cost', label: 'Kosten' },
];
const user = (id: string, value: unknown = {}): User => ({
  id,
  aud: 'authenticated',
  created_at: '2026-09-05T12:00:00Z',
  app_metadata: {},
  user_metadata: { table_preferences_v1: value, other: 'keep' },
});
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  TestBed.flushEffects();
  await Promise.resolve();
};

describe('TablePreferencesService – Column Picker & Auth Sync (Codex)', () => {
  const currentUser = signal<User | null>(null);
  const isDemoMode = signal(false);
  const getUser = vi.fn();
  const updateUser = vi.fn();
  beforeEach(() => {
    currentUser.set(user('a'));
    isDemoMode.set(false);
    localStorage.clear();
    getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
    updateUser.mockReset().mockResolvedValue({ error: null });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser, isDemoMode } },
        { provide: SupabaseService, useValue: { client: { auth: { getUser, updateUser } } } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('defaults to all columns and restores only known IDs while retaining required columns', () => {
    currentUser.set(user('a', { inventory: ['unknown'], sales: 'invalid' }));
    const service = TestBed.inject(TablePreferencesService);
    expect(service.visibleColumns('inventory', definitions)).toEqual(['title']);
    expect(service.visibleColumns('sales', definitions)).toEqual(['title', 'cost']);
    service.reset('inventory');
    expect(service.visibleColumns('inventory', definitions)).toEqual(['title', 'cost']);
  });

  it('persists independent table selections and writes only the versioned key', async () => {
    const service = TestBed.inject(TablePreferencesService);
    service.setVisibleColumns('inventory', ['title']);
    await settle();
    service.setVisibleColumns('sales', []);
    await settle();
    expect(updateUser).toHaveBeenLastCalledWith({
      data: { table_preferences_v1: { inventory: ['title'], sales: [] } },
    });
    TestBed.resetTestingModule();
    currentUser.set(user('a', { inventory: ['title'], sales: [] }));
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser, isDemoMode } },
        { provide: SupabaseService, useValue: { client: { auth: { getUser, updateUser } } } },
      ],
    });
    expect(
      TestBed.inject(TablePreferencesService).visibleColumns('inventory', definitions),
    ).toEqual(['title']);
  });

  it('coalesces writes and discards queued selections on a user switch', async () => {
    let finish!: (value: unknown) => void;
    updateUser.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const service = TestBed.inject(TablePreferencesService);
    service.setVisibleColumns('inventory', []);
    service.setVisibleColumns('inventory', ['cost']);
    currentUser.set(user('b', { inventory: ['title'] }));
    TestBed.flushEffects();
    service.setVisibleColumns('sales', []);
    finish({ error: { message: 'old failure' } });
    await settle();
    expect(service.visibleColumns('inventory', definitions)).toEqual(['title']);
    expect(updateUser).toHaveBeenCalledTimes(2);
    expect(updateUser).toHaveBeenLastCalledWith({
      data: { table_preferences_v1: { inventory: ['title'], sales: [] } },
    });
    expect(service.saveError()).toBeNull();
  });

  it('ignores late refresh and keeps a local choice after a failed save', async () => {
    let finish!: (value: unknown) => void;
    getUser.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    updateUser.mockResolvedValueOnce({ error: { message: 'offline' } });
    const service = TestBed.inject(TablePreferencesService);
    service.setVisibleColumns('inventory', []);
    finish({ data: { user: user('a') }, error: null });
    await settle();
    expect(service.visibleColumns('inventory', definitions)).toEqual(['title']);
    expect(service.saveError()).toContain('offline');
  });

  it('does not restart a queued write after logout before effects run', async () => {
    let finish!: (value: unknown) => void;
    updateUser.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const service = TestBed.inject(TablePreferencesService);
    service.setVisibleColumns('inventory', []);
    service.setVisibleColumns('sales', []);
    currentUser.set(null);
    finish({ error: null });
    await settle();
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(service.visibleColumns('inventory', definitions)).toEqual(['title', 'cost']);
  });

  it('stores demo selections separately without writing auth metadata', () => {
    isDemoMode.set(true);
    const service = TestBed.inject(TablePreferencesService);
    service.setVisibleColumns('inventory', []);
    expect(JSON.parse(localStorage.getItem('flipbase_demo_table_preferences_v1')!)).toEqual({
      inventory: [],
    });
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe('TablePreferencesService – Polaris Table Preferences & Reordering', () => {
  let service: TablePreferencesService;
  const testWorkspaceId = 'test-ws-123';

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { currentUser: signal(null), isDemoMode: signal(true) },
        },
        {
          provide: SupabaseService,
          useValue: { client: { auth: { getUser: vi.fn(), updateUser: vi.fn() } } },
        },
      ],
    });
    service = TestBed.inject(TablePreferencesService);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('entfernt nicht mehr unterstützte Einkaufsspalten dauerhaft und erhält persönliche Einstellungen', () => {
    localStorage.setItem(
      `flipbase:table_prefs:${testWorkspaceId}:purchases`,
      JSON.stringify({
        version: 1,
        columns: [
          { id: 'type', visible: true, order: 0 },
          { id: 'cost_status', visible: true, order: 1 },
          { id: 'actions', visible: true, order: 2 },
          { id: 'title', visible: true, order: 3 },
          { id: 'units', visible: false, order: 4 },
          { id: 'capture', visible: true, order: 5 },
        ],
        sort: { field: 'title', direction: 'asc' },
      }),
    );
    const state = service.getTablePreferences('purchases', testWorkspaceId)();
    expect(
      state.columns.some((column) =>
        ['type', 'cost_status', 'actions', 'units', 'capture'].includes(column.id),
      ),
    ).toBe(false);
    expect(state.columns.find((column) => column.id === 'description')?.visible).toBe(true);
    expect(state.columns.find((column) => column.id === 'receipt')?.visible).toBe(true);
    expect(state.sort).toEqual({ field: 'title', direction: 'asc' });
    const stored = JSON.parse(
      localStorage.getItem(`flipbase:table_prefs:${testWorkspaceId}:purchases`) ?? '{}',
    );
    expect(
      stored.columns.some((column: { id: string }) =>
        ['type', 'cost_status', 'actions', 'units', 'capture'].includes(column.id),
      ),
    ).toBe(false);
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

  it('stellt eine unveränderte alte Inventaransicht auf die kompakte Übersicht um', () => {
    const oldIds = [
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
    localStorage.setItem(
      `flipbase:table_prefs:${testWorkspaceId}:inventory`,
      JSON.stringify({
        version: 1,
        columns: oldIds.map((id, order) => ({ id, order, visible: true })),
        sort: { field: 'title', direction: 'asc' },
      }),
    );
    const state = service.getTablePreferences('inventory', testWorkspaceId)();
    expect(state.columns).toEqual(INVENTORY_TABLE_CONFIG.defaultColumns);
    expect(state.sort).toEqual({ field: 'title', direction: 'asc' });
  });

  it('behält bewusst angepasste Inventarspalten bei', () => {
    const oldIds = [
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
    localStorage.setItem(
      `flipbase:table_prefs:${testWorkspaceId}:inventory`,
      JSON.stringify({
        version: 1,
        columns: oldIds.map((id, order) => ({ id, order, visible: id !== 'condition' })),
        sort: { field: 'title', direction: 'asc' },
      }),
    );
    const state = service.getTablePreferences('inventory', testWorkspaceId)();
    expect(state.columns.find((column) => column.id === 'condition')?.visible).toBe(false);
    expect(state.columns.find((column) => column.id === 'origin')?.visible).toBe(true);
    expect(state.columns.find((column) => column.id === 'available')?.visible).toBe(true);
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
    const stored = JSON.parse(localStorage.getItem(key) || '{}') as StoredTablePreferences;
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
  });

  it('ergänzt neue Ausgabenspalten in einer gespeicherten alten Ansicht', () => {
    const key = `flipbase:table_prefs:${testWorkspaceId}:expenses`;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        columns: [
          { id: 'expense_date', visible: true, order: 0 },
          { id: 'title', visible: true, order: 1 },
          { id: 'category', visible: true, order: 2 },
          { id: 'gross_amount', visible: true, order: 3 },
          { id: 'vat_rate', visible: false, order: 4 },
          { id: 'status', visible: true, order: 5 },
          { id: 'due_or_paid', visible: false, order: 6 },
          { id: 'recurring', visible: false, order: 7 },
          { id: 'documents', visible: true, order: 8 },
          { id: 'actions', visible: true, order: 9 },
        ],
        sort: { field: 'expense_date', direction: 'desc' },
      }),
    );

    const state = service.getTablePreferences('expenses', testWorkspaceId)();

    expect(state.columns.find((column) => column.id === 'vendor')?.visible).toBe(true);
    expect(state.columns.find((column) => column.id === 'quantity')?.visible).toBe(true);
    expect(state.columns.length).toBe(EXPENSES_TABLE_CONFIG.defaultColumns.length);
  });

  it('should reconcile schema drift when columns are added to default config', () => {
    const key = `flipbase:table_prefs:${testWorkspaceId}:sales`;
    // Simulate stored prefs missing some columns
    const stored: StoredTablePreferences = {
      version: 1,
      columns: [{ id: 'title', visible: true, order: 0 }],
      sort: { field: 'sale_date', direction: 'desc' },
    };
    localStorage.setItem(key, JSON.stringify(stored));

    const prefs = service.getTablePreferences('sales', testWorkspaceId)();
    expect(prefs.columns.length).toBe(SALES_TABLE_CONFIG.defaultColumns.length);
  });
});
