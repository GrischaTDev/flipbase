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
  });
});

test('scheduled cloud reads remain off until their separate server flag is enabled', () => {
  const cloud = {
    ...configured,
    MARKETPLACE_BROWSER_PROVIDER: 'gologin',
    GOLOGIN_API_TOKEN: 'test-provider-token',
  };
  assert.equal(marketplaceBrowserServerConfig(cloud).scheduledSyncEnabled, false);
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
