import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { ActionOverviewPreferencesService } from './action-overview-preferences.service';

function user(id: string, enabled: unknown = undefined): User {
  return {
    id,
    app_metadata: {},
    aud: 'authenticated',
    created_at: '2026-10-27T00:00:00Z',
    user_metadata: { flipbase_action_overview: enabled },
  };
}
function session(id: string): Session {
  return {
    access_token: `Bearer${id}`,
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: user(id),
  };
}
function response(id: string, enabled: unknown): Response {
  return new Response(JSON.stringify(user(id, enabled)));
}
function deferred<T>() {
  let resolve: (result: T) => void = () => undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
async function settle() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
  TestBed.flushEffects();
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
describe('ActionOverviewPreferencesService', () => {
  const currentUser = signal<User | null>(null);
  const authSession = signal<Session | null>(null);
  const requests = vi.fn<typeof fetch>();
  const writes = () => requests.mock.calls.filter(([, options]) => options?.method === 'PUT');
  beforeEach(() => {
    currentUser.set(user('A'));
    authSession.set(session('A'));
    requests.mockReset().mockImplementation(async (_url, options) => {
      const id =
        new Headers(options?.headers).get('Authorization') === 'Bearer BearerB' ? 'B' : 'A';
      const enabled =
        options?.method === 'PUT'
          ? JSON.parse(String(options.body)).data.flipbase_action_overview
          : false;
      return response(id, enabled);
    });
    vi.stubGlobal('fetch', requests);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUser, session: authSession } }],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  it('defaults invalid metadata to off and restores server metadata', async () => {
    currentUser.set(user('A', 'true'));
    requests.mockResolvedValueOnce(response('A', true));
    const service = TestBed.inject(ActionOverviewPreferencesService);
    expect(service.enabled()).toBe(false);
    await settle();
    expect(service.enabled()).toBe(true);
  });
  it('pins request credentials across an account change and ignores an aborted late response', async () => {
    const late = deferred<Response>();
    requests
      .mockImplementationOnce(async () => response('A', false))
      .mockImplementationOnce(() => late.promise);
    const service = TestBed.inject(ActionOverviewPreferencesService);
    service.setEnabled(true);
    const oldWrite = writes()[0][1];
    expect(new Headers(oldWrite?.headers).get('Authorization')).toBe('Bearer BearerA');
    currentUser.set(user('B'));
    authSession.set(session('B'));
    service.setEnabled(false);
    expect(oldWrite?.signal?.aborted).toBe(true);
    late.resolve(response('A', true));
    await settle();
    expect(writes()).toHaveLength(2);
    expect(new Headers(writes()[1][1]?.headers).get('Authorization')).toBe('Bearer BearerB');
    expect(service.enabled()).toBe(false);
    expect(service.error()).toBeNull();
    expect(authSession()?.user.id).toBe('B');
  });
  it('does not write with an inconsistent session identity', async () => {
    const service = TestBed.inject(ActionOverviewPreferencesService);
    authSession.set(session('B'));
    service.setEnabled(true);
    await settle();
    expect(writes()).toHaveLength(0);
    expect(service.error()).toContain('Sitzung');
  });
  it('never drains an old account queued edit into the new session before effects run', async () => {
    const late = deferred<Response>();
    requests
      .mockImplementationOnce(async () => response('A', false))
      .mockImplementationOnce(() => late.promise);
    const service = TestBed.inject(ActionOverviewPreferencesService);
    service.setEnabled(true);
    service.setEnabled(false);
    currentUser.set(user('B'));
    authSession.set(session('B'));
    late.resolve(response('A', true));
    for (let index = 0; index < 15; index++) await Promise.resolve();
    expect(writes()).toHaveLength(1);
    expect(service.enabled()).toBe(false);
    await settle();
    expect(writes()).toHaveLength(1);
  });
  it('rejects a response for another user and a non-persisted setting', async () => {
    const service = TestBed.inject(ActionOverviewPreferencesService);
    await settle();
    requests.mockResolvedValueOnce(response('B', true));
    service.setEnabled(true);
    await settle();
    expect(service.error()).not.toBeNull();
    requests.mockResolvedValueOnce(response('A', false));
    service.setEnabled(true);
    await settle();
    expect(service.error()).not.toBeNull();
    service.setEnabled(true);
    await settle();
    expect(service.error()).toBeNull();
  });
  it('preserves edits against late refresh and serializes the latest queued value', async () => {
    const refresh = deferred<Response>();
    const write = deferred<Response>();
    requests.mockReturnValueOnce(refresh.promise).mockReturnValueOnce(write.promise);
    const service = TestBed.inject(ActionOverviewPreferencesService);
    service.setEnabled(true);
    service.setEnabled(false);
    expect(writes()).toHaveLength(1);
    refresh.resolve(response('A', true));
    write.resolve(response('A', true));
    await settle();
    expect(writes()).toHaveLength(2);
    expect(JSON.parse(String(writes()[1][1]?.body))).toEqual({
      data: { flipbase_action_overview: false },
    });
    expect(service.enabled()).toBe(false);
    expect(service.saving()).toBe(false);
  });
  it('shows network errors until retry and never adopts a stale metadata event during edits', async () => {
    const service = TestBed.inject(ActionOverviewPreferencesService);
    await settle();
    requests.mockRejectedValueOnce(new Error('offline'));
    service.setEnabled(true);
    await settle();
    expect(service.error()).toContain('offline');
    currentUser.set(user('A', false));
    await settle();
    expect(service.enabled()).toBe(true);
    service.setEnabled(true);
    await settle();
    expect(service.error()).toBeNull();
    currentUser.set(user('A', true));
    await settle();
    currentUser.set(user('A', false));
    await settle();
    expect(service.enabled()).toBe(false);
    currentUser.set(null);
    expect(service.enabled()).toBe(false);
  });
});
