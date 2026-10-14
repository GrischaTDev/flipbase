import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ChildrenOutletContexts, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushNavigationService } from './push-navigation.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { WorkspaceAccessService } from './workspace-access.service';
import { WorkspaceContextLockService } from './workspace-context-lock.service';

const userId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const payload = {
  version: 1,
  eventId: '33333333-3333-4333-8333-333333333333',
  workspaceId,
  category: 'test',
  title: 'Flipbase',
  body: 'Test',
  target: { kind: 'settings' },
};
function setup(connection: { id: string; marketplace: string } | null = null) {
  const currentUser = signal<{ id: string } | null>({ id: userId });
  const locked = signal(false);
  const currentWorkspace = signal({ id: '44444444-4444-4444-8444-444444444444' });
  const switchWorkspace = vi.fn((id: string) => {
    currentWorkspace.set({ id });
    return true;
  });
  const navigateByUrl = vi.fn(async () => true);
  const navigate = vi.fn(async () => true);
  const refresh = vi.fn(async () => [{ workspace_id: workspaceId, access_status: 'active' }]);
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: connection, error: null })),
  };
  const from = vi.fn(() => query);
  TestBed.configureTestingModule({
    providers: [
      PushNavigationService,
      { provide: AuthService, useValue: { currentUser, sessionReady: Promise.resolve() } },
      { provide: SupabaseService, useValue: { client: { from } } },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace, switchWorkspace, ensureLoaded: vi.fn(async () => undefined) },
      },
      { provide: WorkspaceAccessService, useValue: { refresh } },
      { provide: WorkspaceContextLockService, useValue: { locked } },
      { provide: ChildrenOutletContexts, useValue: null },
      { provide: Router, useValue: { navigateByUrl, navigate } },
    ],
  });
  return {
    service: TestBed.inject(PushNavigationService),
    currentUser,
    locked,
    switchWorkspace,
    navigateByUrl,
    navigate,
    refresh,
    from,
    query,
  };
}
beforeEach(() => sessionStorage.clear());
afterEach(() => TestBed.resetTestingModule());
describe('Authorized push navigation', () => {
  it('opens favorites only after rechecking the Vinted connection in the authorized workspace', async () => {
    const connectionId = '55555555-5555-4555-8555-555555555555';
    const { service, query, navigateByUrl } = setup({ id: connectionId, marketplace: 'vinted' });
    service.enqueue({
      ...payload,
      category: 'favorite',
      target: { kind: 'vinted_favorites', connectionId },
    });
    expect(await service.openPending()).toBe(true);
    expect(query.eq).toHaveBeenCalledWith('workspace_id', workspaceId);
    expect(query.eq).toHaveBeenCalledWith('id', connectionId);
    expect(navigateByUrl).toHaveBeenCalledWith(
      `/marketplaces/vinted/listings?connectionId=${connectionId}`,
    );
  });
  it('keeps favorites pending after connection access is revoked', async () => {
    const { service, navigateByUrl } = setup();
    service.enqueue({
      ...payload,
      category: 'favorite',
      target: { kind: 'vinted_favorites', connectionId: workspaceId },
    });
    expect(await service.openPending()).toBe(false);
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(service.pending()).not.toBeNull();
  });
  it('retains a newer notification arriving while the router completes the first target', async () => {
    const { service, navigateByUrl } = setup();
    let finish: (result: boolean) => void = () => undefined;
    navigateByUrl.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    service.enqueue(payload);
    const opened = service.openPending();
    await vi.waitFor(() => expect(navigateByUrl).toHaveBeenCalledOnce());
    const next = { ...payload, eventId: '66666666-6666-4666-8666-666666666666' };
    service.enqueue(next);
    finish(true);
    expect(await opened).toBe(true);
    expect(service.pending()?.eventId).toBe(next.eventId);
    expect(service.restore()).toBe(true);
    expect(service.pending()?.eventId).toBe(next.eventId);
  });
  it('retains the target without querying or switching an open entry', async () => {
    const { service, locked, refresh, switchWorkspace, navigateByUrl } = setup();
    locked.set(true);
    service.enqueue(payload);
    expect(await service.openPending()).toBe(false);
    expect(service.pending()?.eventId).toBe(payload.eventId);
    expect(refresh).not.toHaveBeenCalled();
    expect(switchWorkspace).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
  it('rechecks the lock after asynchronous rights checks', async () => {
    const { service, locked, refresh, navigateByUrl } = setup();
    refresh.mockImplementationOnce(async () => {
      locked.set(true);
      return [{ workspace_id: workspaceId, access_status: 'active' }];
    });
    service.enqueue(payload);
    expect(await service.openPending()).toBe(false);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
  it('rejects revoked workspace access and another login', async () => {
    const { service, refresh, currentUser, navigateByUrl } = setup();
    service.enqueue(payload);
    refresh.mockResolvedValueOnce([]);
    expect(await service.openPending()).toBe(false);
    currentUser.set({ id: '55555555-5555-4555-8555-555555555555' });
    expect(await service.openPending()).toBe(false);
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(service.pending()).toBeNull();
  });
  it('opens a checked target and switches only the authorized workspace', async () => {
    const { service, switchWorkspace, navigateByUrl } = setup();
    service.enqueue(payload);
    expect(await service.openPending()).toBe(true);
    expect(switchWorkspace).toHaveBeenCalledWith(workspaceId);
    expect(navigateByUrl).toHaveBeenCalledWith('/settings/notifications');
    expect(service.pending()).toBeNull();
  });
  it('preserves the structured target through login and reload without trusting a URL', async () => {
    const { service, currentUser, navigate } = setup();
    currentUser.set(null);
    service.enqueue(payload);
    expect(await service.openPending()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { redirectTo: '/push/open' },
    });
    service.pending.set(null);
    expect(service.restore()).toBe(true);
    expect(
      service.enqueue({ ...payload, target: { kind: 'settings', url: 'https://evil.test' } }),
    ).toBe(false);
    expect(service.pending()?.target).toEqual({ kind: 'settings' });
  });
});
