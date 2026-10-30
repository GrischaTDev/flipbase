import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import { VintedNetworkError } from '../vinted/errors.js';
import { BrowserCleanup } from './browser-cleanup.js';
import { abortableBrowserOperation } from './request-abort.js';

type CatalogResult =
  | { kind: 'response'; status: number; headers: [string, string][]; body: string }
  | { kind: 'document-required' }
  | { kind: 'service-worker' }
  | { kind: 'network' }
  | { kind: 'too-large' };

/** null verlangt genau den bisherigen, streng begrenzten Navigationsweg. */
export async function readCatalogResponse(
  page: Page,
  url: URL,
  signal: AbortSignal,
  cleanup = new BrowserCleanup(),
): Promise<Response | null> {
  signal.throwIfAborted();
  const key = `__flipbaseCatalog_${randomUUID()}`;
  let finished = false;
  try {
    const result: CatalogResult = await abortableBrowserOperation(
      page.evaluate(
        async ({ target, key }): Promise<CatalogResult> => {
          if (new URL(target).origin !== location.origin) return { kind: 'document-required' };
          // Ein steuernder Worker kann trotz no-store aus seinem eigenen Cache antworten.
          if (navigator.serviceWorker?.controller) return { kind: 'service-worker' };
          const state = globalThis as unknown as Record<string, AbortController | undefined>;
          const controller = new AbortController();
          state[key] = controller;
          let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
          try {
            const response = await fetch(target, {
              method: 'GET',
              credentials: 'same-origin',
              redirect: 'manual',
              cache: 'no-store',
              headers: { accept: 'text/html,application/xhtml+xml' },
              signal: controller.signal,
            });
            if (response.type === 'opaqueredirect' || response.status === 0)
              return { kind: 'document-required' };
            if (navigator.serviceWorker?.controller) return { kind: 'service-worker' };
            if (response.url && new URL(response.url).origin !== location.origin)
              return { kind: 'document-required' };
            reader = response.body?.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            if (reader)
              for (;;) {
                const chunk = await reader.read();
                if (chunk.done) break;
                size += chunk.value.byteLength;
                if (size > 8 * 1024 * 1024) return { kind: 'too-large' };
                chunks.push(chunk.value);
              }
            if (navigator.serviceWorker?.controller) return { kind: 'service-worker' };
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
              bytes.set(chunk, offset);
              offset += chunk.byteLength;
            }
            return {
              kind: 'response',
              status: response.status,
              headers: [...response.headers].filter(
                ([name]) => !['set-cookie', 'content-encoding', 'content-length'].includes(name),
              ),
              body: new TextDecoder().decode(bytes),
            };
          } catch {
            // Browserfehler können die Zieladresse enthalten; nur die Fehlerart übertragen.
            return { kind: 'network' };
          } finally {
            controller.abort();
            if (reader) void reader.cancel().catch(() => undefined);
            delete state[key];
          }
        },
        { target: url.href, key },
      ),
      signal,
    );
    finished = true;
    if (result.kind === 'document-required') return null;
    if (result.kind === 'service-worker')
      throw new VintedNetworkError('Ein Service Worker verhindert den direkten Katalogabruf.');
    if (result.kind === 'network') throw new VintedNetworkError('Browserabruf fehlgeschlagen.');
    if (result.kind === 'too-large') throw new Error('Vinted-Katalogantwort ist zu groß.');
    return new Response([204, 205, 304].includes(result.status) ? null : result.body, {
      status: result.status,
      headers: result.headers,
    });
  } finally {
    if (!finished)
      await cleanup.run(() =>
        page.evaluate((key) => {
          const state = globalThis as unknown as Record<string, AbortController | undefined>;
          state[key]?.abort();
          delete state[key];
        }, key),
      );
  }
}
