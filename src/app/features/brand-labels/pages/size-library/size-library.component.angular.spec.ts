import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceAccessService } from '../../../../core/services/workspace-access.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { BrandLabelAdminBrandsService } from '../../services/brand-label-admin-brands.service';
import { SizeReferenceService } from '../../services/size-reference.service';
import { LabelRpcError } from '../../models/brand-label-rpc';
import { SizeLibraryComponent } from './size-library.component';
function setup() {
  const workspace = signal({ id: 'one' });
  const operator = signal(true);
  const service = { list: vi.fn().mockResolvedValue([]), execute: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user' }) } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: WorkspaceAccessService, useValue: { access: signal([]) } },
      { provide: PlatformOperatorService, useValue: { operator } },
      { provide: ActivatedRoute, useValue: { snapshot: { data: { admin: true } } } },
      { provide: BrandLabelAdminBrandsService, useValue: { list: vi.fn().mockResolvedValue([]) } },
      { provide: SizeReferenceService, useValue: service },
    ],
  });
  return {
    component: TestBed.runInInjectionContext(() => new SizeLibraryComponent()),
    service,
    workspace,
    operator,
  };
}
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 8; index++) await Promise.resolve();
  TestBed.tick();
}
function fill(component: SizeLibraryComponent) {
  component.begin();
  component.form.patchValue({ title: 'Hose', rows: '32;81;80' });
  component.form.markAsDirty();
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
describe('Größenredaktion', () => {
  it('gibt bestätigte Validierungsfehler zur Korrektur frei und erhält alle Eingaben', async () => {
    const { component, service } = setup();
    await settle();
    fill(component);
    service.execute.mockRejectedValueOnce(new LabelRpcError('validation'));
    await component.save(false);
    expect(component.pending()).toBeNull();
    expect(component.form.enabled).toBe(true);
    expect(component.form.getRawValue()['title']).toBe('Hose');
    expect(component.hasUnsavedChanges()).toBe(true);
  });
  it('wiederholt bei unklarer Antwort denselben Auftrag mit denselben Angaben', async () => {
    const { component, service } = setup();
    await settle();
    fill(component);
    service.execute.mockRejectedValueOnce(new Error('Antwort verloren'));
    await component.save(false);
    const command = service.execute.mock.calls[0][0];
    component.form.patchValue({ title: 'Nachträglich' });
    service.execute.mockResolvedValueOnce(undefined);
    await component.retry();
    expect(service.execute.mock.calls[1][0]).toBe(command);
    expect(command.content.title).toBe('Hose');
    expect(component.pending()).toBeNull();
  });
  it('veröffentlicht keine Tabelle ohne Quelle', async () => {
    const { component, service } = setup();
    await settle();
    fill(component);
    await component.save(true);
    expect(service.execute).not.toHaveBeenCalled();
    expect(component.error()).toContain('Quelle');
  });
  it('entfernt lokale Eingaben und unbestätigte Aufträge bei Workspacewechsel', async () => {
    const { component, service, workspace } = setup();
    await settle();
    fill(component);
    service.execute.mockRejectedValueOnce(new Error('lost'));
    await component.save(false);
    workspace.set({ id: 'two' });
    await settle();
    expect(component.pending()).toBeNull();
    expect(component.form.getRawValue()['title']).toBe('');
    expect(component.hasUnsavedChanges()).toBe(false);
  });
  it('entfernt vertrauliche Tabellen bei serverseitigem Rechteentzug', async () => {
    const { component, service } = setup();
    await settle();
    fill(component);
    service.execute.mockRejectedValueOnce(new LabelRpcError('forbidden'));
    await component.save(false);
    expect(component.pending()).toBeNull();
    expect(component.editing()).toBe(false);
    expect(component.form.getRawValue()['title']).toBe('');
  });
  it('ignoriert späte Ladeantworten aus dem vorherigen Workspace', async () => {
    const { component, service, workspace } = setup();
    await settle();
    let resolve: (items: unknown[]) => void = () => undefined;
    service.list.mockImplementationOnce(() => new Promise((complete) => (resolve = complete)));
    const load = component.load();
    workspace.set({ id: 'two' });
    await settle();
    resolve([{ id: 999 }]);
    await load;
    expect(component.items()).toEqual([]);
  });
});
