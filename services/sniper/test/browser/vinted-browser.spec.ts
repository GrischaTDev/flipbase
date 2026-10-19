import { EventEmitter } from 'node:events';
import type { CDPSession } from 'playwright';
import { describe, expect, it, vi } from 'vitest';
import { readBrowserDocument } from '../../src/browser/vinted-browser.js';

function protocol(status: number, headers: { name: string; value: string }[], html: string) {
  const events = new EventEmitter();
  const commands: { method: string; params?: Record<string, unknown> }[] = [];
  let pending = html;
  const session = Object.assign(events, {
    send: async (method: string, params?: Record<string, unknown>) => {
      commands.push({ method, params });
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
      if (method === 'Page.navigate')
        queueMicrotask(() =>
          events.emit('Fetch.requestPaused', {
            requestId: 'document',
            resourceType: 'Document',
            frameId: 'main',
            request: { url: 'https://www.vinted.de/catalog?brand_ids=53' },
            responseStatusCode: status,
            responseHeaders: headers,
          }),
        );
      if (method === 'Fetch.takeResponseBodyAsStream') return { stream: 'body' };
      if (method === 'Fetch.fulfillRequest')
        queueMicrotask(() =>
          events.emit('Page.lifecycleEvent', {
            frameId: 'main',
            loaderId: 'catalog',
            name: 'load',
          }),
        );
      if (method === 'IO.read') {
        const chunk = pending;
        pending = '';
        return { data: chunk, eof: true, base64Encoded: false };
      }
      return method === 'Page.navigate' ? { loaderId: 'catalog' } : {};
    },
  }) as unknown as CDPSession;
  return { session, commands, events };
}

function refreshProtocol(
  options: { loop?: boolean; refreshStatus?: number; refreshBody?: string; stall?: boolean } = {},
) {
  const catalogUrl = new URL('https://www.vinted.de/catalog?brand_ids=53');
  const refreshUrl = new URL('/session-refresh', catalogUrl);
  refreshUrl.searchParams.set('ref_url', catalogUrl.pathname + catalogUrl.search);
  const { session, events, commands } = protocol(
    307,
    [{ name: 'location', value: refreshUrl.href }],
    '',
  );
  const send = session.send.bind(session);
  let body = '';
  const emitDocument = (id: string, url: string, status: number) => {
    events.emit('Fetch.requestPaused', {
      requestId: id + '-request',
      resourceType: 'Document',
      frameId: 'main',
      request: { url },
    });
    events.emit('Fetch.requestPaused', {
      requestId: id,
      resourceType: 'Document',
      frameId: 'main',
      request: { url },
      responseStatusCode: status,
      responseHeaders:
        id === 'renewed-catalog' && options.loop
          ? [{ name: 'location', value: refreshUrl.href }]
          : status === 403
            ? [{ name: 'cf-mitigated', value: 'challenge' }]
            : [],
    });
  };
  session.send = (async (method: string, params?: Record<string, unknown>) => {
    if (method === 'Fetch.continueResponse' && params?.requestId === 'document') {
      commands.push({ method, params });
      body = options.refreshBody ?? '<script>location.replace("/catalog?brand_ids=53")</script>';
      queueMicrotask(() => emitDocument('refresh', refreshUrl.href, options.refreshStatus ?? 200));
      return {};
    }
    if (method === 'IO.read') return { data: body, eof: true, base64Encoded: false };
    if (method === 'Fetch.fulfillRequest') {
      commands.push({ method, params });
      const refresh = params?.requestId === 'refresh';
      const loaderId = refresh ? 'refresh' : 'renewed-catalog';
      events.emit('Page.frameNavigated', {
        frame: { id: 'main', loaderId, url: refresh ? refreshUrl.href : catalogUrl.href },
      });
      events.emit('Page.lifecycleEvent', { frameId: 'main', loaderId, name: 'load' });
      if (refresh && options.refreshStatus !== 403 && !options.stall) {
        body = '<html>renewed catalog</html>';
        queueMicrotask(() =>
          emitDocument('renewed-catalog', catalogUrl.href, options.loop ? 307 : 200),
        );
      }
      return {};
    }
    return send(method as 'IO.read', params as { handle: string });
  }) as CDPSession['send'];
  return { session, events, commands };
}

describe('readBrowserDocument', () => {
  const catalogUrl = new URL('https://www.vinted.de/catalog?brand_ids=53');
  it('loads the original document with scripts, cookies, status and security headers intact', async () => {
    const html = '<html><script>window.executed=true</script>catalog</html>';
    const { session, commands, events } = protocol(
      403,
      [
        { name: 'cf-mitigated', value: 'challenge' },
        { name: 'set-cookie', value: 'private-cookie=secret' },
        { name: 'content-security-policy', value: "script-src 'self'" },
        { name: 'content-encoding', value: 'gzip' },
        { name: 'content-length', value: '100' },
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
    expect(fulfillment?.params?.responseCode).toBe(403);
    expect(Buffer.from(String(fulfillment?.params?.body), 'base64').toString()).toBe(html);
    expect(fulfillment?.params?.responseHeaders).toEqual(
      expect.arrayContaining([{ name: 'set-cookie', value: 'private-cookie=secret' }]),
    );
    expect(fulfillment?.params?.responseHeaders).toEqual(
      expect.arrayContaining([
        { name: 'content-security-policy', value: "script-src 'self'" },
        { name: 'cf-mitigated', value: 'challenge' },
      ]),
    );
    expect(JSON.stringify(fulfillment?.params?.responseHeaders)).not.toMatch(
      /content-encoding|content-length/,
    );
    expect(commands.some((command) => command.method === 'Page.stopLoading')).toBe(false);
    expect(commands.find((command) => command.method === 'Fetch.enable')?.params).toEqual({
      patterns: [
        { urlPattern: '*', resourceType: 'Document', requestStage: 'Request' },
        { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' },
      ],
    });
    expect(events.listenerCount('Fetch.requestPaused')).toBe(0);
    expect(events.listenerCount('Page.lifecycleEvent')).toBe(0);
  });

  it('waits for this navigation to load instead of accepting an old document or a child frame', async () => {
    const { session, events } = protocol(200, [], 'catalog');
    const send = session.send.bind(session);
    let fulfilled: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      fulfilled = resolve;
    });
    session.send = ((method: string, params?: Record<string, unknown>) => {
      if (method === 'Fetch.fulfillRequest') {
        fulfilled();
        return Promise.resolve({});
      }
      return send(method as 'IO.read', params as { handle: string });
    }) as CDPSession['send'];
    const completed = vi.fn();
    const reading = readBrowserDocument(session, catalogUrl).then(completed);
    await ready;
    events.emit('Page.lifecycleEvent', { frameId: 'main', loaderId: 'previous', name: 'load' });
    events.emit('Page.lifecycleEvent', { frameId: 'child', loaderId: 'catalog', name: 'load' });
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    events.emit('Page.lifecycleEvent', { frameId: 'main', loaderId: 'catalog', name: 'load' });
    await reading;
    expect(completed).toHaveBeenCalledWith(expect.any(Response));
  });

  it('allows an embedded document to finish without replacing it with the catalog', async () => {
    const { session, events, commands } = protocol(200, [], 'catalog');
    const send = session.send.bind(session);
    session.send = ((method: string, params?: Record<string, unknown>) => {
      if (method === 'Page.navigate')
        events.emit('Fetch.requestPaused', {
          requestId: 'child',
          resourceType: 'Document',
          frameId: 'embedded',
          request: { url: 'https://assets.example.test/frame' },
          responseStatusCode: 200,
        });
      return send(method as 'IO.read', params as { handle: string });
    }) as CDPSession['send'];
    await readBrowserDocument(session, catalogUrl);
    expect(commands).toContainEqual({
      method: 'Fetch.continueResponse',
      params: { requestId: 'child' },
    });
    expect(
      commands.filter((command) => command.method === 'Fetch.takeResponseBodyAsStream'),
    ).toHaveLength(1);
  });

  it('keeps redirects visible to the collector without navigating to their target', async () => {
    const { session, commands } = protocol(
      302,
      [{ name: 'location', value: 'https://other.example.test/' }],
      '',
    );
    const response = await readBrowserDocument(session, catalogUrl);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://other.example.test/');
    expect(commands.some((command) => command.method === 'Fetch.fulfillRequest')).toBe(false);
    expect(commands.filter((command) => command.method === 'Page.navigate')).toHaveLength(1);
  });

  it('completes one same-origin session refresh and returns only the requested catalog', async () => {
    const { session, events, commands } = refreshProtocol();
    const response = await readBrowserDocument(session, catalogUrl);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>renewed catalog</html>');
    expect(commands.filter((command) => command.method === 'Page.navigate')).toHaveLength(1);
    expect(commands.some((command) => command.method === 'Fetch.failRequest')).toBe(false);
    expect(events.listenerCount('Page.frameNavigated')).toBe(0);
  });

  it.each([
    'https://other.example.test/session-refresh?ref_url=%2Fcatalog%3Fbrand_ids%3D53',
    '/member/login?ref_url=%2Fcatalog%3Fbrand_ids%3D53',
    '/session-refresh?ref_url=%2Fcatalog%3Fbrand_ids%3D14',
    '/session-refresh?ref_url=https%3A%2F%2Fother.example.test',
    '/session-refresh?ref_url=%2Fcatalog%3Fbrand_ids%3D53&ref_url=%2F',
    '/session-refresh?ref_url=%2Fcatalog%3Fbrand_ids%3D53&token=private',
    '/session-refresh?ref_url=%2Fcatalog%3Fbrand_ids%3D53#unexpected',
    'https://name:password@www.vinted.de/session-refresh?ref_url=%2Fcatalog%3Fbrand_ids%3D53',
    'https://[invalid',
  ])('does not follow an untrusted or mismatched refresh redirect: %s', async (location) => {
    const { session, commands } = protocol(307, [{ name: 'location', value: location }], '');
    expect((await readBrowserDocument(session, catalogUrl)).status).toBe(307);
    expect(commands.some((command) => command.method === 'Fetch.continueResponse')).toBe(false);
  });

  it('does not follow a session refresh marked as a challenge', async () => {
    const refresh = '/session-refresh?ref_url=%2Fcatalog%3Fbrand_ids%3D53';
    const { session, commands } = protocol(
      307,
      [
        { name: 'location', value: refresh },
        { name: 'cf-mitigated', value: 'challenge' },
      ],
      '',
    );
    expect((await readBrowserDocument(session, catalogUrl)).status).toBe(307);
    expect(commands.some((command) => command.method === 'Fetch.continueResponse')).toBe(false);
  });

  it('stops a repeated refresh redirect instead of looping', async () => {
    const { session, commands } = refreshProtocol({ loop: true });
    expect((await readBrowserDocument(session, catalogUrl)).status).toBe(307);
    expect(commands.filter((command) => command.method === 'Fetch.continueResponse')).toHaveLength(
      1,
    );
  });

  it('preserves a challenge on the refresh page', async () => {
    const { session } = refreshProtocol({ refreshStatus: 403 });
    const response = await readBrowserDocument(session, catalogUrl);
    expect(response.status).toBe(403);
    expect(response.headers.get('cf-mitigated')).toBe('challenge');
  });

  it.each(['challenge-running', '<title>Just a moment...</title>'])(
    'preserves a successful refresh response with the existing HTML challenge marker: %s',
    async (marker) => {
      const { session, commands } = refreshProtocol({ refreshBody: marker, stall: true });
      const response = await readBrowserDocument(session, catalogUrl, AbortSignal.timeout(100));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(marker);
      expect(
        commands.some(
          (command) =>
            command.method === 'Fetch.fulfillRequest' && command.params?.requestId === 'refresh',
        ),
      ).toBe(false);
    },
  );

  it('aborts a stalled refresh without returning its successful HTML as a catalog', async () => {
    const { session, events, commands } = refreshProtocol({ stall: true });
    const controller = new AbortController();
    const reading = readBrowserDocument(session, catalogUrl, controller.signal);
    const result = expect(reading).rejects.toThrow('refresh expired');
    await vi.waitFor(() =>
      expect(
        commands.some(
          (command) =>
            command.method === 'Fetch.fulfillRequest' && command.params?.requestId === 'refresh',
        ),
      ).toBe(true),
    );
    controller.abort(new Error('refresh expired'));
    await result;
    expect(commands.some((command) => command.method === 'Page.stopLoading')).toBe(true);
    expect(events.listenerCount('Page.frameNavigated')).toBe(0);
    expect(events.listenerCount('Fetch.requestPaused')).toBe(0);
  });

  it('retains Chromium response failures instead of replacing them with a generic server error', async () => {
    const { session, events } = protocol(200, [], '');
    const send = session.send.bind(session);
    session.send = ((method: string, params?: Record<string, unknown>) => {
      if (method === 'Page.navigate') {
        queueMicrotask(() =>
          events.emit('Fetch.requestPaused', {
            requestId: 'document',
            frameId: 'main',
            resourceType: 'Document',
            request: { url: catalogUrl.href },
            responseErrorReason: 'ConnectionClosed',
          }),
        );
        return Promise.resolve({ loaderId: 'catalog' });
      }
      return send(method as 'IO.read', params as { handle: string });
    }) as CDPSession['send'];
    await expect(readBrowserDocument(session, catalogUrl)).rejects.toMatchObject({
      kind: 'network_error',
      message: 'Browserabruf fehlgeschlagen (ConnectionClosed).',
    });
  });

  it.each([403, 429, 503])(
    'returns HTTP %s even if its page never finishes loading',
    async (status) => {
      const { session } = protocol(status, [], 'rejected');
      const send = session.send.bind(session);
      session.send = ((method: string, params?: Record<string, unknown>) =>
        method === 'Fetch.fulfillRequest'
          ? Promise.resolve({})
          : send(method as 'IO.read', params as { handle: string })) as CDPSession['send'];
      expect((await readBrowserDocument(session, catalogUrl)).status).toBe(status);
    },
  );

  it.each([
    'ConnectionClosed',
    'net::ERR_CONNECTION_RESET',
    'https://private.example.test/?token=secret',
  ])('classifies a failed navigation without disclosing browser details: %s', async (reason) => {
    const { session } = protocol(200, [], 'catalog');
    const send = session.send.bind(session);
    session.send = ((method: string, params?: Record<string, unknown>) =>
      method === 'Page.navigate'
        ? Promise.resolve({ errorText: reason })
        : send(method as 'IO.read', params as { handle: string })) as CDPSession['send'];
    await expect(readBrowserDocument(session, catalogUrl)).rejects.toMatchObject({
      kind: 'network_error',
      phase: 'request',
      message: `Browserabruf fehlgeschlagen (${reason.startsWith('https:') ? 'Unknown' : reason}).`,
    });
  });

  it('rejects a document above the existing eight MiB limit and stops loading', async () => {
    const { session, commands } = protocol(200, [], 'x'.repeat(8 * 1024 * 1024 + 1));
    await expect(readBrowserDocument(session, catalogUrl)).rejects.toThrow('zu groß');
    expect(commands.some((command) => command.method === 'Page.stopLoading')).toBe(true);
    expect(commands.some((command) => command.method === 'Fetch.fulfillRequest')).toBe(false);
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
  it('stops a still-pending navigation immediately after abort', async () => {
    const { session, events, commands } = protocol(200, [], 'catalog');
    const controller = new AbortController();
    const send = session.send.bind(session);
    let navigating: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      navigating = resolve;
    });
    session.send = ((method: string, params?: Record<string, unknown>) => {
      if (method === 'Page.navigate') {
        commands.push({ method, params });
        navigating();
        return new Promise(() => undefined);
      }
      return send(method as 'IO.read', params as { handle: string });
    }) as CDPSession['send'];
    const reading = readBrowserDocument(
      session,
      new URL('https://www.vinted.de/catalog'),
      controller.signal,
    ).then(
      () => 'unexpected success',
      (error: unknown) => (error instanceof Error ? error.message : 'unknown'),
    );
    await started;
    controller.abort(new Error('navigation expired'));
    const result = await Promise.race([
      reading,
      new Promise<string>((resolve) => setTimeout(() => resolve('still navigating'), 100)),
    ]);
    expect(result).toBe('navigation expired');
    expect(commands.some((command) => command.method === 'Page.stopLoading')).toBe(true);
    expect(commands.some((command) => command.method === 'Fetch.disable')).toBe(true);
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
