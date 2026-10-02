import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MarketplaceProfileBrowser } from '../src/marketplace-profile-browser.ts';
import { MarketplaceBrowserRecovery } from '../src/marketplace-browser-recovery.ts';

const registry = {
  resolve: async (profileId: string) => ({
    profileId,
    workspaceId: 'workspace',
    connectionId: 'connection',
    hostId: 'pilot-01',
    networkId: 'direct',
  }),
};

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
    chromiumRegistry: registry,
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
    chromiumRegistry: registry,
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

test('recovery never releases an unknown or foreign-host Chromium profile', async () => {
  let confirmed = 0;
  let stops = 0;
  const router = new MarketplaceProfileBrowser({
    chromiumRegistry: {
      resolve: async () => {
        throw new Error('Manifest fehlt oder gehört anderem Host');
      },
    },
    chromium: {
      open: async () => {
        throw new Error('unused');
      },
      stop: async () => {
        stops++;
      },
    },
  });
  const recovery = new MarketplaceBrowserRecovery(
    {
      listUnresolved: async () => [
        { id: 'session', profileId: 'chromium_00000000-0000-4000-8000-000000000001' },
      ],
      markStopping: async () => undefined,
      markStopped: async () => {
        confirmed++;
      },
    },
    router,
  );
  await assert.rejects(recovery.recover(), /Bereinigung/);
  assert.equal(stops, 0);
  assert.equal(confirmed, 0);
});
