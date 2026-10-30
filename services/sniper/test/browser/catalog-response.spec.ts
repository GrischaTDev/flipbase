import type { Page } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCatalogResponse } from '../../src/browser/catalog-response.js';

const url = new URL('https://www.vinted.de/catalog?brand_ids=53');
const page = {
  evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
} as unknown as Page;
let worker: { controller: object | null };
beforeEach(() => {
  worker = { controller: null };
  vi.stubGlobal('location', { origin: url.origin });
  vi.stubGlobal('navigator', { serviceWorker: worker });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catalog response inside the existing browser page', () => {
  it('requests a same-origin GET without cache or automatic redirects and removes wire-only headers', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('catalog', {
          headers: {
            'content-encoding': 'gzip',
            'content-length': '123',
            'set-cookie': 'secret=private',
            'retry-after': '60',
          },
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await readCatalogResponse(page, url, new AbortController().signal);
    expect(await result?.text()).toBe('catalog');
    expect(fetch).toHaveBeenCalledWith(
      url.href,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'manual',
      }),
    );
    expect(result?.headers.get('content-encoding')).toBeNull();
    expect(result?.headers.get('content-length')).toBeNull();
    expect(result?.headers.get('set-cookie')).toBeNull();
    expect(result?.headers.get('retry-after')).toBe('60');
    expect(Object.keys(globalThis).filter((key) => key.startsWith('__flipbaseCatalog_'))).toEqual(
      [],
    );
  });

  it('refuses a controlling service worker before starting any fetch', async () => {
    worker.controller = {};
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      readCatalogResponse(page, url, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'network_error' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a worker which takes control while the response body is being read', async () => {
    let read = false;
    vi.stubGlobal('fetch', async () => ({
      type: 'basic',
      status: 200,
      headers: new Headers(),
      body: {
        getReader: () => ({
          read: async () => {
            if (read) return { done: true };
            read = true;
            worker.controller = {};
            return { done: false, value: new TextEncoder().encode('stale') };
          },
          cancel: async () => undefined,
        }),
      },
    }));
    await expect(
      readCatalogResponse(page, url, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'network_error' });
  });

  it('returns an opaque redirect for guarded navigation without following it', async () => {
    vi.stubGlobal('fetch', async () => ({ type: 'opaqueredirect', status: 0 }));
    expect(await readCatalogResponse(page, url, new AbortController().signal)).toBeNull();
  });

  it('does not fetch from a page on another origin', async () => {
    vi.stubGlobal('location', { origin: 'https://foreign.test' });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await readCatalogResponse(page, url, new AbortController().signal)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('classifies native fetch transport failures without exposing their message', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch https://private.test/?token=secret');
    });
    await expect(
      readCatalogResponse(page, url, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'network_error', message: 'Browserabruf fehlgeschlagen.' });
  });

  it('stops and cancels a body exceeding eight MiB', async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
            },
            cancel,
          }),
        ),
    );
    await expect(readCatalogResponse(page, url, new AbortController().signal)).rejects.toThrow(
      'zu groß',
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('aborts the actual browser fetch, deletes its controller and allows a fresh request', async () => {
    let activeSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      (_input: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          activeSignal = init.signal!;
          activeSignal.addEventListener('abort', () => reject(activeSignal?.reason), {
            once: true,
          });
        }),
    );
    const controller = new AbortController();
    const pending = readCatalogResponse(page, url, controller.signal);
    const rejected = expect(pending).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(activeSignal).toBeDefined());
    controller.abort(new Error('cancelled'));
    await rejected;
    expect(activeSignal?.aborted).toBe(true);
    expect(Object.keys(globalThis).filter((key) => key.startsWith('__flipbaseCatalog_'))).toEqual(
      [],
    );
    vi.stubGlobal('fetch', async () => new Response('fresh'));
    expect(await (await readCatalogResponse(page, url, new AbortController().signal))?.text()).toBe(
      'fresh',
    );
  });
});
