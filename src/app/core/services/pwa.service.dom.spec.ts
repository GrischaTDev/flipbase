import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaService } from './pwa.service';

const injectors: ReturnType<typeof Injector.create>[] = [];
function createService() {
  const injector = Injector.create({ providers: [] });
  injectors.push(injector);
  return runInInjectionContext(injector, () => new PwaService());
}
function useDevice(userAgent: string, maxTouchPoints = 0) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      controller: null,
      register: vi.fn().mockResolvedValue({}),
    }),
  });
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  for (const injector of injectors.splice(0)) injector.destroy();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'maxTouchPoints');
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

function offer(outcome: 'accepted' | 'dismissed', reject = false) {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = reject
    ? vi.fn().mockRejectedValue(new Error('failed'))
    : vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
  window.dispatchEvent(event);
  return prompt;
}

describe('PWA installation capabilities', () => {
  it('calls an available native prompt immediately and ignores repeated clicks while it is pending', async () => {
    useDevice('Android Chrome', 5);
    const service = createService();
    const event = new Event('beforeinstallprompt', { cancelable: true });
    const prompt = vi.fn(async () => undefined);
    let finish: ((choice: { outcome: string }) => void) | undefined;
    Object.assign(event, {
      prompt,
      userChoice: new Promise((resolve) => {
        finish = resolve;
      }),
    });
    window.dispatchEvent(event);
    const installing = service.startInstallation();
    expect(prompt).toHaveBeenCalledOnce();
    expect(service.installDialogOpen()).toBe(false);
    await service.startInstallation();
    expect(prompt).toHaveBeenCalledOnce();
    finish?.({ outcome: 'dismissed' });
    await installing;
    expect(service.isInstalling()).toBe(false);
    expect(service.installDialogOpen()).toBe(true);
  });
  it('remembers confirmed installation without standalone claims and accepts a fresh reinstall offer', async () => {
    useDevice('Android Chrome', 5);
    const first = createService();
    window.dispatchEvent(new Event('appinstalled'));
    expect(first.showInstallationOffer()).toBe(false);
    const next = createService();
    expect(next.showInstallationOffer()).toBe(false);
    expect(next.isStandalone()).toBe(false);
    const prompt = offer('accepted');
    expect(next.showInstallationOffer()).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    await next.startInstallation();
    expect(prompt).toHaveBeenCalledOnce();
  });
  it('opens same-page help and exposes a late offer without prompting automatically', async () => {
    useDevice('Android Chrome', 5);
    const service = createService();
    await service.startInstallation();
    expect(service.installDialogOpen()).toBe(true);
    const prompt = offer('dismissed');
    expect(prompt).not.toHaveBeenCalled();
    expect(service.isInstallable()).toBe(true);
    await service.startInstallation();
    expect(prompt).toHaveBeenCalledOnce();
    expect(service.installDialogOpen()).toBe(true);
    window.dispatchEvent(new Event('appinstalled'));
    expect(service.installDialogOpen()).toBe(false);
    expect(service.showInstallationOffer()).toBe(false);
  });
  it.each([
    ['Android phone', 'Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile', 5],
    ['Android tablet', 'Mozilla/5.0 (Linux; Android 15) Chrome/140', 5],
    ['iPad desktop mode', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605', 5],
  ])('keeps manual installation available on %s without a prompt', (_name, userAgent, touch) => {
    useDevice(userAgent, touch);
    const service = createService();
    expect(service.showInstallationOffer()).toBe(true);
    expect(service.isInstallable()).toBe(false);
    expect(service.installState()).toBe('manual');
    expect(service.installationHelp()).not.toContain('Dock');
  });
  it.each([
    ['Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140', 0],
    ['touch desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140', 5],
    ['Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605', 0],
  ])(
    'does not offer installation on %s, even when the browser sends a prompt',
    async (_name, userAgent, touch) => {
      useDevice(userAgent, touch);
      const service = createService();
      const prompt = offer('accepted');
      expect(service.showInstallationOffer()).toBe(false);
      expect(service.isInstallable()).toBe(false);
      expect(await service.promptInstall()).toBe(false);
      expect(prompt).not.toHaveBeenCalled();
    },
  );
  it('consumes the prompt once, without claiming the browser is in standalone mode', async () => {
    useDevice('Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile', 5);
    const service = createService();
    const prompt = offer('accepted');
    expect(service.installState()).toBe('prompt_available');
    expect(await service.promptInstall()).toBe(true);
    expect(await service.promptInstall()).toBe(false);
    expect(prompt).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('appinstalled'));
    expect(service.isStandalone()).toBe(false);
    expect(service.isInstalled()).toBe(true);
  });
  it.each([false, true])('clears dismissed or failed prompt (failure=%s)', async (reject) => {
    useDevice('Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile', 5);
    const service = createService();
    const prompt = offer('dismissed', reject);
    expect(await service.promptInstall()).toBe(false);
    expect(await service.promptInstall()).toBe(false);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(service.isInstallable()).toBe(false);
  });
  it('updates standalone state when display mode changes', () => {
    const media = new EventTarget();
    Object.assign(media, { matches: false });
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as MediaQueryList);
    const service = createService();
    Object.assign(media, { matches: true });
    media.dispatchEvent(new Event('change'));
    expect(service.installState()).toBe('standalone');
    expect(service.isStandalone()).toBe(true);
    expect(service.showInstallationOffer()).toBe(false);
  });
});
