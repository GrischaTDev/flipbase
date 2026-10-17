import '@angular/compiler';
import { signal } from '@angular/core';
import { prepareMarketplaceRendering } from '../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { TestBed } from '@angular/core/testing';
import { ChildrenOutletContexts } from '@angular/router';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PwaUpdateNoticeComponent } from '../../shared/components/pwa-update-notice/pwa-update-notice.component';
import { PushNavigationService } from './push-navigation.service';
import { WorkspaceContextLockService } from './workspace-context-lock.service';
import { PwaUpdateService } from './pwa-update.service';

const locked = signal(false);
const dirty = vi.fn(() => false);
const waiting = { postMessage: vi.fn() };
let service: PwaUpdateService;
const registration = Object.assign(new EventTarget(), {
  waiting,
  installing: null,
  update: vi.fn().mockResolvedValue(undefined),
});
let restoreRendering: (() => void) | undefined;
beforeAll(async () => {
  restoreRendering = await prepareMarketplaceRendering([
    {
      type: PwaUpdateNoticeComponent,
      path: 'src/app/shared/components/pwa-update-notice/pwa-update-notice.component.ts',
    },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
  ]);
});
afterAll(() => restoreRendering?.());
beforeEach(() => {
  Object.defineProperty(registration, 'waiting', { configurable: true, value: waiting });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: new EventTarget(),
  });
  document.documentElement.dataset['flipbaseBuild'] = 'b'.repeat(64);
  locked.set(false);
  dirty.mockReturnValue(false);
  waiting.postMessage.mockClear();
  TestBed.configureTestingModule({
    imports: [PwaUpdateNoticeComponent],
    providers: [
      { provide: PushNavigationService, useValue: { pending: signal(false) } },
      PwaUpdateService,
      { provide: WorkspaceContextLockService, useValue: { locked } },
      {
        provide: ChildrenOutletContexts,
        useValue: {
          getContext: () => ({
            outlet: { isActivated: true, component: { hasUnsavedChanges: dirty } },
            children: { getContext: () => null },
          }),
        },
      },
    ],
  });
  service = TestBed.inject(PwaUpdateService);
  service.connect(registration as unknown as ServiceWorkerRegistration);
  waiting.postMessage.mockClear();
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('releases a nonresponding worker and explains how to retry', async () => {
  vi.useFakeTimers();
  receive('PWA_WAITING_STATUS');
  const result = service.applyUpdate();
  await vi.advanceTimersByTimeAsync(8000);
  expect(await result).toBe('failed');
  expect(service.isApplying()).toBe(false);
  expect(service.message()).toMatch(/nicht geantwortet/);
});
it('does not send the previous build ID to a replacement waiting worker', async () => {
  receive('PWA_WAITING_STATUS');
  const replacement = { postMessage: vi.fn() };
  Object.defineProperty(registration, 'waiting', { configurable: true, value: replacement });
  expect(await service.applyUpdate()).toBe('failed');
  expect(service.updateAvailable()).toBe(false);
  expect(replacement.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'PWA_UPDATE_QUERY' });
});
function receive(type: string, details: Record<string, unknown> = {}) {
  navigator.serviceWorker.dispatchEvent(
    Object.assign(new Event('message'), {
      source: waiting,
      data: { type, buildId: 'a'.repeat(64), attemptId: 'attempt', ...details },
    }),
  );
}
it('offers an update only after the waiting worker confirms a different build', () => {
  expect(service.updateAvailable()).toBe(false);
  receive('PWA_WAITING_STATUS');
  expect(service.updateAvailable()).toBe(true);
});
it('keeps an update offer for an old document after another tab activated the new worker', async () => {
  const active = { postMessage: vi.fn() };
  Object.assign(navigator.serviceWorker, { controller: active });
  Object.defineProperty(registration, 'waiting', { configurable: true, value: null });
  navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(active.postMessage).toHaveBeenCalledWith({ type: 'PWA_ACTIVE_QUERY' });
  navigator.serviceWorker.dispatchEvent(
    Object.assign(new Event('message'), {
      source: active,
      data: { type: 'PWA_ACTIVE_STATUS', buildId: 'a'.repeat(64) },
    }),
  );
  expect(service.updateAvailable()).toBe(true);
  await service.checkForUpdate();
  expect(service.updateAvailable()).toBe(true);
  dirty.mockReturnValue(true);
  expect(await service.applyUpdate()).toBe('blocked');
});
it('checks for a new version periodically while the current tab stays visible', async () => {
  vi.useFakeTimers();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [PwaUpdateService, { provide: WorkspaceContextLockService, useValue: { locked } }],
  });
  service = TestBed.inject(PwaUpdateService);
  registration.update.mockClear();
  service.connect(registration as unknown as ServiceWorkerRegistration);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(registration.update).toHaveBeenCalled();
  const calls = registration.update.mock.calls.length;
  TestBed.resetTestingModule();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(registration.update).toHaveBeenCalledTimes(calls);
});
it('accepts active build reports only from the controller and clears an already current offer', () => {
  const active = { postMessage: vi.fn() };
  Object.assign(navigator.serviceWorker, { controller: active });
  Object.defineProperty(registration, 'waiting', { configurable: true, value: null });
  navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  const report = (source: unknown, buildId: string) =>
    navigator.serviceWorker.dispatchEvent(
      Object.assign(new Event('message'), { source, data: { type: 'PWA_ACTIVE_STATUS', buildId } }),
    );
  report(waiting, 'a'.repeat(64));
  expect(service.updateAvailable()).toBe(false);
  report(active, 'a'.repeat(64));
  expect(service.updateAvailable()).toBe(true);
  report(active, 'b'.repeat(64));
  expect(service.updateAvailable()).toBe(false);
});
it('does not describe the already loaded build as a new version during legacy worker handover', () => {
  receive('PWA_WAITING_STATUS', { buildId: 'b'.repeat(64) });
  expect(service.updateAvailable()).toBe(false);
  expect(waiting.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'ACTIVATE_UPDATE' }),
  );
});
it('never silently takes over a same-build worker while the loaded page has unsaved input', () => {
  dirty.mockReturnValue(true);
  receive('PWA_WAITING_STATUS', { buildId: 'b'.repeat(64) });
  expect(service.updateAvailable()).toBe(false);
  expect(waiting.postMessage).not.toHaveBeenCalled();
});
it('retries a blocked legacy handover when the current view resumes, without requiring reload', async () => {
  receive('PWA_WAITING_STATUS', { buildId: 'b'.repeat(64) });
  const first = waiting.postMessage.mock.calls.find(
    ([message]) => message.type === 'ACTIVATE_UPDATE',
  )?.[0];
  receive('PWA_PREPARE_UPDATE', { buildId: 'b'.repeat(64), attemptId: first.attemptId });
  receive('PWA_UPDATE_RESULT', {
    buildId: 'b'.repeat(64),
    attemptId: first.attemptId,
    result: 'blocked',
  });
  await Promise.resolve();
  await service.checkForUpdate();
  receive('PWA_WAITING_STATUS', { buildId: 'b'.repeat(64) });
  expect(
    waiting.postMessage.mock.calls.filter(([message]) => message.type === 'ACTIVATE_UPDATE'),
  ).toHaveLength(2);
  expect(service.updateAvailable()).toBe(false);
});
it('clears the update offer when the waiting worker has activated elsewhere', () => {
  receive('PWA_WAITING_STATUS');
  Object.defineProperty(registration, 'waiting', { configurable: true, value: null });
  navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(service.updateAvailable()).toBe(false);
  Object.defineProperty(registration, 'waiting', { configurable: true, value: waiting });
});
it('reports a missing worker response instead of making the update click a silent no-op', async () => {
  expect(await service.applyUpdate()).toBe('failed');
  expect(service.message()).toMatch(/vorbereitet|erneut/);
});
it('explains a blocked suspended view even when that view never sent a preparation ACK', async () => {
  receive('PWA_WAITING_STATUS');
  const result = service.applyUpdate();
  const attempt = waiting.postMessage.mock.calls.find(
    ([message]) => message.type === 'ACTIVATE_UPDATE',
  )?.[0];
  expect(attempt).toBeDefined();
  receive('PWA_UPDATE_RESULT', { attemptId: attempt.attemptId, result: 'blocked' });
  expect(await result).toBe('blocked');
  expect(service.message()).toMatch(/Ansichten|Tabs/);
  expect(service.isApplying()).toBe(false);
});
it('blocks an update while workspace context is locked or an existing page reports dirty state', async () => {
  locked.set(true);
  expect(await service.applyUpdate()).toBe('blocked');
  locked.set(false);
  dirty.mockReturnValue(true);
  expect(await service.applyUpdate()).toBe('blocked');
  expect(waiting.postMessage).not.toHaveBeenCalled();
});
it('acknowledges the target attempt, then revokes and prevents edits during the activation barrier', () => {
  receive('PWA_PREPARE_UPDATE');
  expect(waiting.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'PWA_UPDATE_ACK', attemptId: 'attempt', safe: true }),
  );
  const input = new Event('beforeinput', { cancelable: true });
  document.dispatchEvent(input);
  expect(input.defaultPrevented).toBe(true);
  expect(waiting.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'PWA_UPDATE_REVOKE', attemptId: 'attempt' }),
  );
});
it('rechecks dirty/saving state on commit and releases a blocked attempt', () => {
  receive('PWA_PREPARE_UPDATE');
  dirty.mockReturnValue(true);
  receive('PWA_COMMIT_UPDATE');
  expect(waiting.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'PWA_UPDATE_COMMIT_ACK', safe: false }),
  );
  navigator.serviceWorker.dispatchEvent(
    Object.assign(new Event('message'), {
      source: waiting,
      data: {
        type: 'PWA_UPDATE_RESULT',
        buildId: 'a'.repeat(64),
        attemptId: 'attempt',
        result: 'blocked',
      },
    }),
  );
  expect(service.isApplying()).toBe(false);
});

it('keeps the initiating update closed while stale waiting reports arrive during reload', async () => {
  receive('PWA_WAITING_STATUS');
  const fixture = TestBed.createComponent(PwaUpdateNoticeComponent);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('section')).not.toBeNull();
  const result = service.applyUpdate();
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('button')?.disabled).toBe(true);
  const attempt = waiting.postMessage.mock.calls.find(
    ([message]) => message.type === 'ACTIVATE_UPDATE',
  )?.[0];
  receive('PWA_PREPARE_UPDATE', { attemptId: attempt.attemptId });
  receive('PWA_UPDATE_RESULT', { attemptId: attempt.attemptId, result: 'applied' });
  Object.assign(navigator.serviceWorker, { controller: waiting });
  const reload = vi.fn();
  vi.stubGlobal('window', { location: { reload } });
  try {
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(await result).toBe('applied');
    expect(service.updateAvailable()).toBe(false);
    expect(service.isApplying()).toBe(true);
    receive('PWA_WAITING_STATUS');
    receive('PWA_ACTIVE_STATUS');
    expect(service.updateAvailable()).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});
it('shows the confirmed waiting version instead of the version of the loaded document', () => {
  receive('PWA_WAITING_STATUS', { version: '0.42.7' });
  expect(service.availableVersion()).toBe('0.42.7');
  const fixture = TestBed.createComponent(PwaUpdateNoticeComponent);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Flipbase 0.42.7 ist bereit.');
  const replacement = { postMessage: vi.fn() };
  Object.defineProperty(registration, 'waiting', { configurable: true, value: replacement });
  void service.checkForUpdate();
  expect(service.availableVersion()).toBe('');
});
it('accepts legacy workers without version metadata without claiming the loaded version', () => {
  receive('PWA_WAITING_STATUS');
  expect(service.updateAvailable()).toBe(true);
  expect(service.availableVersion()).toBe('');
});

it('keeps the newer waiting version when the active worker reports an older update', () => {
  const active = { postMessage: vi.fn() };
  Object.assign(navigator.serviceWorker, { controller: active });
  receive('PWA_WAITING_STATUS', { version: '0.42.7' });
  navigator.serviceWorker.dispatchEvent(
    Object.assign(new Event('message'), {
      source: active,
      data: { type: 'PWA_ACTIVE_STATUS', buildId: 'c'.repeat(64), version: '0.41.0' },
    }),
  );
  expect(service.availableVersion()).toBe('0.42.7');
  Object.defineProperty(registration, 'waiting', { configurable: true, value: null });
  void service.checkForUpdate();
  expect(service.availableVersion()).toBe('0.41.0');
});
it('never displays malformed or foreign waiting version metadata', () => {
  navigator.serviceWorker.dispatchEvent(
    Object.assign(new Event('message'), {
      source: { postMessage: vi.fn() },
      data: { type: 'PWA_WAITING_STATUS', buildId: 'a'.repeat(64), version: '9.9.9' },
    }),
  );
  expect(service.availableVersion()).toBe('');
  receive('PWA_WAITING_STATUS', { version: '<b>0.42.7</b>' });
  expect(service.availableVersion()).toBe('');
  expect(service.updateAvailable()).toBe(true);
});

it('does not offer the older controller build during a same-document worker handover', () => {
  const active = { postMessage: vi.fn() };
  Object.assign(navigator.serviceWorker, { controller: active });
  receive('PWA_WAITING_STATUS', { buildId: 'b'.repeat(64), version: '0.42.7' });
  navigator.serviceWorker.dispatchEvent(
    Object.assign(new Event('message'), {
      source: active,
      data: { type: 'PWA_ACTIVE_STATUS', buildId: 'c'.repeat(64), version: '0.41.0' },
    }),
  );
  expect(service.updateAvailable()).toBe(false);
});
