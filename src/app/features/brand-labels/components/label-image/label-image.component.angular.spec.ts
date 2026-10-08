import { signal, ɵresolveComponentResources } from '@angular/core';
import { glob, readFile } from 'node:fs/promises';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceAccessService } from '../../../../core/services/workspace-access.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { LabelMediaService } from '../../services/label-media.service';
import { LabelImageComponent } from './label-image.component';
beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const matches: string[] = [];
    for await (const path of glob('src/app/**/' + (url.startsWith('./') ? url.slice(2) : url)))
      matches.push(path);
    if (matches.length !== 1) throw new Error('Ambiguous test resource: ' + url);
    return readFile(matches[0], 'utf8');
  });
});
interface Bindings {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}
function metadataOf(component: unknown): Bindings {
  const typed = component as { ɵcmp?: Bindings };
  if (!typed.ɵcmp) throw new Error('Missing component metadata');
  return typed.ɵcmp;
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Missing resolver');
  };
  const promise = new Promise<T>((complete) => (resolve = complete));
  return { promise, resolve };
}
async function setup() {
  const user = signal<{ id: string } | null>({ id: 'user-a' });
  const workspace = signal({ id: 'workspace-a' });
  const access = signal([{ workspace_id: 'workspace-a', access_status: 'active' }]);
  const operator = signal(false);
  const service = { signedUrl: vi.fn().mockResolvedValue('https://example.com/private-a.png') };
  TestBed.configureTestingModule({
    imports: [LabelImageComponent],
    providers: [
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: WorkspaceAccessService, useValue: { access } },
      { provide: PlatformOperatorService, useValue: { operator } },
      { provide: LabelMediaService, useValue: service },
    ],
  });
  TestBed.overrideComponent(LabelImageComponent, { set: { template: '', imports: [] } });
  await TestBed.compileComponents();
  const metadata = metadataOf(LabelImageComponent);
  metadata.inputs = { ...metadata.inputs, assetId: ['assetId', 1, null], alt: ['alt', 1, null] };
  metadata.declaredInputs = { ...metadata.declaredInputs, assetId: 'assetId', alt: 'alt' };
  const fixture = TestBed.createComponent(LabelImageComponent);
  fixture.componentRef.setInput('assetId', 1);
  fixture.componentRef.setInput('alt', 'Referenzbild');
  return {
    fixture,
    component: fixture.componentInstance,
    service,
    user,
    workspace,
    access,
    operator,
  };
}
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 8; index++) await Promise.resolve();
  TestBed.tick();
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('LabelImageComponent: kurzlebige private Bild-URLs', () => {
  it('bindet die Vergrößerung an den aktuellen Zugang und schützt sie auch beim Refresh', async () => {
    vi.useFakeTimers();
    const { fixture, component, user } = await setup();
    fixture.detectChanges();
    await settle();
    component.enlarge();
    expect(component.expanded()).toBe(true);
    await vi.advanceTimersByTimeAsync(45000);
    await settle();
    expect(component.expanded()).toBe(true);
    component.close();
    expect(component.expanded()).toBe(false);
    component.enlarge();
    user.set(null);
    expect(component.expanded()).toBe(false);
    await settle();
    user.set({ id: 'user-a' });
    await settle();
    expect(component.expanded()).toBe(false);
  });
  it('lädt private URLs und entfernt sie beim Abmelden unmittelbar', async () => {
    const { fixture, component, service, user } = await setup();
    fixture.detectChanges();
    await settle();
    expect(service.signedUrl).toHaveBeenCalledWith(1);
    expect(component.src()).toBe('https://example.com/private-a.png');
    user.set(null);
    expect(component.src()).toBeNull();
    await settle();
    expect(component.src()).toBeNull();
  });
  it('verwirft eine alte Workspaceantwort und zeigt keine fremde URL', async () => {
    const { fixture, component, service, workspace, access } = await setup();
    const old = deferred<string | null>();
    service.signedUrl
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce('https://example.com/private-b.png');
    fixture.detectChanges();
    await settle();
    access.set([{ workspace_id: 'workspace-b', access_status: 'active' }]);
    workspace.set({ id: 'workspace-b' });
    expect(component.src()).toBeNull();
    await settle();
    old.resolve('https://example.com/private-a.png');
    await settle();
    expect(component.src()).toBe('https://example.com/private-b.png');
  });
  it('entfernt URLs bei abgelaufenem Workspacezugang ohne weiteren Storageaufruf', async () => {
    const { fixture, component, service, access } = await setup();
    fixture.detectChanges();
    await settle();
    access.set([{ workspace_id: 'workspace-a', access_status: 'expired' }]);
    expect(component.src()).toBeNull();
    await settle();
    expect(service.signedUrl).toHaveBeenCalledTimes(1);
  });
  it('erneuert nach 45 Sekunden und beendet den Timer nach Zerstörung', async () => {
    vi.useFakeTimers();
    const { fixture, component, service } = await setup();
    fixture.detectChanges();
    await settle();
    service.signedUrl.mockResolvedValueOnce('https://example.com/renewed.png');
    await vi.advanceTimersByTimeAsync(45000);
    await settle();
    expect(service.signedUrl).toHaveBeenCalledTimes(2);
    expect(component.src()).toBe('https://example.com/renewed.png');
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(90000);
    expect(service.signedUrl).toHaveBeenCalledTimes(2);
    expect(component.src()).toBeNull();
  });
  it('verwirft die verspätete Erst-URL nach einer neueren Timerantwort', async () => {
    vi.useFakeTimers();
    const { fixture, component, service } = await setup();
    const old = deferred<string | null>();
    service.signedUrl
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce('https://example.com/new.png');
    fixture.detectChanges();
    await settle();
    await vi.advanceTimersByTimeAsync(45000);
    await settle();
    expect(component.src()).toBe('https://example.com/new.png');
    old.resolve('https://example.com/old.png');
    await settle();
    expect(component.src()).toBe('https://example.com/new.png');
  });
  it('übernimmt keine ausstehende URL nach Zerstörung', async () => {
    const { fixture, component, service } = await setup();
    const pending = deferred<string | null>();
    service.signedUrl.mockReturnValueOnce(pending.promise);
    fixture.detectChanges();
    await settle();
    fixture.destroy();
    pending.resolve('https://example.com/late.png');
    await settle();
    expect(component.src()).toBeNull();
  });
});
