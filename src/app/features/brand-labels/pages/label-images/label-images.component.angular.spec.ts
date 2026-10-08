import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { LabelRpcError } from '../../models/brand-label-rpc';
import { LabelMediaService, type LabelImageUpload } from '../../services/label-media.service';
import { LabelImagesComponent } from './label-images.component';
const image = {
  assetId: 1,
  version: 2,
  status: 'approved' as const,
  attribution: 'Eigene Aufnahme',
  allowedUse: 'Referenzbibliothek',
};
const requestId = '00000000-0000-4000-8000-000000000001';
function command(): LabelImageUpload {
  return Object.freeze({
    original: new File(['original'], 'original.webp', { type: 'image/webp' }),
    image: new Blob(['normalized'], { type: 'image/png' }),
    attribution: image.attribution,
    allowedUse: image.allowedUse,
    requestId,
  });
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Missing resolver');
  };
  const promise = new Promise<T>((complete) => (resolve = complete));
  return { promise, resolve };
}
function setup() {
  const user = signal<{ id: string } | null>({ id: 'user-a' });
  const workspace = signal({ id: 'workspace-a' });
  const operator = signal(true);
  const service = {
    list: vi.fn().mockResolvedValue([image]),
    prepare: vi.fn(),
    upload: vi.fn(),
    setPermission: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: PlatformOperatorService, useValue: { operator } },
      { provide: LabelMediaService, useValue: service },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new LabelImagesComponent());
  return { component, service, user, workspace, operator };
}
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  TestBed.tick();
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
describe('LabelImagesComponent: Bildverwaltung und Rechtewechsel', () => {
  it('bereitet Upload nur einmal vor und wiederholt exakt denselben Blobauftrag', async () => {
    const { component, service } = setup();
    await settle();
    const upload = command();
    component.file.set(upload.original);
    component.form.setValue({ attribution: image.attribution, allowedUse: image.allowedUse });
    service.prepare.mockResolvedValueOnce(upload);
    service.upload.mockRejectedValueOnce(new Error('Unbestätigt')).mockResolvedValueOnce(1);
    await component.upload();
    expect(component.pending()?.kind).toBe('upload');
    expect(component.hasUnsavedChanges()).toBe(true);
    expect(component.form.disabled).toBe(true);
    await component.retry();
    expect(service.prepare).toHaveBeenCalledTimes(1);
    expect(service.upload.mock.calls[0][0]).toBe(upload);
    expect(service.upload.mock.calls[1][0]).toBe(upload);
    expect(component.pending()).toBeNull();
    expect(component.file()).toBeNull();
    expect(component.message()).toMatch(/gespeichert/);
  });
  it('friert Bildrechte und Request-ID für Freigabewiederholung ein', async () => {
    const { component, service } = setup();
    await settle();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    component.begin(image);
    component.form.controls.attribution.setValue('Geänderter Nachweis');
    service.setPermission
      .mockRejectedValueOnce(new Error('Unbestätigt'))
      .mockResolvedValueOnce(undefined);
    await component.permission(image, 'revoked', true);
    const pending = component.pending();
    expect(Object.isFrozen(pending)).toBe(true);
    expect(pending?.kind === 'permission' && Object.isFrozen(pending.image)).toBe(true);
    component.form.controls.attribution.setValue('Nachträglich');
    await component.retry();
    expect(service.setPermission.mock.calls[1]).toEqual(service.setPermission.mock.calls[0]);
    expect(service.setPermission.mock.calls[1][0].attribution).toBe('Geänderter Nachweis');
    expect(component.pending()).toBeNull();
  });
  it('entfernt private Formulare, Dateien und pending nach serverseitigem 42501', async () => {
    const { component, service } = setup();
    await settle();
    const upload = command();
    component.file.set(upload.original);
    component.form.setValue({ attribution: 'Privater Nachweis', allowedUse: 'Private Nutzung' });
    service.prepare.mockResolvedValueOnce(upload);
    service.upload.mockRejectedValueOnce(new LabelRpcError('forbidden'));
    await component.upload();
    expect(component.images()).toEqual([]);
    expect(component.pending()).toBeNull();
    expect(component.file()).toBeNull();
    expect(component.selected()).toBeNull();
    expect(component.form.getRawValue()).toEqual({ attribution: '', allowedUse: '' });
    expect(component.form.disabled).toBe(true);
  });
  it('entfernt private Angaben bei 42501 während einer Freigabeänderung', async () => {
    const { component, service } = setup();
    await settle();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    component.begin(image);
    service.setPermission.mockRejectedValueOnce(new LabelRpcError('forbidden'));
    await component.permission(image, 'revoked');
    expect(component.images()).toEqual([]);
    expect(component.pending()).toBeNull();
    expect(component.selected()).toBeNull();
    expect(component.form.controls.attribution.value).toBe('');
    expect(component.form.disabled).toBe(true);
  });
  it('verwirft verspätete Bildlisten nach Workspacewechsel', async () => {
    const { component, service, workspace } = setup();
    const old = deferred<readonly (typeof image)[]>();
    service.list.mockReturnValueOnce(old.promise).mockResolvedValueOnce([]);
    await settle();
    workspace.set({ id: 'workspace-b' });
    expect(component.images()).toEqual([]);
    await settle();
    old.resolve([image]);
    await settle();
    expect(component.images()).toEqual([]);
  });
  it('verwirft Uploadvorbereitung nach Workspacewechsel ohne private Bytes zu senden', async () => {
    const { component, service, workspace } = setup();
    await settle();
    const prepared = deferred<LabelImageUpload>();
    const upload = command();
    component.file.set(upload.original);
    component.form.setValue({ attribution: image.attribution, allowedUse: image.allowedUse });
    service.prepare.mockReturnValueOnce(prepared.promise);
    const saving = component.upload();
    workspace.set({ id: 'workspace-b' });
    await settle();
    prepared.resolve(upload);
    await saving;
    expect(service.upload).not.toHaveBeenCalled();
    expect(component.pending()).toBeNull();
    expect(component.file()).toBeNull();
    expect(component.form.controls.attribution.value).toBe('');
  });
  it('verwirft die späte Freigabebestätigung nach Rollenentzug', async () => {
    const { component, service, operator } = setup();
    await settle();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const result = deferred<void>();
    service.setPermission.mockReturnValueOnce(result.promise);
    const saving = component.permission(image, 'revoked');
    operator.set(false);
    expect(component.images()).toEqual([]);
    await settle();
    result.resolve(undefined);
    await saving;
    expect(component.pending()).toBeNull();
    expect(component.message()).toBeNull();
    expect(component.form.disabled).toBe(true);
  });
});
