import assert from 'node:assert/strict';
import { test } from 'node:test';
import { marketplaceBrowserServerConfig } from '../src/marketplace-browser-server-config.ts';

const configured = {
  MARKETPLACE_BROWSER_TEST_ENABLED: '1',
  SUPABASE_URL: 'http://127.0.0.1:54351',
  SUPABASE_ANON_KEY: 'public-test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'server-test-key',
  GOLOGIN_API_TOKEN: 'provider-test-key',
};

test('requires deliberate activation and server-only keys before listening', () => {
  assert.throws(() => marketplaceBrowserServerConfig({}), /nicht freigegeben/);
  assert.throws(
    () => marketplaceBrowserServerConfig({ ...configured, GOLOGIN_API_TOKEN: '' }),
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
    goLoginToken: 'provider-test-key',
    host: '127.0.0.1',
    port: 4179,
  });
});
