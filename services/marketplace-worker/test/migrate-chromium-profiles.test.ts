import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChromiumAccountProfileRegistry } from '../src/chromium-account-profile-registry.ts';
import { ChromiumProfileMaintenance } from '../src/migrate-chromium-profiles.ts';

test('migration retains account identity and legacy rollback reference, readback confirms lost ACK', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-migrate-'));
  let mapping = 'legacy-profile';
  const events: string[] = [];
  try {
    const registry = new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' });
    const maintenance = new ChromiumProfileMaintenance({
      url: 'https://example.test',
      serviceRoleKey: 'server',
      registry,
      heartbeat: async () => true,
      stopProfile: async (profileId) => {
        events.push(`stop:${profileId}`);
      },
      fetch: async (input, options) => {
        const url = new URL(String(input));
        if (
          url.pathname.endsWith('marketplace_browser_sessions') ||
          url.pathname.endsWith('marketplace_operations')
        )
          return Response.json([]);
        if (url.pathname.endsWith('marketplace_connections')) {
          if (options?.method === 'PATCH') {
            const body = JSON.parse(String(options.body)) as Record<string, unknown>;
            assert.deepEqual(Object.keys(body).sort(), ['resume_status', 'status', 'updated_at']);
            return Response.json([{ id: 'account-a', status: 'needs_login' }]);
          }
          return Response.json([
            {
              id: 'account-a',
              workspace_id: 'workspace-a',
              marketplace: 'vinted',
              status: 'paused',
              external_account_id: 'real-account',
            },
          ]);
        }
        if (options?.method === 'PATCH') {
          assert.equal(url.searchParams.get('provider_profile_id'), 'eq.legacy-profile');
          mapping =
            (JSON.parse(String(options.body)) as Record<string, string>)['provider_profile_id'] ??
            '';
          throw new Error('ACK lost');
        }
        return Response.json([{ provider_profile_id: mapping }]);
      },
    });
    const profileId = await maintenance.run(
      'migrate',
      'workspace-a',
      'account-a',
      'legacy-profile',
    );
    assert.equal(mapping, profileId);
    assert.equal((await registry.resolve(profileId)).previousGoLoginProfileId, 'legacy-profile');
    assert.deepEqual(events, ['stop:legacy-profile']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('open jobs or runtime loss prohibit migration before stopping or changing mappings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-migrate-'));
  try {
    for (const runtimeActive of [false, true]) {
      const maintenance = new ChromiumProfileMaintenance({
        url: 'https://example.test',
        serviceRoleKey: 'server',
        registry: new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' }),
        heartbeat: async () => runtimeActive,
        stopProfile: async () => {
          throw new Error('must not stop');
        },
        fetch: async (_input, options) => {
          assert.notEqual(options?.method, 'PATCH');
          return Response.json([{ id: 1 }]);
        },
      });
      await assert.rejects(
        maintenance.run('migrate', 'workspace-a', 'account-a', 'legacy-profile'),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rollback stops immutable Chromium reference before restoring only its recorded GoLogin reference', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-migrate-'));
  try {
    const registry = new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' });
    const profile = await registry.create({
      workspaceId: 'workspace-a',
      connectionId: 'account-a',
      previousGoLoginProfileId: 'legacy-original',
    });
    let mapping = profile.profileId;
    const stops: string[] = [];
    const maintenance = new ChromiumProfileMaintenance({
      url: 'https://example.test',
      serviceRoleKey: 'server',
      registry,
      heartbeat: async () => true,
      stopProfile: async (profileId) => {
        stops.push(profileId);
      },
      fetch: async (input, options) => {
        const url = new URL(String(input));
        if (
          url.pathname.endsWith('marketplace_operations') ||
          url.pathname.endsWith('marketplace_browser_sessions')
        )
          return Response.json([]);
        if (url.pathname.endsWith('marketplace_connections'))
          return Response.json([{ id: 'account-a', status: 'paused' }]);
        if (options?.method === 'PATCH') {
          assert.equal(url.searchParams.get('provider_profile_id'), `eq.${profile.profileId}`);
          mapping =
            (JSON.parse(String(options.body)) as Record<string, string>)['provider_profile_id'] ??
            '';
        }
        return Response.json([{ provider_profile_id: mapping }]);
      },
    });
    assert.equal(
      await maintenance.run('rollback', 'workspace-a', 'account-a', profile.profileId),
      'legacy-original',
    );
    assert.deepEqual(stops, [profile.profileId]);
    assert.deepEqual(await registry.resolve(profile.profileId), profile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('uncertain provider stop keeps original mapping without metadata changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-migrate-'));
  try {
    const maintenance = new ChromiumProfileMaintenance({
      url: 'https://example.test',
      serviceRoleKey: 'server',
      registry: new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' }),
      heartbeat: async () => true,
      stopProfile: async () => {
        throw new Error('uncertain');
      },
      fetch: async (input, options) => {
        assert.notEqual(options?.method, 'PATCH');
        const url = String(input);
        if (url.includes('marketplace_operations') || url.includes('marketplace_browser_sessions'))
          return Response.json([]);
        if (url.includes('marketplace_connections'))
          return Response.json([{ id: 'account-a', status: 'paused' }]);
        return Response.json([{ provider_profile_id: 'legacy-profile' }]);
      },
    });
    await assert.rejects(maintenance.run('migrate', 'workspace-a', 'account-a', 'legacy-profile'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
