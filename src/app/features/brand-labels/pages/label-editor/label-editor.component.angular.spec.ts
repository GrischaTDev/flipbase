import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { BrandLabelAdminService } from '../../services/brand-label-admin.service';
import { BrandLabelAdminBrandsService } from '../../services/brand-label-admin-brands.service';
import { LabelMediaService } from '../../services/label-media.service';
import { createEmptyLabelContent } from '../../models/brand-label-content';
import { LabelRpcError } from '../../models/brand-label-rpc';
import type { LabelDraft } from '../../models/brand-label.models';
import { LabelEditorComponent } from './label-editor.component';
const draft: LabelDraft = {
  referenceId: 1,
  revisionId: 10,
  version: 1,
  state: 'draft',
  input: { content: createEmptyLabelContent(), images: [] },
};
const reference = {
  referenceId: 1,
  slug: null,
  brandId: 2,
  brandName: 'Testmarke',
  brandSlug: 'testmarke',
  brandArchived: false,
  version: 1,
  archived: false,
  draft,
  publication: null,
};
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Resolver not initialized');
  };
  const promise = new Promise<T>((complete) => (resolve = complete));
  return { promise, resolve };
}
function setup() {
  const user = signal<{ id: string } | null>({ id: 'user-a' });
  const workspace = signal({ id: 'workspace-a' });
  const operator = signal(true);
  const params = new BehaviorSubject(convertToParamMap({ id: '1' }));
  const service = {
    detail: vi.fn().mockResolvedValue(reference),
    revision: vi.fn(),
    execute: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: PlatformOperatorService, useValue: { operator } },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: params, snapshot: { paramMap: params.value } },
      },
      { provide: BrandLabelAdminService, useValue: service },
      { provide: BrandLabelAdminBrandsService, useValue: { list: vi.fn().mockResolvedValue([]) } },
      { provide: LabelMediaService, useValue: { list: vi.fn().mockResolvedValue([]) } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new LabelEditorComponent());
  return { component, service, user, workspace, operator, params };
}
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 8; index++) await Promise.resolve();
  TestBed.tick();
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
describe('Labelredaktion: Editorinteraktionen', () => {
  it('legt beim Öffnen keine Bearbeitung an und schützt geänderte Felder', async () => {
    const { component, service } = setup();
    await settle();
    expect(service.execute).not.toHaveBeenCalled();
    expect(component.hasUnsavedChanges()).toBe(false);
    component.form.controls.title.setValue('Neuer Titel');
    expect(component.hasUnsavedChanges()).toBe(true);
  });
  it('erhält bei Versionskonflikt die Eingaben ohne neue Version vorzutäuschen', async () => {
    const { component, service } = setup();
    await settle();
    component.form.controls.title.setValue('Lokaler Titel');
    service.revision.mockRejectedValueOnce(new LabelRpcError('conflict'));
    await component.revise('save');
    expect(component.form.controls.title.value).toBe('Lokaler Titel');
    expect(component.view().reference?.draft?.version).toBe(1);
    expect(component.view().conflict).toBe(true);
    expect(component.view().pending).toBeNull();
  });
  it('wiederholt nach unklarer Antwort denselben unveränderlichen Auftrag', async () => {
    const { component, service } = setup();
    await settle();
    component.form.controls.title.setValue('Gesendet');
    service.revision.mockRejectedValueOnce(new LabelRpcError('network'));
    await component.revise('save');
    const command = service.revision.mock.calls[0][0];
    component.form.controls.title.setValue('Nachträglich');
    service.revision.mockResolvedValueOnce({ ...draft, version: 2, input: command.input });
    await component.retry();
    expect(service.revision.mock.calls[1][0]).toBe(command);
    expect(command.input.content.title).toBe('Gesendet');
    expect(Object.isFrozen(command.input.content)).toBe(true);
    expect(component.form.controls.title.value).toBe('Gesendet');
    expect(component.view().pending).toBeNull();
  });
  it('verwirft die späte Schreibantwort nach Workspacewechsel', async () => {
    const { component, service, workspace } = setup();
    await settle();
    const pending = deferred<LabelDraft>();
    service.revision.mockReturnValueOnce(pending.promise);
    component.form.controls.title.setValue('Workspace A');
    const saving = component.revise('save');
    workspace.set({ id: 'workspace-b' });
    expect(component.view().reference).toBeNull();
    await settle();
    pending.resolve({
      ...draft,
      version: 2,
      input: { ...draft.input, content: { ...draft.input.content, title: 'Verspätet' } },
    });
    await saving;
    expect(component.form.controls.title.value).not.toBe('Verspätet');
    expect(component.view().reference?.draft?.version).toBe(1);
  });
  it('entfernt offene Eingaben bei Rollenentzug und lädt keine Daten nach', async () => {
    const { component, service, operator } = setup();
    await settle();
    component.form.controls.title.setValue('Privater Entwurf');
    operator.set(false);
    expect(component.view().reference).toBeNull();
    await settle();
    expect(component.form.controls.title.value).toBe('');
    expect(component.form.disabled).toBe(true);
    expect(service.detail).toHaveBeenCalledTimes(1);
  });
  it('verhindert Prüfung ungespeicherter Änderungen', async () => {
    const { component, service } = setup();
    await settle();
    component.form.controls.title.setValue('Nicht gespeichert');
    await component.revise('submit');
    expect(service.revision).not.toHaveBeenCalled();
    expect(component.view().error).toMatch(/Speichere/);
  });
});
