import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceMemberService } from '../../../../core/services/workspace-member.service';
import { AuditExportService } from '../../../../core/services/audit-export.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { WorkspaceRetentionComponent } from './workspace-retention.component';

function setup(selectedId?: string) {
  const first = { id: 'a', name: 'A', min_roi_percent: 0, min_profit_amount: 0 };
  const second = { ...first, id: 'b', name: 'B' };
  const workspace = {
    workspaces: signal([first, second]),
    currentWorkspace: signal(first),
    archiveWorkspace: vi.fn().mockResolvedValue({ error: null }),
    restoreWorkspace: vi.fn().mockResolvedValue({ error: null }),
    deleteWorkspace: vi.fn().mockResolvedValue({ success: true, reportedBySyncStatus: false }),
    switchWorkspace: vi.fn(),
  };
  const members = {
    members: signal([{ workspace_id: 'a', user_id: 'user', role: 'owner' }]),
    isLoading: signal(false),
  };
  const auth = { currentUser: signal({ id: 'user' }), isDemoMode: signal(false) };
  const dialog = { frage: vi.fn().mockResolvedValue(true) };
  const archive = {
    createArchive: vi.fn().mockResolvedValue({ archive: true }),
    downloadArchive: vi.fn(),
  };
  const queryParams = new BehaviorSubject(convertToParamMap({ retentionWorkspace: selectedId }));
  const injector = Injector.create({
    providers: [
      { provide: WorkspaceService, useValue: workspace },
      { provide: WorkspaceMemberService, useValue: members },
      { provide: AuthService, useValue: auth },
      { provide: ConfirmDialogService, useValue: dialog },
      { provide: AuditExportService, useValue: archive },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: queryParams.value },
          queryParamMap: queryParams.asObservable(),
        },
      },
    ],
  });
  const component = runInInjectionContext(injector, () => new WorkspaceRetentionComponent());
  return { component, workspace, members, auth, dialog, archive, first, second, queryParams };
}

describe('Workspace-Aufbewahrung', () => {
  it('aktualisiert den Löschkontext bei erneutem Aufruf derselben Seite', () => {
    const { component, queryParams } = setup('a');
    component.prepareDeletion();
    queryParams.next(convertToParamMap({ retentionWorkspace: 'b' }));
    expect(component.workspace()?.id).toBe('b');
    expect(component.deletionPrepared()).toBe(false);
    queryParams.next(convertToParamMap({}));
    expect(component.workspace()?.id).toBe('a');
  });
  it('verweigert Aktionen solange keine echte Inhaber-Mitgliedschaft geladen ist', async () => {
    const { component, members, workspace } = setup();
    members.members.set([]);
    expect(component.isOwner()).toBe(false);
    await component.changeArchiveState();
    expect(workspace.archiveWorkspace).not.toHaveBeenCalled();
  });
  it('sendet nach Abbrechen keine Archivierung', async () => {
    const { component, dialog, workspace } = setup();
    dialog.frage.mockResolvedValue(false);
    await component.changeArchiveState();
    expect(workspace.archiveWorkspace).not.toHaveBeenCalled();
    expect(component.isPending()).toBe(false);
  });
  it('zeigt laufende Aktion und erst danach bestätigten Erfolg', async () => {
    const { component, workspace } = setup();
    let resolve!: (value: unknown) => void;
    workspace.archiveWorkspace.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = component.changeArchiveState();
    await Promise.resolve();
    expect(component.isPending()).toBe(true);
    expect(component.status()).toBeNull();
    resolve({ error: null });
    await pending;
    expect(component.status()).toContain('archiviert');
    expect(component.isPending()).toBe(false);
  });
  it('zeigt Fehler ohne Erfolgsmeldung', async () => {
    const { component, workspace } = setup();
    workspace.archiveWorkspace.mockResolvedValue({ error: new Error('Abgelehnt') });
    await component.changeArchiveState();
    expect(component.error()).toBe('Abgelehnt');
    expect(component.status()).toBeNull();
  });
  it('führt nach Workspace-Wechsel während der Bestätigung keine Aktion aus', async () => {
    const { component, workspace, dialog, second } = setup();
    let resolve!: (value: boolean) => void;
    dialog.frage.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = component.changeArchiveState();
    workspace.currentWorkspace.set(second);
    resolve(true);
    await pending;
    expect(workspace.archiveWorkspace).not.toHaveBeenCalled();
  });
  it('exportiert für den explizit ausgewählten Lösch-Workspace ohne Journalfilter', async () => {
    const { component, workspace, members, archive, second } = setup('b');
    workspace.currentWorkspace.set(second);
    members.members.set([{ workspace_id: 'b', user_id: 'user', role: 'owner' }]);
    await component.downloadArchive();
    expect(archive.createArchive).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'b' }),
    );
    expect(archive.createArchive.mock.calls[0][0]).not.toHaveProperty('entityType');
    expect(archive.downloadArchive).toHaveBeenCalledOnce();
  });
  it('bietet vor Bestätigung den Download und versucht eine abgelehnte Geschäftsdaten-Löschung nicht erneut', async () => {
    const { component, workspace, dialog } = setup();
    workspace.deleteWorkspace.mockResolvedValue({
      success: false,
      reportedBySyncStatus: true,
      retentionBlocked: true,
    });
    await component.deleteWorkspace();
    expect(dialog.frage).not.toHaveBeenCalled();
    component.prepareDeletion();
    await component.deleteWorkspace();
    expect(component.deletionBlocked()).toBe(true);
    expect(component.error()).toContain('aufbewahrungsrelevante Geschäftsdaten');
    await component.deleteWorkspace();
    expect(workspace.deleteWorkspace).toHaveBeenCalledOnce();
  });
  it('deaktiviert Demo-Lebenszyklus ehrlich', async () => {
    const { component, auth, workspace } = setup();
    auth.isDemoMode.set(true);
    await component.changeArchiveState();
    expect(component.isOwner()).toBe(false);
    expect(workspace.archiveWorkspace).not.toHaveBeenCalled();
  });
  it('bricht den Archivdownload ohne Datei oder Fehlermeldung ab', async () => {
    const { component, archive } = setup();
    archive.createArchive.mockImplementation(
      (request: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          request.signal.addEventListener('abort', () =>
            reject(new DOMException('Abgebrochen', 'AbortError')),
          ),
        ),
    );
    const pending = component.downloadArchive();
    expect(component.isExporting()).toBe(true);
    component.cancelExport();
    await pending;
    expect(archive.downloadArchive).not.toHaveBeenCalled();
    expect(component.error()).toBeNull();
    expect(component.isExporting()).toBe(false);
  });
  it('zeigt ein spätes Archiv-Ergebnis nicht im inzwischen gewählten Workspace', async () => {
    const { component, workspace, second } = setup();
    let resolve!: (value: unknown) => void;
    workspace.archiveWorkspace.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = component.changeArchiveState();
    await Promise.resolve();
    workspace.currentWorkspace.set(second);
    resolve({ error: null });
    await pending;
    expect(component.status()).toBeNull();
    expect(workspace.currentWorkspace().id).toBe('b');
  });
});
