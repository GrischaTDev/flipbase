import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListingExtensionService } from './listing-extension.service';

describe('ListingExtensionService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function setup() {
    const injector = Injector.create({ providers: [] });
    return runInInjectionContext(injector, () => new ListingExtensionService());
  }

  it('posts FLIPBASE_CHECK_EXTENSION on start and manual checks', () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const service = setup();

    service.start();
    service.checkNow();

    expect(postMessage).toHaveBeenCalledWith({ type: 'FLIPBASE_CHECK_EXTENSION' }, '*');
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it('finishes an unsuccessful extension check so it can be retried', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const service = setup();

    service.start();
    expect(service.checking()).toBe(true);

    vi.advanceTimersByTime(1_500);
    expect(service.available()).toBe(false);
    expect(service.checking()).toBe(false);

    service.checkNow();
    expect(service.checking()).toBe(true);
  });

  it('accepts CustomEvent and same-window message responses', () => {
    const service = setup();
    service.start();

    window.dispatchEvent(new Event('flipbase:extension-ready'));
    expect(service.available()).toBe(true);

    service.available.set(false);
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: { type: 'FLIPBASE_EXTENSION_READY' },
      }),
    );
    expect(service.available()).toBe(true);
  });

  it('requires a fresh response on a manual recheck', () => {
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const service = setup();
    service.start();
    window.dispatchEvent(new Event('flipbase:extension-ready'));

    service.checkNow();

    expect(service.available()).toBe(false);
    window.dispatchEvent(new Event('flipbase:extension-ready'));
    expect(service.available()).toBe(true);
    expect(service.checking()).toBe(false);
  });

  it('ignores messages from another source and publishes the unchanged payload', () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const service = setup();
    service.start();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'FLIPBASE_EXTENSION_READY' },
      }),
    );
    expect(service.available()).toBe(false);

    const payload = {
      itemId: 'item-1',
      title: 'Titel',
      description: 'Beschreibung',
      price: 10,
      priceType: 'FIXED' as const,
      shippingType: 'pickup' as const,
      images: [],
    };
    service.available.set(true);
    void service.publish(payload);

    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'FLIPBASE_PUBLISH_KLEINANZEIGEN', payload }),
      '*',
    );
  });

  it('waits for the matching extension response before reporting success', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const service = setup();
    service.start();
    service.available.set(true);
    const pending = service.publish({
      itemId: 'item-1',
      title: 'Titel',
      description: '',
      price: 10,
      priceType: 'FIXED',
      shippingType: 'pickup',
      images: [],
    });
    const request = postMessage.mock.lastCall?.[0] as { requestId: string };
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          type: 'FLIPBASE_PUBLISH_KLEINANZEIGEN_RESULT',
          requestId: request.requestId,
          success: false,
          error: 'Tab konnte nicht geöffnet werden.',
        },
      }),
    );
    await expect(pending).resolves.toEqual({
      success: false,
      error: 'Tab konnte nicht geöffnet werden.',
    });
  });
});
