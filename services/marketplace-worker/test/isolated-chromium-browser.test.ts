import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IsolatedChromiumBrowser } from '../src/isolated-chromium-browser.ts';
import {
  ChromiumStartError,
  CloudBrowserStopUncertainError,
} from '../src/gologin-cloud-browser.ts';
import { startPageFailure } from '../src/vinted-browser-actions.ts';
import { BrowserActionFailedError, plainFailureMessage } from '../src/vinted-listing-read-error.ts';

for (const uncertain of [false, true]) {
  test(`isolated startup failure confirms physical stop before releasing its profile: ${uncertain}`, async () => {
    const events: string[] = [];
    const provider = new IsolatedChromiumBrowser({
      initializeRetryDelayMs: 0,
      profiles: {
        acquire: async () => ({
          directory: '/fixture/account-a',
          confirmStopped: async () => {
            events.push('confirmed');
          },
        }),
        prepareStopped: async () => '/fixture/account-a',
      },
      network: { resolve: async () => ({ kind: 'direct' }) },
      launcher: {
        launch: async () => ({
          run: async (operation) =>
            operation({
              version: () => 'fixture',
              initialize: async () => {
                throw new Error('private-provider-text');
              },
            }),
          close: async () => undefined,
        }),
        recover: async () => {
          events.push('recover');
          if (uncertain) throw new Error('private-stop-error');
        },
      },
    });
    await assert.rejects(
      provider.open('account-a'),
      uncertain ? CloudBrowserStopUncertainError : /Chromium-Start fehlgeschlagen/,
    );
    assert.deepEqual(events, uncertain ? ['recover'] : ['recover', 'confirmed']);
  });
}

function startFixture(initialize: () => Promise<void>, events: string[]) {
  return new IsolatedChromiumBrowser({
    initializeRetryDelayMs: 0,
    profiles: {
      acquire: async () => ({
        directory: '/fixture/account-a',
        confirmStopped: async () => {
          events.push('confirmed');
        },
      }),
      prepareStopped: async () => '/fixture/account-a',
    },
    network: { resolve: async () => ({ kind: 'direct' }) },
    launcher: {
      launch: async () => ({
        run: async (operation) => operation({ version: () => 'fixture', initialize }),
        close: async () => undefined,
      }),
      recover: async () => {
        events.push('recover');
      },
    },
  });
}

test('a start page that fails once is loaded again in the same browser', async () => {
  const events: string[] = [];
  let attempts = 0;
  const provider = startFixture(async () => {
    attempts++;
    if (attempts === 1) throw new Error('private-provider-text');
  }, events);
  const handle = await provider.open('account-a');
  assert.equal(attempts, 2);
  assert.deepEqual(events, []);
  await handle.close();
});

test('a start page that fails twice reports only its fixed phase and checked detail', async () => {
  const events: string[] = [];
  let attempts = 0;
  const provider = startFixture(async () => {
    attempts++;
    throw attempts === 1
      ? new Error('private-provider-text 123')
      : new BrowserActionFailedError('Error: Startseite nicht geladen tunnel connection failed');
  }, events);
  await assert.rejects(provider.open('account-a'), (error) => {
    assert.ok(error instanceof ChromiumStartError);
    assert.equal(error.phase, 'initialize');
    assert.equal(error.detail, 'Error: Startseite nicht geladen tunnel connection failed');
    return true;
  });
  assert.equal(attempts, 2);
  assert.deepEqual(events, ['recover', 'confirmed']);
});

test('a failed launch is not repeated and names the launch phase without private text', async () => {
  const events: string[] = [];
  const provider = new IsolatedChromiumBrowser({
    initializeRetryDelayMs: 0,
    profiles: {
      acquire: async () => ({
        directory: '/fixture/account-a',
        confirmStopped: async () => {
          events.push('confirmed');
        },
      }),
      prepareStopped: async () => '/fixture/account-a',
    },
    network: { resolve: async () => ({ kind: 'direct' }) },
    launcher: {
      launch: async () => {
        events.push('launch');
        throw new Error('private-password-and-account-data 42');
      },
      recover: async () => {
        events.push('recover');
      },
    },
  });
  await assert.rejects(provider.open('account-a'), (error) => {
    assert.ok(error instanceof ChromiumStartError);
    assert.equal(error.phase, 'launch');
    assert.equal(error.detail, 'Error');
    return true;
  });
  assert.deepEqual(events, ['launch', 'recover', 'confirmed']);
});

test('start page failures are reduced to the fixed browser error kind', () => {
  assert.equal(
    startPageFailure(
      new Error('page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://www.vinted.de/?token=abc'),
    ),
    'Startseite nicht geladen tunnel connection failed',
  );
  const timeout = new Error('page.goto: Timeout 20000ms exceeded.');
  timeout.name = 'TimeoutError';
  assert.equal(startPageFailure(timeout), 'Startseite nicht geladen zeitlimit');
  assert.equal(startPageFailure(new Error('secret 123')), 'Startseite nicht geladen');
  for (const failure of [
    'Startseite nicht geladen tunnel connection failed',
    'Startseite nicht geladen zeitlimit',
    'Startseite nicht geladen',
  ])
    assert.match(failure, plainFailureMessage);
});
