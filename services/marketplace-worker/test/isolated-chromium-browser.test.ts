import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IsolatedChromiumBrowser } from '../src/isolated-chromium-browser.ts';
import { CloudBrowserStopUncertainError } from '../src/gologin-cloud-browser.ts';

for (const uncertain of [false, true]) {
  test(`isolated startup failure confirms physical stop before releasing its profile: ${uncertain}`, async () => {
    const events: string[] = [];
    const provider = new IsolatedChromiumBrowser({
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
