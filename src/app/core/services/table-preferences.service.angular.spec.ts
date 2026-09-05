import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TablePreferencesService } from './table-preferences.service';

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

describe('TablePreferencesService', () => {
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
