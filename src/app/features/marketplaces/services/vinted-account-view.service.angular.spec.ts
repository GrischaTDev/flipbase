import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { VintedAccountViewService } from './vinted-account-view.service';

describe('Vinted-Kontoansicht', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function createFixture() {
    const user = signal<{ id: string } | null>({ id: 'user-a' });
    const workspace = signal({ id: 'workspace-a', archived_at: null as string | null });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser: user } },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      ],
    });
    return { user, workspace, view: TestBed.inject(VintedAccountViewService) };
  }

  it('merkt die Wahl nur für dieselbe Person und denselben aktiven Workspace', () => {
    const { view, user, workspace } = createFixture();
    expect(view.showAllAccounts()).toBe(false);
    view.selectAccountView(true);
    expect(view.showAllAccounts()).toBe(true);
    workspace.set({ id: 'workspace-b', archived_at: null });
    expect(view.showAllAccounts()).toBe(false);
    workspace.set({ id: 'workspace-a', archived_at: '2026-11-25' });
    expect(view.showAllAccounts()).toBe(false);
    workspace.set({ id: 'workspace-a', archived_at: null });
    user.set({ id: 'user-b' });
    expect(view.showAllAccounts()).toBe(false);
    user.set({ id: 'user-a' });
    expect(view.showAllAccounts()).toBe(true);

    TestBed.resetTestingModule();
    const { view: reopened } = createFixture();
    expect(reopened.showAllAccounts()).toBe(true);
    reopened.selectAccountView(false);
    expect(reopened.showAllAccounts()).toBe(false);
  });

  it('wechselt die Ansicht auch bei gesperrtem Browserspeicher', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage denied');
    });
    const { view } = createFixture();
    view.selectAccountView(true);
    expect(view.showAllAccounts()).toBe(true);
  });
});
