import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { VintedLocalExtensionBridge } from './vinted-local-extension-bridge';
import { VintedLocalRuntimeStore } from './vinted-local-runtime.store';

const readiness = {
  state: 'ready',
  workspaceId: '35000000-0000-4000-8000-000000000001',
  connectionId: '35000000-0000-4000-8000-000000000002',
  externalAccountId: '12345',
  checkedAt: '2026-10-06T10:00:00.000Z',
  version: '1.6.0',
};
describe('Lokale Betriebsprüfung', () => {
  const workspace = signal({ id: readiness.workspaceId });
  const user = signal<{ id: string } | null>({ id: 'user-a' });
  const request = vi.fn();
  let store: VintedLocalRuntimeStore;
  beforeEach(() => {
    workspace.set({ id: readiness.workspaceId });
    user.set({ id: 'user-a' });
    request.mockReset().mockResolvedValue(readiness);
    TestBed.configureTestingModule({
      providers: [
        VintedLocalRuntimeStore,
        { provide: AuthService, useValue: { currentUser: user } },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        { provide: VintedLocalExtensionBridge, useValue: { installed: signal(true), request } },
      ],
    });
    store = TestBed.inject(VintedLocalRuntimeStore);
  });
  afterEach(() => TestBed.resetTestingModule());
  it('prüft ohne Versand oder Kontoanlage', async () => {
    await store.check();
    expect(request).toHaveBeenCalledExactlyOnceWith('FLIPBASE_VINTED_LOCAL_READINESS');
    expect(store.readiness()?.state).toBe('ready');
  });
  it('kennzeichnet eine bewusst ausgelöste Wiederprüfung separat', async () => {
    await store.check(true);
    expect(request).toHaveBeenCalledExactlyOnceWith('FLIPBASE_VINTED_LOCAL_RECHECK');
  });
  it('wartet denselben laufenden Check ab statt ihn mehrfach zu starten', async () => {
    let finish: ((reply: unknown) => void) | undefined;
    request.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = store.check();
    const second = store.check();
    expect(request).toHaveBeenCalledTimes(1);
    finish?.(readiness);
    await Promise.all([first, second]);
    expect(store.checking()).toBe(false);
  });
  it('übernimmt nach Kontowechsel keine veraltete Antwort', async () => {
    let finish: ((reply: unknown) => void) | undefined;
    request.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = store.check();
    workspace.set({ id: '35000000-0000-4000-8000-000000000009' });
    finish?.(readiness);
    await pending;
    expect(store.readiness()).toBeNull();
  });
  it('zeigt nach fehlgeschlagener Prüfung keine alte Bereitschaft', async () => {
    await store.check();
    request.mockRejectedValue(new Error('nicht erreichbar'));
    await store.check();
    expect(store.readiness()).toBeNull();
    expect(store.error()).toBeTruthy();
  });
  it('verwirft eine bereits bestätigte Antwort nach Abmeldung', async () => {
    await store.check();
    user.set(null);
    expect(store.readiness()).toBeNull();
  });
});
