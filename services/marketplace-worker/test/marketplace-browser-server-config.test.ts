import assert from 'node:assert/strict';
import { test } from 'node:test';
import { marketplaceBrowserServerConfig } from '../src/marketplace-browser-server-config.ts';

const configured = {
  MARKETPLACE_BROWSER_TEST_ENABLED: '1',
  SUPABASE_URL: 'http://127.0.0.1:54351',
  SUPABASE_ANON_KEY: 'public-test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'server-test-key',
  MARKETPLACE_BROWSER_PUBLIC_TEST_URL: 'https://www.vinted.de/member/123-test',
};

test('requires deliberate activation and server-only keys before listening', () => {
  assert.throws(() => marketplaceBrowserServerConfig({}), /nicht freigegeben/);
  assert.throws(
    () =>
      marketplaceBrowserServerConfig({ ...configured, MARKETPLACE_BROWSER_PUBLIC_TEST_URL: '' }),
    /unvollständig/,
  );
  assert.throws(
    () =>
      marketplaceBrowserServerConfig({
        ...configured,
        MARKETPLACE_BROWSER_PUBLIC_TEST_URL: 'https://evil.test/member/123-test',
      }),
    /ungültige öffentliche Testseite/,
  );
  assert.throws(
    () =>
      marketplaceBrowserServerConfig({
        ...configured,
        MARKETPLACE_BROWSER_PUBLIC_TEST_URL: 'https://www.vinted.de/member/123-test?follow=1',
      }),
    /ungültige öffentliche Testseite/,
  );
  assert.throws(
    () =>
      marketplaceBrowserServerConfig({ ...configured, MARKETPLACE_BROWSER_PROVIDER: 'gologin' }),
    /unvollständig/,
  );
  assert.throws(
    () => marketplaceBrowserServerConfig({ ...configured, MARKETPLACE_BROWSER_PORT: '99999' }),
    /unvollständig/,
  );
  assert.deepEqual(marketplaceBrowserServerConfig(configured), {
    supabaseUrl: 'http://127.0.0.1:54351',
    publishableKey: 'public-test-key',
    serviceRoleKey: 'server-test-key',
    provider: 'local',
    goLoginToken: undefined,
    publicTestUrl: 'https://www.vinted.de/member/123-test',
    host: '127.0.0.1',
    port: 4179,
    scheduledSyncEnabled: false,
    listingPublishingEnabled: false,
  });
});

test('scheduled cloud reads default to enabled and support an explicit pause flag', () => {
  const cloud = {
    ...configured,
    MARKETPLACE_BROWSER_PROVIDER: 'gologin',
    GOLOGIN_API_TOKEN: 'test-provider-token',
  };
  assert.equal(marketplaceBrowserServerConfig(cloud).scheduledSyncEnabled, true);
  assert.equal(
    marketplaceBrowserServerConfig({ ...cloud, MARKETPLACE_SCHEDULED_SYNC_ENABLED: '0' })
      .scheduledSyncEnabled,
    false,
  );
  assert.equal(
    marketplaceBrowserServerConfig({ ...cloud, MARKETPLACE_SCHEDULED_SYNC_ENABLED: '1' })
      .scheduledSyncEnabled,
    true,
  );
  assert.throws(
    () =>
      marketplaceBrowserServerConfig({ ...configured, MARKETPLACE_SCHEDULED_SYNC_ENABLED: '1' }),
    /Cloudbetrieb/,
  );
  assert.throws(
    () => marketplaceBrowserServerConfig({ ...cloud, MARKETPLACE_SCHEDULED_SYNC_ENABLED: 'true' }),
    /Aktualisierung/,
  );
});

const chromiumPilot = {
  ...configured,
  MARKETPLACE_BROWSER_PROVIDER: 'chromium',
  MARKETPLACE_CHROMIUM_PILOT_ENABLED: '1',
  MARKETPLACE_BROWSER_PROFILE_ROOT: '/var/lib/flipbase-marketplace',
  MARKETPLACE_CHROMIUM_HOST_PROFILE_ROOT: '/opt/flipbase-marketplace/chromium/profiles',
  MARKETPLACE_CHROMIUM_HOST_ID: 'pilot-01',
  MARKETPLACE_CHROMIUM_IMAGE: `ghcr.io/grischatdev/flipbase-chromium-session:sha-${'a'.repeat(40)}`,
  MARKETPLACE_CHROMIUM_NETWORK: 'flipbase-browser',
};

test('automatic purchases require an explicit flag and the existing Chromium inventory integration', () => {
  const inventory = {
    ...chromiumPilot,
    IPROYAL_API_TOKEN: 'fixture-token',
    MARKETPLACE_CHROMIUM_NETWORK_FILE: '/run/flipbase/networks.json',
  };
  assert.equal(marketplaceBrowserServerConfig(inventory).ipRoyalAutoPurchaseEnabled, false);
  assert.equal(
    marketplaceBrowserServerConfig({ ...inventory, IPROYAL_AUTO_PURCHASE_ENABLED: '1' })
      .ipRoyalAutoPurchaseEnabled,
    true,
  );
  for (const environment of [
    { ...configured, IPROYAL_AUTO_PURCHASE_ENABLED: '1' },
    { ...chromiumPilot, IPROYAL_AUTO_PURCHASE_ENABLED: '1' },
    { ...inventory, IPROYAL_AUTO_PURCHASE_ENABLED: 'true' },
  ])
    assert.throws(() => marketplaceBrowserServerConfig(environment), /IP-Nachbuchung/);
});

test('provider inventory credentials stay server-only and require a private network file', () => {
  assert.throws(() =>
    marketplaceBrowserServerConfig({ ...chromiumPilot, IPROYAL_API_TOKEN: 'fixture-token' }),
  );
  const result = marketplaceBrowserServerConfig({
    ...chromiumPilot,
    IPROYAL_API_TOKEN: 'fixture-token',
    MARKETPLACE_CHROMIUM_NETWORK_FILE: '/var/lib/flipbase-marketplace/cloud-networks.json',
  });
  assert.equal(result.ipRoyalApiToken, 'fixture-token');
  assert.equal(
    marketplaceBrowserServerConfig({ ...configured, IPROYAL_API_TOKEN: 'fixture-token' })
      .ipRoyalApiToken,
    undefined,
  );
});

test('chromium pilot works without GoLogin credentials and starts with scheduling paused', () => {
  const result = marketplaceBrowserServerConfig(chromiumPilot);
  assert.equal(result.provider, 'chromium');
  assert.equal(result.goLoginToken, undefined);
  assert.equal(result.scheduledSyncEnabled, false);
  assert.equal(result.serverProfileRoot, '/var/lib/flipbase-marketplace');
  assert.equal(result.chromiumHostId, 'pilot-01');
  assert.equal(result.chromiumNetworkId, 'direct');
  assert.equal(result.chromiumWritesEnabled, false);
});

test('chromium pilot rejects missing approval, mutable images and unsafe profile locations', () => {
  for (const overrides of [
    { MARKETPLACE_CHROMIUM_PILOT_ENABLED: '0' },
    { MARKETPLACE_CHROMIUM_IMAGE: 'ghcr.io/grischatdev/flipbase-chromium-session:latest' },
    { MARKETPLACE_BROWSER_PROFILE_ROOT: '/' },
    { MARKETPLACE_BROWSER_PROFILE_ROOT: '/safe/../unsafe' },
    { MARKETPLACE_CHROMIUM_HOST_PROFILE_ROOT: '' },
    { MARKETPLACE_CHROMIUM_HOST_ID: '' },
    { MARKETPLACE_CHROMIUM_HOST_ID: '1-pilot' },
    { MARKETPLACE_CHROMIUM_NETWORK: '' },
    { MARKETPLACE_CHROMIUM_NETWORK: 'untrusted-network' },
    { MARKETPLACE_CHROMIUM_NETWORK_FILE: 'relative.json' },
  ])
    assert.throws(() => marketplaceBrowserServerConfig({ ...chromiumPilot, ...overrides }));
});

test('chromium marketplace writes require explicit operator activation', () => {
  assert.equal(
    marketplaceBrowserServerConfig({
      ...chromiumPilot,
      MARKETPLACE_CHROMIUM_WRITES_ENABLED: '1',
    }).chromiumWritesEnabled,
    true,
  );
  assert.throws(() =>
    marketplaceBrowserServerConfig({
      ...chromiumPilot,
      MARKETPLACE_CHROMIUM_WRITES_ENABLED: 'true',
    }),
  );
});
test('listing publication stays disabled until its own activation and Chromium writes are both configured', () => {
  assert.equal(marketplaceBrowserServerConfig(chromiumPilot).listingPublishingEnabled, false);
  assert.equal(
    marketplaceBrowserServerConfig({ ...chromiumPilot, MARKETPLACE_CHROMIUM_WRITES_ENABLED: '1' })
      .listingPublishingEnabled,
    false,
  );
  assert.equal(
    marketplaceBrowserServerConfig({
      ...chromiumPilot,
      MARKETPLACE_CHROMIUM_WRITES_ENABLED: '1',
      MARKETPLACE_LISTING_PUBLISH_ENABLED: '1',
    }).listingPublishingEnabled,
    true,
  );
  for (const overrides of [
    { MARKETPLACE_LISTING_PUBLISH_ENABLED: 'true' },
    { MARKETPLACE_LISTING_PUBLISH_ENABLED: '1' },
    { MARKETPLACE_LISTING_PUBLISH_ENABLED: '1', MARKETPLACE_BROWSER_PROVIDER: 'local' },
  ])
    assert.throws(() => marketplaceBrowserServerConfig({ ...chromiumPilot, ...overrides }));
});

test('chromium scheduling needs deliberate activation and legacy cloud remains configurable', () => {
  const result = marketplaceBrowserServerConfig({
    ...chromiumPilot,
    GOLOGIN_API_TOKEN: 'legacy-only-test-token',
    MARKETPLACE_SCHEDULED_SYNC_ENABLED: '1',
  });
  assert.equal(result.scheduledSyncEnabled, true);
  assert.equal(result.goLoginToken, 'legacy-only-test-token');
});
