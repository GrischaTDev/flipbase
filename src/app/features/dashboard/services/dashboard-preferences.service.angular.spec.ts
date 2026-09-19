import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { DashboardPreferencesService } from './dashboard-preferences.service';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => (resolve = complete));
  return { promise, resolve };
}

function user(id: string, preferences?: unknown): User {
  return {
    id,
    user_metadata: preferences === undefined ? {} : { flipbase_dashboard: preferences },
  } as User;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  TestBed.flushEffects();
  await Promise.resolve();
}

describe('DashboardPreferencesService', () => {
  const currentUser = signal<User | null>(null);
  const getUser = vi.fn();
  const updateUser = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    currentUser.set(null);
    getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
    updateUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
    TestBed.configureTestingModule({
      providers: [
        DashboardPreferencesService,
        { provide: AuthService, useValue: { currentUser } },
        { provide: SupabaseService, useValue: { client: { auth: { getUser, updateUser } } } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('uses defaults for missing metadata and loads an existing selection', async () => {
    currentUser.set(user('a'));
    getUser.mockResolvedValueOnce({
      data: { user: user('a', { range: 'last_7_days', platform: 'ebay' }) },
      error: null,
    });

    const service = TestBed.inject(DashboardPreferencesService);
    expect(service.preferences()).toEqual({ range: 'year', platform: 'all' });
    await settle();
    expect(service.preferences()).toEqual({ range: 'last_7_days', platform: 'ebay' });
  });

  it('does not let the initial server response overwrite a newer local edit', async () => {
    currentUser.set(user('a', { range: 'month', platform: 'all' }));
    const refresh = deferred<{ data: { user: User }; error: null }>();
    getUser.mockReturnValueOnce(refresh.promise);
    const service = TestBed.inject(DashboardPreferencesService);

    service.setRange('today');
    refresh.resolve({
      data: { user: user('a', { range: 'year', platform: 'ebay' }) },
      error: null,
    });
    await settle();

    expect(service.preferences()).toEqual({ range: 'today', platform: 'all' });
  });

  it('serializes writes and coalesces intermediate selections', async () => {
    currentUser.set(user('a'));
    const first = deferred<{ data: { user: User }; error: null }>();
    updateUser.mockReturnValueOnce(first.promise);
    const service = TestBed.inject(DashboardPreferencesService);
    await settle();

    service.setRange('today');
    service.setPlatform('ebay');
    service.setRange('last_7_days');
    await settle();
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenNthCalledWith(1, {
      data: { flipbase_dashboard: { range: 'today', platform: 'all' } },
    });

    first.resolve({ data: { user: user('a') }, error: null });
    await settle();
    expect(updateUser).toHaveBeenCalledTimes(2);
    expect(updateUser).toHaveBeenNthCalledWith(2, {
      data: { flipbase_dashboard: { range: 'last_7_days', platform: 'ebay' } },
    });
  });

  it('loads a new account and ignores a late response from the old account', async () => {
    currentUser.set(user('a', { range: 'month', platform: 'ebay' }));
    const first = deferred<{ data: { user: User }; error: null }>();
    updateUser.mockReturnValueOnce(first.promise);
    const service = TestBed.inject(DashboardPreferencesService);
    await settle();
    service.setRange('today');
    await settle();

    currentUser.set(user('b', { range: 'year', platform: 'vinted' }));
    TestBed.flushEffects();
    expect(service.preferences()).toEqual({ range: 'year', platform: 'vinted' });
    first.resolve({ data: { user: user('a') }, error: null });
    await settle();

    expect(service.preferences()).toEqual({ range: 'year', platform: 'vinted' });
    expect(service.saveError()).toBeNull();
  });

  it('does not reset edits on same-user auth events and stops after sign-out', async () => {
    currentUser.set(user('a', { range: 'month', platform: 'all' }));
    const first = deferred<{ data: { user: User }; error: null }>();
    updateUser.mockReturnValueOnce(first.promise);
    const service = TestBed.inject(DashboardPreferencesService);
    await settle();
    service.setPlatform('ebay');
    await settle();

    currentUser.set(user('a', { range: 'year', platform: 'all' }));
    TestBed.flushEffects();
    expect(service.preferences()).toEqual({ range: 'month', platform: 'ebay' });
    currentUser.set(null);
    TestBed.flushEffects();
    first.resolve({ data: { user: user('a') }, error: null });
    await settle();
    expect(updateUser).toHaveBeenCalledTimes(1);
  });

  it('does not restart a queued write after sign-out before the auth effect runs', async () => {
    currentUser.set(user('a'));
    const first = deferred<{ data: { user: User }; error: null }>();
    updateUser.mockReturnValueOnce(first.promise);
    const service = TestBed.inject(DashboardPreferencesService);
    await settle();
    service.setRange('today');
    await settle();
    service.setPlatform('ebay');

    currentUser.set(null);
    const restart = vi.fn();
    (
      service as unknown as {
        saveQueuedPreferences: (userId: string, generation: number) => Promise<void>;
      }
    ).saveQueuedPreferences = restart;
    first.resolve({ data: { user: user('a') }, error: null });
    await Promise.resolve();
    await Promise.resolve();

    expect(restart).not.toHaveBeenCalled();
    TestBed.flushEffects();
  });

  it('exposes returned and thrown save errors without rolling back the selection', async () => {
    currentUser.set(user('a'));
    updateUser
      .mockResolvedValueOnce({ data: { user: null }, error: { message: 'offline' } })
      .mockRejectedValueOnce(new Error('network'));
    const service = TestBed.inject(DashboardPreferencesService);
    await settle();

    service.setRange('today');
    await settle();
    expect(service.preferences().range).toBe('today');
    expect(service.saveError()).toContain('offline');

    service.setRange('month');
    await settle();
    expect(service.saveError()).toContain('network');
  });

  it('clears an older failure when the coalesced latest selection saves successfully', async () => {
    currentUser.set(user('a'));
    const first = deferred<{
      data: { user: null };
      error: { message: string };
    }>();
    updateUser
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ data: { user: user('a') }, error: null });
    const service = TestBed.inject(DashboardPreferencesService);
    await settle();

    service.setRange('today');
    await settle();
    service.setPlatform('ebay');
    first.resolve({ data: { user: null }, error: { message: 'offline' } });
    await settle();

    expect(updateUser).toHaveBeenCalledTimes(2);
    expect(service.saveError()).toBeNull();
  });
});
