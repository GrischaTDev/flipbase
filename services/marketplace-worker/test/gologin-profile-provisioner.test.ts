import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GoLoginProfileProvisioner } from '../src/gologin-profile-provisioner.ts';
import type { BrowserSessionScope } from '../src/marketplace-browser-session-broker.ts';

const scope: BrowserSessionScope = {
  workspaceId: '25600000-0000-4000-8000-000000000011',
  connectionId: '25600000-0000-4000-8000-000000000021',
  userId: '25600000-0000-4000-8000-000000000001',
  userAccessToken: 'user-token',
};
const profileId = 'provider-profile-a';

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fixture(
  options: { deny?: boolean; revokeAfterCreate?: boolean; loseInsertAck?: boolean } = {},
) {
  let stored: string | null = null;
  let checks = 0;
  let created = 0;
  let deleted = 0;
  const request: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/rest/v1/rpc/marketplace_list_connections')) {
      checks++;
      if (options.deny || (options.revokeAfterCreate && checks > 1)) return json({}, 403);
      return json({
        connections: [
          {
            workspaceId: scope.workspaceId,
            connectionId: scope.connectionId,
            marketplace: 'vinted',
            status: 'needs_login',
          },
        ],
      });
    }
    if (url.includes('/rest/v1/marketplace_browser_profiles')) {
      if (init?.method === 'POST') {
        stored = profileId;
        return options.loseInsertAck ? json({}, 503) : new Response(null, { status: 201 });
      }
      return json(stored ? [{ provider_profile_id: stored }] : []);
    }
    if (url.endsWith('/browser/quick')) {
      created++;
      return json({ id: profileId }, 201);
    }
    if (url.endsWith('/browser') && init?.method === 'DELETE') {
      deleted++;
      return new Response(null, { status: 204 });
    }
    throw new Error('Unexpected endpoint');
  };
  return {
    provisioner: new GoLoginProfileProvisioner({
      supabaseUrl: 'https://database.example.test',
      publishableKey: 'public-key',
      serviceRoleKey: 'server-key',
      goLoginToken: 'provider-token',
      fetch: request,
    }),
    counts: () => ({ checks, created, deleted, stored }),
  };
}

test('creates one persistent profile and reuses it for the same connection', async () => {
  const f = fixture();
  await f.provisioner.prepare(scope);
  await f.provisioner.prepare(scope);
  assert.deepEqual(f.counts(), { checks: 3, created: 1, deleted: 0, stored: profileId });
});

test('rejects a non-operator before calling the provider', async () => {
  const f = fixture({ deny: true });
  await assert.rejects(f.provisioner.prepare(scope), /Kontozugriff verweigert/);
  assert.equal(f.counts().created, 0);
});

test('rejects a foreign account before creating a provider profile', async () => {
  const f = fixture();
  await assert.rejects(
    f.provisioner.prepare({ ...scope, connectionId: '25600000-0000-4000-8000-000000000022' }),
    /Kontozugriff verweigert/,
  );
  assert.equal(f.counts().created, 0);
});

test('deletes a new provider profile when permission is revoked during creation', async () => {
  const f = fixture({ revokeAfterCreate: true });
  await assert.rejects(f.provisioner.prepare(scope), /nicht zugeordnet/);
  assert.deepEqual(f.counts(), { checks: 2, created: 1, deleted: 1, stored: null });
});

test('keeps a committed profile after a lost database acknowledgement', async () => {
  const f = fixture({ loseInsertAck: true });
  await f.provisioner.prepare(scope);
  assert.deepEqual(f.counts(), { checks: 2, created: 1, deleted: 0, stored: profileId });
});
