import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromium } from 'playwright';
import { ChromeProcess } from '../../src/browser/chrome-process.js';
import { ChromeVintedBrowser } from '../../src/browser/vinted-browser.js';

vi.mock('playwright', () => ({ chromium: { connectOverCDP: vi.fn() } }));

function setup(status = 403, requestTimeoutMs = 20_000) {
  vi.spyOn(ChromeProcess.prototype, 'start').mockResolvedValue();
  const order: string[] = [];
  const page = {
    url: () => 'https://www.vinted.de/catalog',
    evaluate: vi.fn(async () => ({ kind: 'response', status: 200, headers: [], body: 'catalog' })),
    close: vi.fn(async () => {
      order.push('close');
    }),
  };
  const replacement = { ...page, close: vi.fn() };
  const session = Object.assign(new EventEmitter(), {
    send: vi.fn(async (method: string) => {
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
      if (method === 'Runtime.evaluate') return { result: { type: 'boolean', value: false } };
      if (method === 'Page.navigate')
        queueMicrotask(() =>
          session.emit('Fetch.requestPaused', {
            requestId: 'main',
            frameId: 'main',
            resourceType: 'Document',
            request: { url: 'https://www.vinted.de/catalog' },
            responseStatusCode: status,
            responseHeaders: status === 403 ? [{ name: 'cf-mitigated', value: 'challenge' }] : [],
          }),
        );
      if (method === 'Fetch.takeResponseBodyAsStream') return { stream: 'body' };
      if (method === 'IO.read')
        return { data: status === 403 ? 'challenge' : 'catalog', eof: true };
      if (method === 'Fetch.fulfillRequest')
        queueMicrotask(() =>
          session.emit('Page.lifecycleEvent', {
            frameId: 'main',
            loaderId: 'catalog',
            name: 'load',
          }),
        );
      if (method === 'Page.navigate') return { loaderId: 'catalog' };
      return {};
    }),
    detach: vi.fn(async () => undefined),
  });
  const context = {
    pages: vi.fn(() => [page]),
    newPage: vi.fn(async () => {
      order.push('open');
      return replacement;
    }),
    newCDPSession: vi.fn(async () => session),
  };
  const disconnect = vi.fn(async () => undefined);
  const connection = { contexts: () => [context], close: disconnect };
  vi.mocked(chromium.connectOverCDP)
    .mockReset()
    .mockResolvedValue(connection as never);
  const browser = new ChromeVintedBrowser('https://www.vinted.de', {
    profileDir: '/unused',
    cdpPort: 9228,
    requestTimeoutMs,
  });
  return { browser, context, page, replacement, session, disconnect, order, connection };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ChromeVintedBrowser lifecycle', () => {
  it('warms up once and then reads the catalog without a second document navigation', async () => {
    const { browser, session, page } = setup(200);
    await browser.fetch('https://www.vinted.de/catalog');
    await browser.fetch('https://www.vinted.de/catalog?brand_ids=53');
    expect(session.send.mock.calls.filter(([method]) => method === 'Page.navigate')).toHaveLength(
      1,
    );
    expect(page.evaluate).toHaveBeenCalled();
  });

  it('serializes simultaneous first readers until the complete warmup has finished', async () => {
    const { browser, session, page } = setup(200);
    await Promise.all([
      browser.fetch('https://www.vinted.de/catalog'),
      browser.fetch('https://www.vinted.de/catalog?brand_ids=53'),
    ]);
    expect(session.send.mock.calls.filter(([method]) => method === 'Page.navigate')).toHaveLength(
      1,
    );
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('does not accept a successful warmup from a page controlled by a service worker', async () => {
    const { browser, session } = setup(200);
    const send = session.send.getMockImplementation()!;
    session.send.mockImplementation(async (method: string) =>
      method === 'Runtime.evaluate' ? { result: { type: 'boolean', value: true } } : send(method),
    );
    await expect(browser.fetch('https://www.vinted.de/catalog')).rejects.toMatchObject({
      kind: 'network_error',
    });
  });

  it('returns an opaque redirect through the original guarded navigation path once', async () => {
    const { browser, session, page } = setup(200);
    await browser.fetch('https://www.vinted.de/catalog');
    page.evaluate.mockResolvedValueOnce({ kind: 'document-required' } as never);
    await browser.fetch('https://www.vinted.de/catalog');
    expect(session.send.mock.calls.filter(([method]) => method === 'Page.navigate')).toHaveLength(
      2,
    );
  });

  it('returns a challenge unchanged and does not retry it as a navigation', async () => {
    const { browser, session, page } = setup(200);
    await browser.fetch('https://www.vinted.de/catalog');
    page.evaluate.mockResolvedValueOnce({
      kind: 'response',
      status: 200,
      headers: [['cf-mitigated', 'challenge']],
      body: 'challenge-running',
    } as never);
    const response = await browser.fetch('https://www.vinted.de/catalog');
    expect(response.headers.get('cf-mitigated')).toBe('challenge');
    expect(await response.text()).toBe('challenge-running');
    expect(session.send.mock.calls.filter(([method]) => method === 'Page.navigate')).toHaveLength(
      1,
    );
  });

  it('rewarms the replacement tab after a transport failure and then resumes slim reads', async () => {
    const { browser, page, context } = setup(200);
    context.newPage.mockResolvedValue(page as never);
    await browser.fetch('https://www.vinted.de/catalog');
    page.evaluate.mockResolvedValueOnce({ kind: 'network' } as never);
    await expect(browser.fetch('https://www.vinted.de/catalog')).rejects.toMatchObject({
      kind: 'network_error',
    });
    expect((await browser.fetch('https://www.vinted.de/catalog')).ok).toBe(true);
    expect((await browser.fetch('https://www.vinted.de/catalog')).ok).toBe(true);
    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(browser.needsRestart).toBe(false);
  });

  it('starts no document when cancelled during CDP connection and disconnects a late client', async () => {
    const { browser, connection, context, disconnect } = setup();
    let release: () => void = () => undefined;
    vi.mocked(chromium.connectOverCDP).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(connection as never);
        }),
    );
    const controller = new AbortController();
    const fetching = browser.fetch('https://www.vinted.de/catalog', { signal: controller.signal });
    const rejected = expect(fetching).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(chromium.connectOverCDP).toHaveBeenCalledTimes(1));
    controller.abort(new Error('cancelled'));
    release();
    await rejected;
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalled());
    expect(context.newCDPSession).not.toHaveBeenCalled();
  });

  it('times out a stalled CDP connection and allows a fresh complete warmup', async () => {
    const { browser, connection, context, disconnect } = setup(200, 50);
    let release: () => void = () => undefined;
    vi.mocked(chromium.connectOverCDP).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(connection as never);
        }),
    );
    await expect(browser.fetch('https://www.vinted.de/catalog')).rejects.toMatchObject({
      kind: 'timeout',
    });
    expect(context.newCDPSession).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledTimes(1));
    expect((await browser.fetch('https://www.vinted.de/catalog')).ok).toBe(true);
    expect(browser.needsRestart).toBe(false);
  });
  it('replaces the tab before request sixteen, including completed HTTP rejections', async () => {
    const { browser, context, page, order } = setup();
    for (let index = 0; index < 15; index++)
      expect((await browser.fetch('https://www.vinted.de/catalog')).status).toBe(403);
    expect(context.newPage).not.toHaveBeenCalled();
    await browser.fetch('https://www.vinted.de/catalog');
    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(page.close).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['open', 'close']);
  });

  it('does not keep opening tabs after the old tab cannot be closed', async () => {
    const { browser, context, page } = setup();
    for (let index = 0; index < 15; index++) await browser.fetch('https://www.vinted.de/catalog');
    page.close.mockRejectedValueOnce(new Error('renderer unavailable'));
    await expect(browser.fetch('https://www.vinted.de/catalog')).rejects.toThrow();
    await expect(browser.fetch('https://www.vinted.de/catalog')).rejects.toThrow();
    expect(context.newPage).toHaveBeenCalledTimes(1);
  });

  it('bounds a stuck outer detach and marks the browser for restart', async () => {
    const { browser, session } = setup();
    session.detach.mockImplementationOnce(() => new Promise(() => undefined));
    const response = await Promise.race([
      browser.fetch('https://www.vinted.de/catalog'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2300)),
    ]);
    expect(response?.status).toBe(403);
    expect(browser).toHaveProperty('needsRestart', true);
  });
  it('shares concurrent watchdog and main-loop shutdowns', async () => {
    const { browser } = setup();
    let release: () => void = () => undefined;
    const stop = vi.spyOn(ChromeProcess.prototype, 'stop').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = browser.close();
    const second = browser.close();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
  });

  it('bounds an unresponsive disconnect after the document was read', async () => {
    const { browser, disconnect } = setup();
    disconnect.mockImplementationOnce(() => new Promise(() => undefined));
    const response = await Promise.race([
      browser.fetch('https://www.vinted.de/catalog'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2300)),
    ]);
    expect(response?.status).toBe(403);
    expect(browser).toHaveProperty('needsRestart', true);
  });

  it('starts no document after shutdown begins during connection setup', async () => {
    const { browser, connection, context } = setup();
    let release: () => void = () => undefined;
    vi.mocked(chromium.connectOverCDP).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(connection as never);
        }),
    );
    const fetching = browser.fetch('https://www.vinted.de/catalog');
    await vi.waitFor(() => expect(chromium.connectOverCDP).toHaveBeenCalledTimes(1));
    await browser.close();
    release();
    await expect(fetching).rejects.toThrow();
    expect(context.newCDPSession).not.toHaveBeenCalled();
  });
});
