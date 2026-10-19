import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromium } from 'playwright';
import { ChromeProcess } from '../../src/browser/chrome-process.js';
import { ChromeVintedBrowser } from '../../src/browser/vinted-browser.js';

vi.mock('playwright', () => ({ chromium: { connectOverCDP: vi.fn() } }));

function setup() {
  vi.spyOn(ChromeProcess.prototype, 'start').mockResolvedValue();
  const order: string[] = [];
  const page = {
    close: vi.fn(async () => {
      order.push('close');
    }),
  };
  const replacement = { close: vi.fn() };
  const session = Object.assign(new EventEmitter(), {
    send: vi.fn(async (method: string) => {
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
      if (method === 'Page.navigate')
        queueMicrotask(() =>
          session.emit('Fetch.requestPaused', {
            requestId: 'main',
            frameId: 'main',
            resourceType: 'Document',
            request: { url: 'https://www.vinted.de/catalog' },
            responseStatusCode: 403,
            responseHeaders: [{ name: 'cf-mitigated', value: 'challenge' }],
          }),
        );
      if (method === 'Fetch.takeResponseBodyAsStream') return { stream: 'body' };
      if (method === 'IO.read') return { data: 'challenge', eof: true };
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
  });
  return { browser, context, page, replacement, session, disconnect, order, connection };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ChromeVintedBrowser lifecycle', () => {
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
