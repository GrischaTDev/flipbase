import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  registerMarketplaceCloudIp,
  listMarketplaceCloudIps,
} from '../src/register-marketplace-cloud-ip.ts';

const metadata = {
  networkId: 'iproyal-pilot-a',
  orderReference: 'test-order',
  countryCode: 'DE',
  isDedicatedIsp: true,
  expiresAt: '2099-01-01T00:00:00Z',
};
test('list returns only administrative metadata and marks held and expired IPs', async () => {
  const row = {
    network_id: metadata.networkId,
    provider: 'iproyal',
    order_reference: metadata.orderReference,
    country_code: 'DE',
    is_dedicated_isp: true,
    expires_at: metadata.expiresAt,
    is_enabled: true,
    verified_at: '2026-10-05T00:00:00Z',
    marketplace_cloud_setups: [{ state: 'completed' }],
    password: 'synthetic-secret',
  };
  const result = await listMarketplaceCloudIps({
    url: 'https://db.example.test',
    serviceRoleKey: 'test-key',
    fetch: async () =>
      Response.json([row, { ...row, network_id: 'expired', expires_at: '2000-01-01T00:00:00Z' }]),
  });
  assert.deepEqual(
    result.map((item) => item.state),
    ['completed', 'expired'],
  );
  assert.equal(JSON.stringify(result).includes('synthetic-secret'), false);
});
test('an existing network cannot be silently overwritten for another order', async () => {
  const { root, path } = await fixture();
  let writes = 0;
  try {
    await assert.rejects(
      registerMarketplaceCloudIp(
        { ...metadata, file: path },
        {
          url: 'https://db.example.test',
          serviceRoleKey: 'test-key',
          probe: async () => ({ ip: '8.8.8.8', countryCode: 'DE' }),
          fetch: async (_input, init) => {
            if (init?.method === 'POST') writes++;
            return Response.json([
              { network_id: metadata.networkId, order_reference: 'other-order' },
            ]);
          },
        },
      ),
    );
    assert.equal(writes, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-cloud-registration-'));
  const path = join(root, 'networks.json');
  await writeFile(
    path,
    JSON.stringify({
      networkProfiles: [
        {
          id: metadata.networkId,
          kind: 'proxy',
          server: 'http://proxy.example.test:12323',
          username: 'synthetic-user',
          password: 'synthetic-secret',
        },
      ],
    }),
    { mode: 0o600 },
  );
  return { root, path };
}
test('registration verifies German outbound before storing only metadata and resolves lost ACK', async () => {
  const { root, path } = await fixture();
  let saved: Record<string, unknown> | null = null;
  const calls: string[] = [];
  try {
    const request: typeof fetch = async (input, init) => {
      calls.push(String(input));
      if (init?.method === 'POST') {
        saved = JSON.parse(String(init.body));
        throw new Error('synthetic-secret lost ACK');
      }
      return Response.json(saved ? [saved] : []);
    };
    const result = await registerMarketplaceCloudIp(
      { ...metadata, file: path },
      {
        url: 'https://db.example.test',
        serviceRoleKey: 'test-key',
        fetch: request,
        probe: async () => ({ ip: '8.8.8.8', countryCode: 'DE' }),
      },
    );
    assert.equal(result.status, 'registered');
    assert.equal(calls.filter((call) => call.includes('marketplace_cloud_ips')).length, 3);
    assert.ok(saved);
    assert.equal(JSON.stringify(saved).includes('synthetic-secret'), false);
    assert.equal(JSON.stringify(saved).includes('server'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('wrong location and expired order never register an IP or reveal credentials', async () => {
  const { root, path } = await fixture();
  let calls = 0;
  try {
    for (const overrides of [{ countryCode: 'FR' }, { expiresAt: '2000-01-01T00:00:00Z' }, {}]) {
      await assert.rejects(
        registerMarketplaceCloudIp(
          { ...metadata, ...overrides, file: path },
          {
            url: 'https://db.example.test',
            serviceRoleKey: 'test-key',
            fetch: async () => {
              calls++;
              return Response.json([]);
            },
            probe: async () => ({ ip: '8.8.8.8', countryCode: 'FR' }),
          },
        ),
        (error: unknown) => error instanceof Error && !error.message.includes('synthetic-secret'),
      );
    }
    assert.equal(calls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('missing credentials and relative files cannot be registered', async () => {
  const { root, path } = await fixture();
  let calls = 0;
  const options = {
    url: 'https://db.example.test',
    serviceRoleKey: 'test-key',
    fetch: async () => {
      calls++;
      return Response.json([]);
    },
    probe: async () => ({ ip: '8.8.8.8', countryCode: 'DE' }),
  };
  try {
    await writeFile(
      path,
      JSON.stringify({
        networkProfiles: [
          { id: metadata.networkId, kind: 'proxy', server: 'http://proxy.example.test:12323' },
        ],
      }),
      { mode: 0o600 },
    );
    await assert.rejects(registerMarketplaceCloudIp({ ...metadata, file: path }, options));
    await assert.rejects(
      registerMarketplaceCloudIp({ ...metadata, file: 'networks.json' }, options),
    );
    assert.equal(calls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test(
  'symlinks and public file permissions are refused',
  { skip: process.platform === 'win32' },
  async () => {
    const { root, path } = await fixture();
    let calls = 0;
    const options = {
      url: 'https://db.example.test',
      serviceRoleKey: 'test-key',
      fetch: async () => {
        calls++;
        return Response.json([]);
      },
      probe: async () => ({ ip: '8.8.8.8', countryCode: 'DE' }),
    };
    try {
      const link = join(root, 'link.json');
      await symlink(path, link);
      await assert.rejects(registerMarketplaceCloudIp({ ...metadata, file: link }, options));
      const publicFile = join(root, 'public.json');
      await writeFile(publicFile, '{}', { mode: 0o644 });
      await assert.rejects(registerMarketplaceCloudIp({ ...metadata, file: publicFile }, options));
      assert.equal(calls, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
