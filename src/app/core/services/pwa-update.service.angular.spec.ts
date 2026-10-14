import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChildrenOutletContexts } from '@angular/router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
    providers: [
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
