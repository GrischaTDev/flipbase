import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { KleinanzeigenActionStore } from './kleinanzeigen-action.store';

describe('Kleinanzeigen-Fortschritt', () => {
  const auth = { currentUser: signal<{ id: string } | null>({ id: 'owner' }) };
  const workspace = {
    currentWorkspace: signal({ id: 'workspace', archived_at: null as string | null }),
  };
  const reference = {
    platform: 'kleinanzeigen' as const,
    workspaceId: 'workspace',
    connectionId: '9',
    externalId: '11',
  };
  beforeEach(() => {
    auth.currentUser.set({ id: 'owner' });
    workspace.currentWorkspace.set({ id: 'workspace', archived_at: null });
    TestBed.configureTestingModule({
      providers: [
        KleinanzeigenActionStore,
        { provide: AuthService, useValue: auth },
        { provide: WorkspaceService, useValue: workspace },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('sperrt nur die betroffene Anzeige und gibt sie nach dem Ergebnis frei', () => {
    const store = TestBed.inject(KleinanzeigenActionStore);
    const key = store.begin(reference, 'Sneaker', 'Privat');
    expect(store.runningCount()).toBe(1);
    expect(store.isRunning(reference)).toBe(true);
    expect(store.isRunning({ ...reference, connectionId: '10' })).toBe(false);
    expect(() => store.begin(reference, 'Sneaker', 'Privat')).toThrow('bereits');
    store.dismiss(key);
    expect(store.runningCount()).toBe(1);
    store.finish(key, 'paused', 'Bitte Marke prüfen');
    expect(store.runningCount()).toBe(0);
    expect(store.entries()[0].message).toBe('Bitte Marke prüfen');
    expect(store.isRunning(reference)).toBe(false);
    store.dismiss(key);
    expect(store.entries()).toEqual([]);
  });

  it('zeigt nach Nutzer- oder Arbeitsbereichswechsel keine fremden Fortschritte', () => {
    const store = TestBed.inject(KleinanzeigenActionStore);
    const key = store.begin(reference, 'Sneaker', 'Privat');
    auth.currentUser.set({ id: 'other' });
    expect(store.entries()).toEqual([]);
    auth.currentUser.set({ id: 'owner' });
    workspace.currentWorkspace.set({ id: 'other', archived_at: null });
    store.finish(key, 'success', 'Neu inseriert');
    expect(store.entries()).toEqual([]);
    workspace.currentWorkspace.set({ id: 'workspace', archived_at: null });
    expect(store.entries()[0].state).toBe('success');
    workspace.currentWorkspace.set({ id: 'workspace', archived_at: '2026-11-01' });
    expect(store.entries()).toEqual([]);
  });
});
