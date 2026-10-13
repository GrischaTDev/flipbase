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
});
function receive(type: string) {
  navigator.serviceWorker.dispatchEvent(
    Object.assign(new Event('message'), {
      source: waiting,
      data: { type, buildId: 'a'.repeat(64), attemptId: 'attempt' },
    }),
  );
}
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
