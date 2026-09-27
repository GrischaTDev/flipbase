import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CloudBrowserStopUncertainError,
  GoLoginCloudBrowser,
} from '../src/gologin-cloud-browser.ts';

const profileId = 'profile-123';

test('connects to a cloud profile without requesting a live-view URL', async () => {
  const requests: { url: string; method: string; authorization: string | null }[] = [];
  const connected: string[] = [];
  const provider = new GoLoginCloudBrowser({
    token: 'private-token',
    fetch: async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method ?? 'GET',
        authorization: new Headers(init?.headers).get('authorization'),
      });
      return new Response(JSON.stringify({ remoteOrbitaUrl: 'https://secret.example/live' }), {
        status: 200,
      });
    },
    connect: async (url) => {
      connected.push(url);
      return { close: async () => undefined, version: () => 'test-browser' };
    },
  });

  const browser = await provider.open(profileId);
  assert.deepEqual(requests, []);
  assert.equal(connected.length, 1);
  assert.match(connected[0]!, /^wss:\/\/cloudbrowser\.gologin\.com\/connect\?/);
  assert.equal(new URL(connected[0]!).searchParams.get('profile'), profileId);
  assert.equal(new URL(connected[0]!).searchParams.get('token'), 'private-token');
  assert.equal(JSON.stringify(browser).includes('secret.example'), false);
  assert.equal(JSON.stringify(browser).includes('private-token'), false);
  assert.equal(
    await browser.run(async (connectedBrowser) => connectedBrowser.version()),
    'test-browser',
  );
});

test('opens the fixed Vinted start page before presenting a login session', async () => {
  const visited: string[] = [];
  const provider = new GoLoginCloudBrowser({
    token: 'private-token',
    startUrl: 'https://www.vinted.de/',
    fetch: async () => new Response(null, { status: 204 }),
    connect: async () =>
      ({
        close: async () => undefined,
        version: () => 'test-browser',
        contexts: () => [{ pages: () => [{ goto: async (url: string) => visited.push(url) }] }],
      }) as never,
  });
  const browser = await provider.open(profileId);
  assert.deepEqual(visited, ['https://www.vinted.de/']);
  await browser.close();
});

test('keeps the browser lease unresolved if navigation fails and provider stop is uncertain', async () => {
  const provider = new GoLoginCloudBrowser({
    token: 'private-token',
    startUrl: 'https://www.vinted.de/',
    fetch: async () => new Response(null, { status: 503 }),
    connect: async () =>
      ({
        close: async () => undefined,
        version: () => 'test-browser',
        contexts: () => [
          {
            pages: () => [
              {
                goto: async () => {
                  throw new Error('offline');
                },
              },
            ],
          },
        ],
      }) as never,
  });
  await assert.rejects(provider.open(profileId), CloudBrowserStopUncertainError);
});

test('stops the provider explicitly if CDP connection fails without leaking secrets', async () => {
  const methods: string[] = [];
  const provider = new GoLoginCloudBrowser({
    token: 'private-token',
    fetch: async (_input, init) => {
      methods.push(init?.method ?? 'GET');
      return new Response('{}', { status: 200 });
    },
    connect: async () => {
      throw new Error('wss://secret.example?token=private-token');
    },
  });

  await assert.rejects(provider.open(profileId), /Browser-Verbindung fehlgeschlagen/);
  assert.deepEqual(methods, ['DELETE']);
});

test('closes CDP and sends an explicit stop request', async () => {
  const methods: string[] = [];
  let closed = false;
  const provider = new GoLoginCloudBrowser({
    token: 'private-token',
    fetch: async (_input, init) => {
      methods.push(init?.method ?? 'GET');
      return new Response('{}', { status: 200 });
    },
    connect: async () => ({
      close: async () => {
        closed = true;
      },
      version: () => 'test-browser',
    }),
  });

  const browser = await provider.open(profileId);
  await browser.close();
  assert.equal(closed, true);
  assert.deepEqual(methods, ['DELETE']);
});

test('retries provider stop after a failed stop response', async () => {
  let stops = 0;
  const provider = new GoLoginCloudBrowser({
    token: 'private-token',
    fetch: async (_input, init) => {
      if (init?.method === 'DELETE') {
        stops += 1;
        if (stops === 1) return new Response('secret', { status: 503 });
      }
      return new Response('{}', { status: 200 });
    },
    connect: async () => ({ close: async () => undefined, version: () => 'test-browser' }),
  });
  const browser = await provider.open(profileId);
  await assert.rejects(browser.close(), /HTTP 503/);
  await browser.close();
  assert.equal(stops, 2);
});

test('reports uncertain cleanup if CDP start fails and provider stop also fails', async () => {
  const provider = new GoLoginCloudBrowser({
    token: 'private-token',
    fetch: async () => new Response('private provider text', { status: 503 }),
    connect: async () => {
      throw new Error('private CDP URL');
    },
  });
  await assert.rejects(provider.open(profileId), CloudBrowserStopUncertainError);
});

test('shares one provider stop across concurrent close calls', async () => {
  let stops = 0;
  let completeStop!: () => void;
  const stopGate = new Promise<void>((resolve) => {
    completeStop = resolve;
  });
  const provider = new GoLoginCloudBrowser({
    token: 'private-token',
    fetch: async () => {
      stops += 1;
      await stopGate;
      return new Response('{}', { status: 200 });
    },
    connect: async () => ({ close: async () => undefined, version: () => 'test-browser' }),
  });
  const browser = await provider.open(profileId);
  const first = browser.close();
  const second = browser.close();
  completeStop();
  await Promise.all([first, second]);
  assert.equal(stops, 1);
});

test('captures and controls only the active browser page with bounded commands', async () => {
  const calls: string[] = [];
  const frame = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const page = {
    screenshot: async (options: Record<string, unknown>) => {
      assert.equal(options['type'], 'jpeg');
      assert.equal(options['quality'], 65);
      assert.equal(options['scale'], 'css');
      calls.push('capture');
      return frame;
    },
    viewportSize: () => ({ width: 800, height: 600 }),
    mouse: { click: async (x: number, y: number) => calls.push(`click:${x}:${y}`) },
    keyboard: {
      insertText: async (value: string) => calls.push(`type:${value}`),
      press: async (key: string) => calls.push(`press:${key}`),
    },
  };
  const provider = new GoLoginCloudBrowser({
    token: 'private-token',
    fetch: async () => new Response('{}', { status: 200 }),
    connect: async () =>
      ({
        close: async () => undefined,
        version: () => 'test-browser',
        contexts: () => [{ pages: () => [page] }],
      }) as never,
  });
  const browser = await provider.open(profileId);
  assert.deepEqual(await browser.run(async (info) => info.capture?.()), frame);
  await browser.run(async (info) => info.click?.(0.25, 0.75));
  await browser.run(async (info) => info.type?.('synthetic input'));
  await browser.run(async (info) => info.press?.('Tab'));
  assert.deepEqual(calls, ['capture', 'click:200:450', 'type:synthetic input', 'press:Tab']);
  await browser.close();
});
