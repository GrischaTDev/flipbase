import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GoLoginProfileProvisioner } from '../src/gologin-profile-provisioner.ts';
import { GoLoginApiLimitError } from '../src/gologin-api-limit.ts';
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
  options: {
    deny?: boolean;
    revokeAfterCreate?: boolean;
    loseInsertAck?: boolean;
    stored?: boolean;
    unresolved?: boolean;
    missingProvider?: boolean;
    uncertainDelete?: boolean;
    blocked?: boolean;
  } = {},
) {
  let stored: string | null = options.stored ? profileId : null;
  let paused = false;
  let removed = false;
  let checks = 0;
  let created = 0;
  let deleted = 0;
  const request: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/users-proxies/geolocation/traffic'))
      return json({ residentTrafficData: { trafficLimitBytes: 500, trafficUsedBytes: 0 } });
    if (url.endsWith('/users-proxies/mobile-proxy')) return json({});
    if (url.endsWith(`/browser/${profileId}`) && options.missingProvider)
      return new Response(null, { status: 404 });
    if (url.endsWith(`/browser/${profileId}`))
      return json({
        proxyEnabled: true,
        proxy: { mode: 'geolocation', host: 'synthetic.example', port: 1234 },
      });
    if (url.endsWith('/rest/v1/rpc/marketplace_list_connections')) {
      checks++;
      if (options.deny || (options.revokeAfterCreate && checks > 1)) return json({}, 403);
      return json({
        connections: [
          {
            workspaceId: scope.workspaceId,
            connectionId: scope.connectionId,
            marketplace: 'vinted',
            status: options.blocked ? 'blocked' : 'needs_login',
          },
        ],
      });
    }
    if (url.endsWith('/rest/v1/rpc/marketplace_set_paused')) {
      paused = true;
      return json({ ok: true });
    }
    if (url.includes('/rest/v1/marketplace_browser_sessions'))
      return json(options.unresolved ? [{ id: 1 }] : []);
    if (url.includes('/rest/v1/marketplace_connections') && init?.method === 'DELETE') {
      if (!paused && !options.blocked) throw new Error('delete before pause');
      removed = true;
      return json([{ id: scope.connectionId }]);
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
      if (options.missingProvider || options.uncertainDelete)
        return new Response(null, { status: 404 });
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
    counts: () => ({ checks, created, deleted, stored, paused, removed }),
  };
}

test('creates one persistent profile and reuses it for the same connection', async () => {
  const f = fixture();
  await f.provisioner.prepare(scope);
  await f.provisioner.prepare(scope);
  assert.deepEqual(f.counts(), {
    checks: 4,
    created: 1,
    deleted: 0,
    stored: profileId,
    paused: false,
    removed: false,
  });
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
  assert.deepEqual(f.counts(), {
    checks: 2,
    created: 1,
    deleted: 1,
    stored: null,
    paused: false,
    removed: false,
  });
});

test('keeps a committed profile after a lost database acknowledgement', async () => {
  const f = fixture({ loseInsertAck: true });
  await f.provisioner.prepare(scope);
  assert.deepEqual(f.counts(), {
    checks: 3,
    created: 1,
    deleted: 0,
    stored: profileId,
    paused: false,
    removed: false,
  });
});

test('reports a provider API limit before saving a profile for the account', async () => {
  const request: typeof fetch = async (input) => {
    if (String(input).endsWith('/browser/quick'))
      return new Response(
        'You have reached your free API requests limit. Please subscribe to continue.',
        {
          status: 403,
        },
      );
    // Use the same synthetic account authorization and empty profile mapping.
    if (String(input).endsWith('/rest/v1/rpc/marketplace_list_connections'))
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
    if (String(input).includes('/rest/v1/marketplace_browser_profiles')) return json([]);
    throw new Error(`Unexpected endpoint: ${String(input)}`);
  };
  const provisioner = new GoLoginProfileProvisioner({
    supabaseUrl: 'https://database.example.test',
    publishableKey: 'public-key',
    serviceRoleKey: 'server-key',
    goLoginToken: 'provider-token',
    fetch: request,
  });
  await assert.rejects(provisioner.prepare(scope), GoLoginApiLimitError);
});

test('sperrt eine Verbindung vor dem Löschen und entfernt das gespeicherte Browserprofil', async () => {
  const f = fixture({ stored: true });
  let stopped = false;
  await f.provisioner.remove(scope, async () => {
    stopped = true;
  });
  assert.equal(stopped, true);
  assert.equal(f.counts().paused, true);
  assert.equal(f.counts().deleted, 1);
  assert.equal(f.counts().removed, true);
});

test('löscht weder Profil noch Konto solange eine Browsersitzung ungeklärt ist', async () => {
  const f = fixture({ stored: true, unresolved: true });
  await assert.rejects(
    f.provisioner.remove(scope, async () => undefined),
    /Browsersitzung/,
  );
  assert.equal(f.counts().paused, true);
  assert.equal(f.counts().deleted, 0);
  assert.equal(f.counts().removed, false);
});

test('verweigert das Löschen für ein fremdes Konto vor Anbieterzugriff', async () => {
  const f = fixture({ stored: true });
  await assert.rejects(
    f.provisioner.remove(
      { ...scope, connectionId: '25600000-0000-4000-8000-000000000022' },
      async () => undefined,
    ),
    /Kontozugriff verweigert/,
  );
  assert.equal(f.counts().deleted, 0);
  assert.equal(f.counts().removed, false);
});

test('wiederholt eine Löschung nur wenn ein fehlendes Anbieterprofil bestätigt ist', async () => {
  const missing = fixture({ stored: true, missingProvider: true });
  await missing.provisioner.remove(scope, async () => undefined);
  assert.equal(missing.counts().removed, true);
  const uncertain = fixture({ stored: true, uncertainDelete: true });
  await assert.rejects(
    uncertain.provisioner.remove(scope, async () => undefined),
    /Browserprofil/,
  );
  assert.equal(uncertain.counts().removed, false);
});

test('entfernt auch eine bereits gesperrte Verbindung ohne erneuten Pausenaufruf', async () => {
  const f = fixture({ stored: true, blocked: true });
  await f.provisioner.remove(scope, async () => undefined);
  assert.equal(f.counts().paused, false);
  assert.equal(f.counts().removed, true);
});
