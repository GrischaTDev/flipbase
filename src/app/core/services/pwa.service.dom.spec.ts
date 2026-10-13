import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PwaService } from './pwa.service';

const injectors: ReturnType<typeof Injector.create>[] = [];
function createService() {
  const injector = Injector.create({ providers: [] });
  injectors.push(injector);
  return runInInjectionContext(injector, () => new PwaService());
}
afterEach(() => {
  for (const injector of injectors.splice(0)) injector.destroy();
  vi.restoreAllMocks();
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
  it('consumes the prompt once, without claiming the browser is in standalone mode', async () => {
    const service = createService();
    const prompt = offer('accepted');
    expect(service.installState()).toBe('prompt_available');
    expect(await service.promptInstall()).toBe(true);
    expect(await service.promptInstall()).toBe(false);
    expect(prompt).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('appinstalled'));
    expect(service.isStandalone()).toBe(false);
    expect(service.isInstalled()).toBe(false);
  });
  it.each([false, true])('clears dismissed or failed prompt (failure=%s)', async (reject) => {
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
  });
});
