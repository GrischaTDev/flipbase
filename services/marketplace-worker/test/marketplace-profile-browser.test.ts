import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MarketplaceProfileBrowser } from '../src/marketplace-profile-browser.ts';

test('immutable session profile ID determines open and recovery stop provider', async () => {
  const events: string[] = [];
  const provider = (name: string) => ({
    open: async (id: string) => {
      events.push(`${name}:open:${id}`);
      return {
        run: async () => {
          throw new Error('fixture unused');
        },
        close: async () => undefined,
      };
    },
    stop: async (id: string) => {
      events.push(`${name}:stop:${id}`);
    },
  });
  const router = new MarketplaceProfileBrowser({
    chromium: provider('chromium'),
    goLogin: provider('gologin'),
  });
  const chromiumId = 'chromium_00000000-0000-4000-8000-000000000001';
  await router.stop('legacy-profile');
  await router.stop(chromiumId);
  assert.deepEqual(events, ['gologin:stop:legacy-profile', `chromium:stop:${chromiumId}`]);
  await assert.rejects(router.stop('chromium_bad'));
  await assert.rejects(router.stop('chromium_00000000-0000-4000-8000-00000000000A'));
  assert.equal(events.length, 2);
});

test('missing legacy provider blocks cleanup and never falls back to Chromium', async () => {
  const router = new MarketplaceProfileBrowser({
    chromium: {
      open: async () => {
        throw new Error('must not open');
      },
      stop: async () => {
        throw new Error('must not stop');
      },
    },
  });
  await assert.rejects(router.stop('legacy-profile'), /GoLogin/);
});
