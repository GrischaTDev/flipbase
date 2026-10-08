import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { BrandLabelAdminService } from '../../services/brand-label-admin.service';
import { BrandLabelAdminBrandsService } from '../../services/brand-label-admin-brands.service';
import { LabelRpcError } from '../../models/brand-label-rpc';
import { LabelAdminComponent } from './label-admin.component';
function setup() {
  const user = signal<{ id: string } | null>({ id: 'user-a' });
  const workspace = signal({ id: 'workspace-a' });
  const operator = signal(true);
  const service = {
    list: vi.fn().mockResolvedValue({ rows: [], hasMore: false, nextOffset: null }),
    readerSettings: vi.fn().mockResolvedValue(false),
    setReader: vi.fn(),
    execute: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: PlatformOperatorService, useValue: { operator } },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: BrandLabelAdminService, useValue: service },
      { provide: BrandLabelAdminBrandsService, useValue: { list: vi.fn().mockResolvedValue([]) } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new LabelAdminComponent());
  return { component, service, operator, workspace };
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
describe('Labelredaktion: ausdrückliche Leserfreigabe', () => {
  it('zeigt den gespeicherten geschlossenen Stand und öffnet beim Laden niemals automatisch', async () => {
    const { component, service } = setup();
    await settle();
    expect(component.view().readerEnabled).toBe(false);
    expect(service.setReader).not.toHaveBeenCalled();
  });
  it('öffnet erst nach bestätigter Antwort und prüft die ausdrückliche Bestätigung', async () => {
    const { component, service } = setup();
    await settle();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    await component.setReader(true);
    expect(service.setReader).not.toHaveBeenCalled();
    vi.mocked(globalThis.confirm).mockReturnValue(true);
    let complete: (value: boolean) => void = () => {
      throw new Error('Missing resolver');
    };
    service.setReader.mockReturnValueOnce(new Promise<boolean>((resolve) => (complete = resolve)));
    const opening = component.setReader(true);
    expect(component.view().readerEnabled).toBe(false);
    complete(true);
    await opening;
    expect(component.view().readerEnabled).toBe(true);
    expect(component.view().message).toMatch(/geöffnet/);
  });
  it('bewahrt den alten Schalterstand und wiederholt nur den unveränderten Auftrag', async () => {
    const { component, service } = setup();
    await settle();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    service.setReader.mockRejectedValueOnce(new LabelRpcError('network'));
    await component.setReader(true);
    const command = service.setReader.mock.calls[0][0];
    expect(component.view().readerEnabled).toBe(false);
    expect(component.hasUnsavedChanges()).toBe(true);
    await component.setReader(false);
    expect(service.setReader).toHaveBeenCalledTimes(1);
    service.setReader.mockResolvedValueOnce(true);
    await component.retry();
    expect(service.setReader.mock.calls[1][0]).toBe(command);
    expect(Object.isFrozen(command)).toBe(true);
    expect(component.view().readerEnabled).toBe(true);
  });
  it('erläutert eine fehlende Veröffentlichung ohne Öffnung vorzutäuschen', async () => {
    const { component, service } = setup();
    await settle();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    service.setReader.mockRejectedValueOnce(new LabelRpcError('validation'));
    await component.setReader(true);
    expect(component.view().readerEnabled).toBe(false);
    expect(component.view().pending).toBeNull();
    expect(component.view().error).toMatch(/Veröffentliche zuerst/);
  });
  it('verwirft eine späte Freigabeantwort nach Rollenentzug', async () => {
    const { component, service, operator } = setup();
    await settle();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    let complete: (value: boolean) => void = () => {
      throw new Error('Missing resolver');
    };
    service.setReader.mockReturnValueOnce(new Promise<boolean>((resolve) => (complete = resolve)));
    const opening = component.setReader(true);
    operator.set(false);
    expect(component.view().readerEnabled).toBeNull();
    await settle();
    complete(true);
    await opening;
    expect(component.view().readerEnabled).toBeNull();
    expect(component.view().pending).toBeNull();
    expect(component.view().message).toBeNull();
  });
});
