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
    service.publish(payload);

    expect(postMessage).toHaveBeenLastCalledWith(
      { type: 'FLIPBASE_PUBLISH_KLEINANZEIGEN', payload },
      '*',
    );
  });
});
