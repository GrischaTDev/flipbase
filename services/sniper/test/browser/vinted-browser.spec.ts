import { EventEmitter } from 'node:events';
import type { CDPSession } from 'playwright';
import { describe, expect, it } from 'vitest';
import { readBrowserDocument } from '../../src/browser/vinted-browser.js';

function protocol(status: number, headers: { name: string; value: string }[], html: string) {
  const events = new EventEmitter();
  const commands: { method: string; params?: Record<string, unknown> }[] = [];
  let pending = html;
  const session = Object.assign(events, {
    send: async (method: string, params?: Record<string, unknown>) => {
      commands.push({ method, params });
      if (method === 'Page.navigate')
        queueMicrotask(() =>
          events.emit('Fetch.requestPaused', {
            requestId: 'document',
            resourceType: 'Document',
            request: { url: 'https://www.vinted.de/catalog?brand_ids=53' },
            responseStatusCode: status,
            responseHeaders: headers,
          }),
        );
      if (method === 'Fetch.takeResponseBodyAsStream') return { stream: 'body' };
      if (method === 'IO.read') {
        const chunk = pending;
        pending = '';
        return { data: chunk, eof: true, base64Encoded: false };
      }
      return {};
    },
  }) as unknown as CDPSession;
  return { session, commands, events };
}

describe('readBrowserDocument', () => {
  it('returns the original response but fulfills a blank document without redirects or script', async () => {
    const html = '<html><script>window.executed=true</script>catalog</html>';
    const { session, commands, events } = protocol(
      403,
      [
        { name: 'cf-mitigated', value: 'challenge' },
        { name: 'set-cookie', value: 'private-cookie=secret' },
        { name: 'location', value: 'https://other.example.test/' },
      ],
      html,
    );
    const response = await readBrowserDocument(
      session,
      new URL('https://www.vinted.de/catalog?brand_ids=53'),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('cf-mitigated')).toBe('challenge');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toBe(html);
    const fulfillment = commands.find((command) => command.method === 'Fetch.fulfillRequest');
    expect(fulfillment?.params?.responseCode).toBe(200);
    expect(Buffer.from(String(fulfillment?.params?.body), 'base64').toString()).not.toContain(
      'script',
    );
    expect(fulfillment?.params?.responseHeaders).toEqual(
      expect.arrayContaining([{ name: 'set-cookie', value: 'private-cookie=secret' }]),
    );
    expect(JSON.stringify(fulfillment?.params?.responseHeaders)).not.toContain('location');
    expect(events.listenerCount('Fetch.requestPaused')).toBe(0);
  });

  it('aborts without accepting a late response and removes interception listeners', async () => {
    const { session, events, commands } = protocol(200, [], 'catalog');
    const controller = new AbortController();
    controller.abort(new Error('expired'));
    await expect(
      readBrowserDocument(session, new URL('https://www.vinted.de/catalog'), controller.signal),
    ).rejects.toThrow('expired');
    expect(commands).toHaveLength(0);
    expect(events.listenerCount('Fetch.requestPaused')).toBe(0);
  });
  it('fails a paused document before disabling interception after an in-flight abort', async () => {
    const { session, commands } = protocol(200, [], '<script>unsafe()</script>');
    const controller = new AbortController();
    const send = session.send.bind(session);
    session.send = ((method: string, params?: Record<string, unknown>) => {
      if (method === 'IO.read') controller.abort(new Error('expired'));
      return send(method as 'IO.read', params as { handle: string });
    }) as CDPSession['send'];
    await expect(
      readBrowserDocument(
        session,
        new URL('https://www.vinted.de/catalog?brand_ids=53'),
        controller.signal,
      ),
    ).rejects.toThrow('expired');
    const fail = commands.findIndex((command) => command.method === 'Fetch.failRequest');
    const disable = commands.findIndex((command) => command.method === 'Fetch.disable');
    expect(fail).toBeGreaterThanOrEqual(0);
    expect(fail).toBeLessThan(disable);
    expect(commands.some((command) => command.method === 'Fetch.fulfillRequest')).toBe(false);
  });
});
