import '@angular/compiler';
import { signal } from '@angular/core';
import { prepareMarketplaceRendering } from '../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { ModalDialogDirective } from '../../shared/directives/modal-dialog.directive';
import { TestBed } from '@angular/core/testing';
import { ChildrenOutletContexts } from '@angular/router';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PwaUpdateNoticeComponent } from '../../shared/components/pwa-update-notice/pwa-update-notice.component';
import { PushNavigationService } from './push-navigation.service';
import { WorkspaceContextLockService } from './workspace-context-lock.service';
import { PwaUpdateService } from './pwa-update.service';
import { PwaService } from './pwa.service';
import { environment } from '../../../environments/environment';

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
    { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
  ]);
});
afterAll(() => restoreRendering?.());
beforeEach(async () => {
  registration.update.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(registration, 'waiting', { configurable: true, value: waiting });
  Object.defineProperty(registration, 'installing', { configurable: true, value: null });
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
  await service.checkForUpdate();
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
it('keeps activation pending when the update screen is tapped again', async () => {
  receive('PWA_WAITING_STATUS');
  const fixture = TestBed.createComponent(PwaUpdateNoticeComponent);
  fixture.detectChanges();
  const result = service.applyUpdate();
  const attempt = waiting.postMessage.mock.calls.find(
    ([message]) => message.type === 'ACTIVATE_UPDATE',
  )?.[0];
  receive('PWA_PREPARE_UPDATE', { attemptId: attempt.attemptId });
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  waiting.postMessage.mockClear();
  const screen = fixture.nativeElement.querySelector('[data-pwa-update-screen]') as HTMLElement;
  for (const target of [button, screen]) {
    for (const type of ['pointerdown', 'click', 'keydown']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  }
  expect(waiting.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'PWA_UPDATE_REVOKE' }),
  );
  receive('PWA_COMMIT_UPDATE', { attemptId: attempt.attemptId });
  expect(waiting.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'PWA_UPDATE_COMMIT_ACK', safe: true }),
  );
  // Einen echten Änderungsversuch weiterhin blockieren und die Sperre aufheben.
  document.dispatchEvent(new Event('beforeinput', { cancelable: true }));
  expect(waiting.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'PWA_UPDATE_REVOKE' }),
  );
  receive('PWA_UPDATE_RESULT', { attemptId: attempt.attemptId, result: 'blocked' });
  expect(await result).toBe('blocked');
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

it('checks again on return within a minute and also when a suspended page is restored', async () => {
  await service.checkForUpdate();
  registration.update.mockClear();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  expect(registration.update).toHaveBeenCalledOnce();
  await service.checkForUpdate();
  registration.update.mockClear();
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  await Promise.resolve();
  expect(registration.update).toHaveBeenCalledOnce();
});

it('shows a bounded check after a long background pause, then releases the screen on timeout', async () => {
  vi.useFakeTimers();
  await service.checkForUpdate();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(61_000);
  registration.update.mockImplementation(() => new Promise(() => undefined));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  const fixture = TestBed.createComponent(PwaUpdateNoticeComponent);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Suche nach Aktualisierungen');
  await vi.advanceTimersByTimeAsync(8000);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[aria-modal="true"]')).toBeNull();
  expect(fixture.nativeElement.textContent).toContain('Erneut prüfen');
});

it('finishes the check while a slow update keeps downloading and offers it when ready', async () => {
  vi.useFakeTimers();
  const installing = Object.assign(new EventTarget(), {
    state: 'installing',
    postMessage: vi.fn(),
  });
  Object.defineProperty(registration, 'waiting', { configurable: true, value: null });
  Object.defineProperty(registration, 'installing', { configurable: true, value: installing });
  registration.dispatchEvent(new Event('updatefound'));
  const check = service.checkForUpdate({ force: true, showScreen: true });
  await vi.advanceTimersByTimeAsync(8100);
  await check;
  expect(service.checkError()).toBe('');
  expect(service.checkingForUpdate()).toBe(false);
  expect(service.updateAvailable()).toBe(false);
  installing.state = 'installed';
  Object.defineProperty(registration, 'waiting', { configurable: true, value: installing });
  installing.dispatchEvent(new Event('statechange'));
  expect(installing.postMessage).toHaveBeenCalledWith({ type: 'PWA_UPDATE_QUERY' });
  navigator.serviceWorker.dispatchEvent(
    Object.assign(new Event('message'), {
      source: installing,
      data: { type: 'PWA_WAITING_STATUS', buildId: 'a'.repeat(64), version: '0.42.8' },
    }),
  );
  expect(service.updateAvailable()).toBe(true);
  expect(service.availableVersion()).toBe('0.42.8');
});

it('shows a mandatory full update screen without postponing and keeps open entries accessible', () => {
  receive('PWA_WAITING_STATUS');
  const fixture = TestBed.createComponent(PwaUpdateNoticeComponent);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[aria-modal="true"]')).not.toBeNull();
  expect(fixture.nativeElement.textContent).not.toContain('Später');
  expect(fixture.nativeElement.querySelector('img')?.getAttribute('alt')).toBe('Flipbase');
  locked.set(true);
  fixture.changeDetectorRef.markForCheck();
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[aria-modal="true"]')).toBeNull();
  expect(fixture.nativeElement.textContent).toContain('Speichere');
  locked.set(false);
  fixture.changeDetectorRef.markForCheck();
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[aria-modal="true"]')).not.toBeNull();
});

it('leaves an unsaved form reachable when an update arrives', async () => {
  dirty.mockReturnValue(true);
  receive('PWA_WAITING_STATUS');
  const fixture = TestBed.createComponent(PwaUpdateNoticeComponent);
  fixture.detectChanges();
  expect(service.hasOpenChanges()).toBe(true);
  expect(fixture.nativeElement.querySelector('[aria-modal="true"]')).toBeNull();
  expect(fixture.nativeElement.textContent).toContain('Speichere');
  expect(await service.applyUpdate()).toBe('blocked');
});

it('still checks the server when a sleeping worker no longer accepts status messages', async () => {
  waiting.postMessage.mockImplementationOnce(() => {
    throw new DOMException('worker stopped', 'InvalidStateError');
  });
  registration.update.mockClear();
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  await service.checkForUpdate();
  expect(registration.update).toHaveBeenCalledOnce();
});

it('bundles simultaneous return events into one network check and can retry after a failure', async () => {
  let finish: (() => void) | undefined;
  registration.update.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  registration.update.mockClear();
  window.dispatchEvent(new Event('focus'));
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  expect(registration.update).toHaveBeenCalledOnce();
  finish?.();
  await service.checkForUpdate();
  registration.update.mockRejectedValueOnce(new Error('offline'));
  window.dispatchEvent(new Event('online'));
  await service.checkForUpdate();
  const fixture = TestBed.createComponent(PwaUpdateNoticeComponent);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Erneut prüfen');
  await service.checkForUpdate({ force: true });
  expect(service.checkError()).toBe('');
});

it('protects a dirty legacy form without route guards and reopens the update screen after leaving it', async () => {
  const form = document.createElement('form');
  form.classList.add('ng-dirty');
  document.body.append(form);
  try {
    receive('PWA_WAITING_STATUS');
    const fixture = TestBed.createComponent(PwaUpdateNoticeComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-modal="true"]')).toBeNull();
    expect(await service.applyUpdate()).toBe('blocked');
    form.remove();
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[aria-modal="true"]')).not.toBeNull();
      },
      { timeout: 2000 },
    );
  } finally {
    form.remove();
  }
});

it('retries a failed initial registration when returning online', async () => {
  const production = environment.production;
  environment.production = true;
  const register = vi
    .fn()
    .mockRejectedValueOnce(new Error('temporary 503'))
    .mockResolvedValue(registration);
  Object.assign(navigator.serviceWorker, { register });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      PwaUpdateService,
      PwaService,
      { provide: WorkspaceContextLockService, useValue: { locked } },
    ],
  });
  try {
    service = TestBed.inject(PwaUpdateService);
    const pwa = TestBed.inject(PwaService);
    await pwa.registerServiceWorker();
    expect(service.checkError()).not.toBe('');
    window.dispatchEvent(new Event('online'));
    await service.checkForUpdate();
    expect(register).toHaveBeenCalledTimes(2);
    expect(service.checkError()).toBe('');
  } finally {
    environment.production = production;
  }
});

it('blocks activation while a pristine legacy form is saving', async () => {
  const form = document.createElement('form');
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.setAttribute('aria-busy', 'true');
  form.append(submit);
  document.body.append(form);
  try {
    receive('PWA_WAITING_STATUS');
    expect(await service.applyUpdate()).toBe('blocked');
  } finally {
    form.remove();
  }
});

it('keeps standalone Angular controls outside a form accessible', async () => {
  const input = document.createElement('input');
  input.classList.add('ng-dirty');
  input.value = 'Neuer Workspace';
  document.body.append(input);
  try {
    receive('PWA_WAITING_STATUS');
    expect(await service.applyUpdate()).toBe('blocked');
    expect(input.value).toBe('Neuer Workspace');
  } finally {
    input.remove();
  }
});

it('retries a same-document worker handover when a temporary busy state ends', async () => {
  const busy = document.createElement('button');
  busy.setAttribute('aria-busy', 'true');
  document.body.append(busy);
  try {
    receive('PWA_WAITING_STATUS', { buildId: 'b'.repeat(64) });
    expect(waiting.postMessage).not.toHaveBeenCalled();
    waiting.postMessage.mockImplementation((message) => {
      if (message.type === 'PWA_UPDATE_QUERY')
        receive('PWA_WAITING_STATUS', { buildId: 'b'.repeat(64) });
    });
    busy.remove();
    await vi.waitFor(
      () =>
        expect(waiting.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'ACTIVATE_UPDATE' }),
        ),
      { timeout: 2000 },
    );
  } finally {
    busy.remove();
    waiting.postMessage.mockReset();
  }
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
