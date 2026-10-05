import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  listMarketplaceCloudIps,
  registerMarketplaceCloudIp,
} from '../src/register-marketplace-cloud-ip.ts';

const testUrl = process.env['CLOUD_SETUP_TEST_REST_URL'];
test(
  'registration uses actual REST columns and refuses a second alias of the same exit IP',
  {
    skip: !testUrl,
  },
  async () => {
    assert.ok(testUrl);
    assert.equal(new URL(testUrl).hostname, '127.0.0.1');
    const root = await mkdtemp(join(tmpdir(), 'flipbase-cloud-rest-'));
    const file = join(root, 'networks.json');
    const orderReference = `test-${randomUUID()}`;
    const networks = Array.from({ length: 4 }, () => `test-${randomUUID()}`);
    // Der isolierte Testserver verwendet service_role als Standardrolle, ohne echte Zugangsdaten.
    const request: typeof fetch = (input, options) => {
      const headers = new Headers(options?.headers);
      headers.delete('Authorization');
      headers.delete('apikey');
      const url = new URL(String(input));
      // PostgREST läuft hier direkt, ohne den /rest/v1-Präfix des Supabase-Gateways.
      url.pathname = url.pathname.replace(/^\/rest\/v1\//, '/');
      return fetch(url, { ...options, headers });
    };
    const options = {
      url: testUrl,
      serviceRoleKey: 'isolated-test',
      fetch: request,
      probe: async () => ({ ip: '8.8.8.8', countryCode: 'DE' }),
    };
    const registration = {
      file,
      networkId: networks[0] ?? '',
      orderReference,
      countryCode: 'DE',
      isDedicatedIsp: true,
      expiresAt: '2099-01-01T00:00:00Z',
    };
    try {
      await writeFile(
        file,
        JSON.stringify({
          networkProfiles: networks.map((id) => ({
            id,
            kind: 'proxy',
            server: 'http://proxy.example.test:12323',
            username: 'synthetic-user',
            password: 'synthetic-secret',
          })),
        }),
        { mode: 0o600 },
      );
      assert.equal((await registerMarketplaceCloudIp(registration, options)).status, 'registered');
      assert.equal(
        (await registerMarketplaceCloudIp(registration, options)).status,
        'already_registered',
      );
      const listed = (await listMarketplaceCloudIps(options)).filter(
        (item) => item.orderReference === orderReference,
      );
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.state, 'free');
      await assert.rejects(
        registerMarketplaceCloudIp({ ...registration, networkId: networks[1] ?? '' }, options),
      );
      const after = (await listMarketplaceCloudIps(options)).filter(
        (item) => item.orderReference === orderReference,
      );
      assert.equal(after.length, 1);
      const changedExit = { ...options, probe: async () => ({ ip: '8.8.4.4', countryCode: 'DE' }) };
      await assert.rejects(registerMarketplaceCloudIp(registration, changedExit));
      const concurrent = await Promise.allSettled(
        networks
          .slice(2)
          .map((networkId) =>
            registerMarketplaceCloudIp({ ...registration, networkId }, changedExit),
          ),
      );
      assert.deepEqual(concurrent.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
      const finalRows = (await listMarketplaceCloudIps(options)).filter(
        (item) => item.orderReference === orderReference,
      );
      assert.equal(finalRows.length, 2);
    } finally {
      const response = await request(
        `${testUrl}/rest/v1/marketplace_cloud_ips?order_reference=eq.${orderReference}`,
        { method: 'DELETE' },
      );
      assert.equal(response.ok, true);
      await rm(root, { recursive: true, force: true });
    }
  },
);
