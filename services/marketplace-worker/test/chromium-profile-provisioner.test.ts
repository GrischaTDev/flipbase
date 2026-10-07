import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChromiumAccountProfileRegistry } from '../src/chromium-account-profile-registry.ts';
import { ChromiumProfileProvisioner } from '../src/chromium-profile-provisioner.ts';
import type { PrivateCloudSetup } from '../src/supabase-marketplace-cloud-setup-store.ts';

const scope = {
  workspaceId: 'workspace-a',
  connectionId: 'account-a',
  userId: 'user-a',
  userAccessToken: 'user-token',
};

for (const existingProfile of [false, true]) {
  test(`a missing reserved IP cannot reuse or recreate a direct profile: existing=${existingProfile}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'chromium-missing-proxy-'));
    try {
      const registry = new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' });
      const old = existingProfile ? await registry.create(scope) : null;
      const provisioner = new ChromiumProfileProvisioner({
        supabaseUrl: 'https://example.test',
        publishableKey: 'public',
        serviceRoleKey: 'server',
        registry,
        cloudSetups: {
          assertNetwork: async () => null,
          readAuthorized: async () => {
            throw new Error('no setup');
          },
          step: async () => {
            throw new Error('no transition');
          },
        },
        fetch: async (input, request) => {
          if (String(input).includes('marketplace_list_connections'))
            return Response.json({
              connections: [
                { ...scope, marketplace: 'vinted', executionMode: 'cloud', status: 'connected' },
              ],
            });
          assert.notEqual(request?.method, 'POST');
          return Response.json(old ? [{ provider_profile_id: old.profileId }] : []);
        },
      });
      await assert.rejects(provisioner.prepare(scope), /Cloud-IP muss zuerst/);
      assert.equal(
        (await registry.find(scope.workspaceId, scope.connectionId))?.profileId ?? null,
        old?.profileId ?? null,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

for (const uncertainStop of [false, true]) {
  test(`cloud setup replaces only a stopped old profile, uncertain=${uncertainStop}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'chromium-cloud-provision-'));
    try {
      const registry = new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' });
      const old = await registry.create({
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
      });
      let mapping: string | null = old.profileId;
      let privateSetup: PrivateCloudSetup = {
        setup: { ...scope, setupId: 'setup-a', state: 'reserved', sessionId: null },
        networkId: 'iproyal-test-a',
        profileId: null,
        previousProfileId: null,
        expiresAt: '2099-01-01T00:00:00Z',
        ipExpiresAt: '2099-01-01T00:00:00Z',
      };
      const events: string[] = [];
      const provisioner = new ChromiumProfileProvisioner({
        supabaseUrl: 'https://example.test',
        publishableKey: 'public',
        serviceRoleKey: 'server',
        registry,
        networks: { resolve: () => ({ kind: 'proxy', server: 'http://proxy.example.test:12323' }) },
        stopProfile: async () => {
          events.push('stop');
          if (uncertainStop) throw new Error('uncertain');
        },
        cloudSetups: {
          readAuthorized: async () => privateSetup,
          assertNetwork: async () => null,
          step: async (_scope, _id, action, fields) => {
            events.push(action);
            if (action === 'unmap') {
              assert.equal(fields?.profileId, old.profileId);
              mapping = null;
              privateSetup = { ...privateSetup, previousProfileId: old.profileId };
            }
            if (action === 'bind') {
              mapping = fields?.profileId ?? null;
              privateSetup = {
                ...privateSetup,
                profileId: mapping,
                setup: { ...privateSetup.setup, state: 'login' },
              };
              throw new Error('lost binding ACK');
            }
            return privateSetup;
          },
        },
        fetch: async (url, request) => {
          assert.notEqual(request?.method, 'DELETE');
          if (String(url).includes('marketplace_browser_sessions')) return Response.json([]);
          return Response.json(mapping ? [{ provider_profile_id: mapping }] : []);
        },
      });
      if (uncertainStop) {
        await assert.rejects(provisioner.prepareCloudSetup(scope, 'setup-a'));
        assert.deepEqual(events, ['stop']);
        assert.equal(
          (await registry.find(scope.workspaceId, scope.connectionId))?.profileId,
          old.profileId,
        );
      } else {
        await provisioner.prepareCloudSetup(scope, 'setup-a');
        assert.deepEqual(events, ['stop', 'unmap', 'bind']);
        assert.ok(mapping);
        assert.notEqual(mapping, old.profileId);
        assert.equal((await registry.resolve(mapping)).networkId, 'iproyal-test-a');
        await provisioner.prepareCloudSetup(scope, 'setup-a');
        assert.deepEqual(events, ['stop', 'unmap', 'bind']);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('new Chromium account rechecks user access and persists namespace without GoLogin APIs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-provision-'));
  let profileId: string | undefined;
  let authorizations = 0;
  try {
    const registry = new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' });
    const provisioner = new ChromiumProfileProvisioner({
      supabaseUrl: 'https://example.test',
      publishableKey: 'public',
      serviceRoleKey: 'server',
      registry,
      fetch: async (input, options) => {
        const url = new URL(String(input));
        assert.equal(url.host, 'example.test');
        if (url.pathname.endsWith('marketplace_list_connections')) {
          assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer user-token');
          authorizations++;
          return Response.json({
            connections: [
              { ...scope, marketplace: 'vinted', executionMode: 'cloud', status: 'login_required' },
            ],
          });
        }
        if (options?.method === 'POST') {
          profileId = (JSON.parse(String(options.body)) as Record<string, string>)[
            'provider_profile_id'
          ];
          return new Response(null, { status: 201 });
        }
        return Response.json(profileId ? [{ provider_profile_id: profileId }] : []);
      },
    });
    await provisioner.prepare(scope);
    assert.ok(profileId);
    assert.match(profileId, /^chromium_/);
    assert.equal((await registry.resolve(profileId)).connectionId, scope.connectionId);
    assert.ok(authorizations >= 2);
    await provisioner.prepare(scope);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('existing GoLogin mapping is delegated and never silently migrated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-provision-'));
  let delegated = 0;
  try {
    const provisioner = new ChromiumProfileProvisioner({
      supabaseUrl: 'https://example.test',
      publishableKey: 'public',
      serviceRoleKey: 'server',
      registry: new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' }),
      legacy: {
        prepare: async () => {
          delegated++;
        },
      },
      fetch: async (input, options) => {
        if (String(input).includes('marketplace_list_connections'))
          return Response.json({
            connections: [
              { ...scope, marketplace: 'vinted', executionMode: 'cloud', status: 'connected' },
            ],
          });
        assert.notEqual(options?.method, 'POST');
        return Response.json([{ provider_profile_id: 'existing-gologin' }]);
      },
    });
    await provisioner.prepare(scope);
    assert.equal(delegated, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('unresolved stop blocks connection deletion and local archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-provision-'));
  let stopped = false;
  try {
    const provisioner = new ChromiumProfileProvisioner({
      supabaseUrl: 'https://example.test',
      publishableKey: 'public',
      serviceRoleKey: 'server',
      registry: new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' }),
      fetch: async (input, options) => {
        assert.notEqual(options?.method, 'DELETE');
        const url = String(input);
        if (url.includes('marketplace_list_connections'))
          return Response.json({
            connections: [
              { ...scope, marketplace: 'vinted', executionMode: 'cloud', status: 'paused' },
            ],
          });
        if (url.includes('marketplace_set_paused')) return Response.json({});
        if (url.includes('marketplace_browser_sessions')) return Response.json([{ id: 1 }]);
        return Response.json([
          { provider_profile_id: 'chromium_00000000-0000-4000-8000-000000000001' },
        ]);
      },
    });
    await assert.rejects(
      provisioner.remove(scope, async () => {
        stopped = true;
      }),
    );
    assert.equal(stopped, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const committed of [false, true]) {
  test(`lost provisioning ACK reconciles same private reference without duplicate: committed=${committed}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'chromium-provision-'));
    let mapping: string | null = null;
    let attempts = 0;
    const createdIds: string[] = [];
    try {
      const registry = new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' });
      const provisioner = new ChromiumProfileProvisioner({
        supabaseUrl: 'https://example.test',
        publishableKey: 'public',
        serviceRoleKey: 'server',
        registry,
        fetch: async (input, options) => {
          if (String(input).includes('marketplace_list_connections'))
            return Response.json({
              connections: [
                { ...scope, marketplace: 'vinted', executionMode: 'cloud', status: 'needs_login' },
              ],
            });
          if (options?.method === 'POST') {
            const profileId = (JSON.parse(String(options.body)) as Record<string, string>)[
              'provider_profile_id'
            ];
            if (!profileId) throw new Error('missing profile');
            attempts++;
            createdIds.push(profileId);
            if (attempts > 1 || committed) mapping = profileId;
            if (attempts === 1) throw new Error('lost ACK');
            return new Response(null, { status: 201 });
          }
          return Response.json(mapping ? [{ provider_profile_id: mapping }] : []);
        },
      });
      if (committed) await provisioner.prepare(scope);
      else await assert.rejects(provisioner.prepare(scope));
      await provisioner.prepare(scope);
      assert.equal(new Set(createdIds).size, 1);
      assert.equal(
        (await registry.find(scope.workspaceId, scope.connectionId))?.profileId,
        mapping,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('empty DB session list does not permit deletion if orphan process stop is uncertain', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-provision-'));
  let stops = 0;
  try {
    const registry = new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' });
    const profile = await registry.create({
      workspaceId: scope.workspaceId,
      connectionId: scope.connectionId,
    });
    const provisioner = new ChromiumProfileProvisioner({
      supabaseUrl: 'https://example.test',
      publishableKey: 'public',
      serviceRoleKey: 'server',
      registry,
      stopProfile: async () => {
        stops++;
        throw new Error('uncertain');
      },
      fetch: async (input, options) => {
        assert.notEqual(options?.method, 'DELETE');
        const url = String(input);
        if (url.includes('marketplace_list_connections'))
          return Response.json({
            connections: [
              { ...scope, marketplace: 'vinted', executionMode: 'cloud', status: 'paused' },
            ],
          });
        if (url.includes('marketplace_set_paused')) return Response.json({});
        if (url.includes('marketplace_browser_sessions')) return Response.json([]);
        return Response.json([{ provider_profile_id: profile.profileId }]);
      },
    });
    await assert.rejects(provisioner.remove(scope, async () => undefined));
    assert.equal(stops, 1);
    assert.deepEqual(await registry.resolve(profile.profileId), profile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local accounts cannot create a Chromium profile or call providers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-local-reject-'));
  try {
    let requests = 0;
    const registry = new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' });
    const provisioner = new ChromiumProfileProvisioner({
      supabaseUrl: 'https://example.test',
      publishableKey: 'public',
      serviceRoleKey: 'server',
      registry,
      fetch: async (input) => {
        requests++;
        assert.ok(String(input).endsWith('marketplace_list_connections'));
        return Response.json({
          connections: [
            { ...scope, marketplace: 'vinted', status: 'connected', executionMode: 'local' },
          ],
        });
      },
    });
    await assert.rejects(provisioner.prepare(scope));
    assert.equal(requests, 1);
    assert.equal(await registry.find(scope.workspaceId, scope.connectionId), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
