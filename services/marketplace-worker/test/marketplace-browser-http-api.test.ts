import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import {
  MarketplaceBrowserHttpApi,
  SupabaseBrowserUserVerifier,
} from '../src/marketplace-browser-http-api.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import type { MarketplaceSyncRunner } from '../src/marketplace-sync-runner.ts';
import type { SupabaseVintedListingCache } from '../src/supabase-vinted-listing-cache.ts';
import type { SupabaseVintedProfileCache } from '../src/supabase-vinted-profile-cache.ts';
import type { VintedEditAccess } from '../src/vinted-edit-access.ts';
import { VintedImportReadError, type VintedAccountImport } from '../src/vinted-account-import.ts';
import { GoLoginApiLimitError, GoLoginProfileLimitError } from '../src/gologin-api-limit.ts';
import {
  VintedLoginPendingError,
  VintedLoginRejectedError,
  VintedVerificationRequiredError,
} from '../src/vinted-browser-reader.ts';
import {
  MarketplaceBrowserSessionBusyError,
  MarketplaceBrowserSessionEndedError,
  type BrowserSessionScope,
} from '../src/marketplace-browser-session-broker.ts';

const workspaceA = '25600000-0000-4000-8000-000000000011';
const workspaceB = '25600000-0000-4000-8000-000000000012';
const accountA = '25600000-0000-4000-8000-000000000021';
const accountB = '25600000-0000-4000-8000-000000000022';
const sessionId = '25600000-0000-4000-8000-000000000031';

async function setup(
  frame = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
  captureGate?: Promise<void>,
  readOnly = false,
  runError?: Error,
  prepare?: (scope: BrowserSessionScope) => Promise<void>,
  identity?: { id: string; username: string } | Error | null,
  confirm?: (scope: BrowserSessionScope, id: string) => Promise<void>,
  loginGate?: Promise<void>,
  remove?: (scope: BrowserSessionScope, stop: () => Promise<void>) => Promise<void>,
  importAccount?: () => Promise<VintedAccountImport>,
  writeImport?: (
    scope: BrowserSessionScope,
    id: string,
    snapshot: VintedAccountImport,
  ) => Promise<Record<'profile' | 'publication' | 'conversation' | 'message' | 'sale', number>>,
  edits?: VintedEditAccess,
  editBrowser?: Partial<BrowserInfo>,
  closeError?: Error,
  operations?: Pick<MarketplaceSyncRunner, 'start' | 'read'>,
  listingCache?: Pick<SupabaseVintedListingCache, 'save'>,
  profileCache?: Pick<SupabaseVintedProfileCache, 'save'>,
  scheduledSync?: () => {
    enabled: boolean;
    authorizationVersion: number;
    allowedIntervals: number[];
  },
) {
  const inputs: string[] = [];
  let owner: BrowserSessionScope | undefined;
  let runs = 0;
  let closes = 0;
  const browser: BrowserInfo = {
    version: () => 'synthetic browser',
    capture: async () => {
      await captureGate;
      return frame;
    },
    click: async (x, y) => {
      inputs.push(`click:${x}:${y}`);
    },
    type: async (value) => {
      inputs.push(`type:${value}`);
    },
    press: async (key) => {
      inputs.push(`press:${key}`);
    },
    identify: async () => {
      if (identity instanceof Error) throw identity;
      return identity ?? null;
    },
    login: async (credentials, authorize) => {
      await loginGate;
      await authorize();
      inputs.push(`login:${credentials.username}`);
      return 'submitted';
    },
    verify: async (_code, authorize) => {
      await authorize();
      inputs.push('verification-submitted');
      return 'submitted';
    },
    importAccount: importAccount
      ? async (authorize) => {
          await authorize();
          return importAccount();
        }
      : undefined,
    ...editBrowser,
  };
  const broker = {
    open: async (scope: BrowserSessionScope) => {
      owner = scope;
      return sessionId;
    },
    run: async <T>(
      scope: BrowserSessionScope,
      id: string,
      operation: (value: BrowserInfo) => Promise<T>,
    ) => {
      if (
        id !== sessionId ||
        !owner ||
        scope.workspaceId !== owner.workspaceId ||
        scope.connectionId !== owner.connectionId ||
        scope.userId !== owner.userId
      )
        throw new Error('Sitzungszugriff verweigert');
      runs += 1;
      if (runError) throw runError;
      return operation(browser);
    },
    close: async (scope: BrowserSessionScope, id: string) => {
      if (
        id !== sessionId ||
        scope.userId !== owner?.userId ||
        scope.connectionId !== owner.connectionId
      )
        throw new Error('Sitzungszugriff verweigert');
      if (closeError) throw closeError;
      owner = undefined;
      closes += 1;
    },
    reconcile: async () => undefined,
  };
  const api = new MarketplaceBrowserHttpApi({
    broker,
    profiles:
      prepare || remove ? { prepare: prepare ?? (async () => undefined), remove } : undefined,
    accounts: confirm ? { confirm: async (scope, id) => confirm(scope, id) } : undefined,
    imports: writeImport ? { write: writeImport } : undefined,
    edits,
    operations,
    listingCache,
    profileCache,
    scheduledSync,
    readOnly,
    users: {
      userId: async (token) => {
        if (token === 'token-a' || token === 'token-a-renewed')
          return '25600000-0000-4000-8000-000000000001';
        if (token === 'token-b') return '25600000-0000-4000-8000-000000000002';
        throw new Error('invalid');
      },
    },
  });
  const server = api.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const request = (path: string, body: unknown, token = 'token-a') =>
    fetch(`${url}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const close = async () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  return { request, close, url, inputs, runs: () => runs, closes: () => closes };
}

test('gleicht nur die gebundene Sitzung ab und stoppt den Browser nach dem Speichern', async () => {
  const imports: VintedAccountImport = {
    identity: { id: '123', username: 'test' },
    observedAt: '2026-09-28T10:00:00Z',
    entries: [],
    areas: {
      profile: { status: 'complete' },
      publications: { status: 'complete' },
      conversations: { status: 'complete' },
      messages: { status: 'partial' },
      sales: { status: 'partial' },
      feedback: { status: 'complete' },
    },
  };
  const written: string[] = [];
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    async () => imports,
    async (scope, id, snapshot) => {
      written.push(`${scope.workspaceId}:${scope.connectionId}:${id}:${snapshot.identity.id}`);
      return { profile: 1, publication: 0, conversation: 0, message: 0, sale: 0 };
    },
  );
  try {
    const response = await api.request('/marketplace-browser/connections/sync', {
      workspaceId: workspaceA,
      connectionId: accountA,
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).observedAt, imports.observedAt);
    assert.deepEqual(written, [`${workspaceA}:${accountA}:${sessionId}:123`]);
    assert.equal(api.closes(), 1);
  } finally {
    await api.close();
  }
});

test('bestätigte Profiländerung bleibt bei fehlgeschlagenem Browserstopp bestätigt', async () => {
  const edits = {
    entry: async () => ({ externalId: '789', accountId: '789' }),
  } as unknown as VintedEditAccess;
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    edits,
    {
      updateProfileAbout: async (_id, _about, authorize) => {
        await authorize();
        return 'confirmed';
      },
    },
    new Error('Browser-Stopp fehlgeschlagen'),
  );
  try {
    const response = await api.request('/marketplace-browser/profile/edit/save', {
      workspaceId: workspaceA,
      connectionId: accountA,
      about: 'Neuer Text',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'confirmed', cleanup: 'pending' });
  } finally {
    await api.close();
  }
});

test('Hintergrundauftrag ist für fremde Nutzer und Konten nicht lesbar', async () => {
  const id = '25600000-0000-4000-8000-000000000041';
  const starts: BrowserSessionScope[] = [];
  const operations = {
    start: async (scope: BrowserSessionScope) => {
      starts.push(scope);
      return id;
    },
    read: async (scope: BrowserSessionScope, operationId: string) =>
      operationId === id &&
      scope.userId === starts[0]?.userId &&
      scope.workspaceId === starts[0]?.workspaceId &&
      scope.connectionId === starts[0]?.connectionId
        ? {
            id,
            state: 'running' as const,
            stage: 'profile' as const,
            errorCode: null,
            observedAt: null,
            counts: null,
          }
        : null,
  };
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    operations,
  );
  try {
    const created = await api.request('/marketplace-browser/connections/sync/start', {
      workspaceId: workspaceA,
      connectionId: accountA,
    });
    assert.equal(created.status, 202);
    assert.deepEqual(await created.json(), { id });
    const body = { workspaceId: workspaceA, connectionId: accountA, operationId: id };
    const own = await api.request('/marketplace-browser/connections/sync/status', body);
    assert.equal(own.status, 200);
    assert.equal((await own.json()).stage, 'profile');
    assert.equal(
      (await api.request('/marketplace-browser/connections/sync/status', body, 'token-b')).status,
      404,
    );
    assert.equal(
      (
        await api.request('/marketplace-browser/connections/sync/status', {
          ...body,
          connectionId: accountB,
        })
      ).status,
      404,
    );
  } finally {
    await api.close();
  }
});

test('bearbeitet ein Inserat nur nach gebundener Kontoprüfung und beendet den Browser', async () => {
  const entryId = '25600000-0000-4000-8000-000000000041';
  const seen: string[] = [];
  const edits = {
    entry: async (scope: BrowserSessionScope, kind: string, id?: string) => {
      seen.push(`${scope.workspaceId}:${scope.connectionId}:${kind}:${id}`);
      return { externalId: '12345', accountId: '789' };
    },
  } as unknown as VintedEditAccess;
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    edits,
    {
      readListingEdit: async (itemId, ownerId) => {
        seen.push(`${itemId}:${ownerId}`);
        return { title: 'Jacke', description: 'Text', price: '12,50' };
      },
      updateListing: async (itemId, ownerId, fields, authorize) => {
        await authorize();
        seen.push(`${itemId}:${ownerId}:${fields.title}`);
        return 'confirmed';
      },
    },
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA, entryId };
    const read = await api.request('/marketplace-browser/listings/edit/read', scope);
    assert.equal(read.status, 200);
    assert.deepEqual((await read.json()).fields, {
      title: 'Jacke',
      description: 'Text',
      price: '12,50',
    });
    const save = await api.request('/marketplace-browser/listings/edit/save', {
      ...scope,
      fields: { title: 'Neue Jacke', description: 'Text', price: '12,50' },
    });
    assert.equal(save.status, 200);
    assert.equal((await save.json()).status, 'confirmed');
    assert.equal(api.closes(), 2);
    assert.deepEqual(seen, [
      `${workspaceA}:${accountA}:publication:${entryId}`,
      '12345:789',
      `${workspaceA}:${accountA}:publication:${entryId}`,
      `${workspaceA}:${accountA}:publication:${entryId}`,
      '12345:789:Neue Jacke',
    ]);
  } finally {
    await api.close();
  }
});

test('gelesene und bestätigte Inseratwerte werden kontogebunden zwischengespeichert', async () => {
  const entryId = '25600000-0000-4000-8000-000000000041';
  const cached: string[] = [];
  const edits = {
    entry: async () => ({ externalId: '12345', accountId: '789' }),
  } as unknown as VintedEditAccess;
  const cache = {
    save: async (
      scope: BrowserSessionScope,
      id: string,
      externalId: string,
      fields: { description: string },
      confirmed: boolean,
    ) => {
      cached.push(
        `${scope.workspaceId}:${scope.connectionId}:${id}:${externalId}:${fields.description}:${confirmed}`,
      );
      return true;
    },
  } as Pick<SupabaseVintedListingCache, 'save'>;
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    edits,
    {
      readListingEdit: async () => ({ title: 'Jacke', description: 'Gelesen', price: '12,50' }),
      updateListing: async (_itemId, _accountId, _fields, authorize) => {
        await authorize();
        return 'confirmed';
      },
    },
    undefined,
    undefined,
    cache,
  );
  try {
    const body = { workspaceId: workspaceA, connectionId: accountA, entryId };
    assert.equal((await api.request('/marketplace-browser/listings/edit/read', body)).status, 200);
    assert.equal(
      (
        await api.request('/marketplace-browser/listings/edit/save', {
          ...body,
          fields: { title: 'Jacke', description: 'Gespeichert', price: '12,50' },
        })
      ).status,
      200,
    );
    assert.deepEqual(cached, [
      `${workspaceA}:${accountA}:${entryId}:12345:Gelesen:false`,
      `${workspaceA}:${accountA}:${entryId}:12345:Gespeichert:true`,
    ]);
  } finally {
    await api.close();
  }
});

test('weist fremde oder ungültige Inserate vor Browserstart ab', async () => {
  const edits = {
    entry: async () => {
      throw new Error('Kontoeintrag nicht verfügbar');
    },
  } as unknown as VintedEditAccess;
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    edits,
  );
  try {
    const path = '/marketplace-browser/listings/edit/save';
    const fields = { title: 'Jacke', description: '', price: '12,50' };
    assert.equal(
      (
        await api.request(path, {
          workspaceId: workspaceA,
          connectionId: accountA,
          entryId: 'invalid',
          fields,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api.request(path, {
          workspaceId: workspaceB,
          connectionId: accountA,
          entryId: '25600000-0000-4000-8000-000000000041',
          fields,
        })
      ).status,
      409,
    );
    assert.equal(api.closes(), 0);
  } finally {
    await api.close();
  }
});

test('speichert Profiltext nur für das zugeordnete Konto und stoppt die Sitzung', async () => {
  const edits = {
    entry: async (_scope: BrowserSessionScope, kind: string) => {
      assert.equal(kind, 'profile');
      return { externalId: '789', accountId: '789' };
    },
  } as unknown as VintedEditAccess;
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    edits,
    {
      readProfileAbout: async (accountId) => {
        assert.equal(accountId, '789');
        return 'Alter Text';
      },
      updateProfileAbout: async (accountId, about, authorize) => {
        assert.equal(accountId, '789');
        assert.equal(about, 'Neuer Text');
        await authorize();
        return 'confirmed';
      },
    },
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    const read = await api.request('/marketplace-browser/profile/edit/read', scope);
    assert.equal(read.status, 200);
    assert.equal((await read.json()).about, 'Alter Text');
    const save = await api.request('/marketplace-browser/profile/edit/save', {
      ...scope,
      about: 'Neuer Text',
    });
    assert.equal(save.status, 200);
    assert.equal((await save.json()).status, 'confirmed');
    assert.equal(api.closes(), 2);
  } finally {
    await api.close();
  }
});

test('Profil-Leseroute mit Schreibfeld löst keine Änderung aus', async () => {
  let writes = 0;
  const edits = {
    entry: async () => ({ externalId: '789', accountId: '789' }),
  } as unknown as VintedEditAccess;
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    edits,
    {
      readProfileAbout: async () => 'Alter Text',
      updateProfileAbout: async () => {
        writes += 1;
        return 'confirmed';
      },
    },
  );
  try {
    const response = await api.request('/marketplace-browser/profile/edit/read', {
      workspaceId: workspaceA,
      connectionId: accountA,
      about: 'Unerwarteter Text',
    });
    assert.equal(response.status, 400);
    assert.equal(writes, 0);
    assert.equal(api.closes(), 0);
  } finally {
    await api.close();
  }
});

test('Profil speichert nur mit erwartetem Ausgangstext und übernimmt bestätigte Werte', async () => {
  const seen: string[] = [];
  const edits = {
    entry: async () => ({ externalId: '789', accountId: '789' }),
  } as unknown as VintedEditAccess;
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    edits,
    {
      updateProfileAbout: async (_id, about, authorize, expectedAbout) => {
        seen.push(`browser:${about}:${expectedAbout}`);
        await authorize();
        return 'confirmed';
      },
    },
    undefined,
    undefined,
    undefined,
    {
      save: async (scope, accountId, about) => {
        seen.push(`cache:${scope.workspaceId}:${scope.connectionId}:${accountId}:${about}`);
        return true;
      },
    },
  );
  try {
    const response = await api.request('/marketplace-browser/profile/edit/save', {
      workspaceId: workspaceA,
      connectionId: accountA,
      about: 'Neu',
      expectedAbout: 'Alt',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'confirmed' });
    assert.deepEqual(seen, ['browser:Neu:Alt', `cache:${workspaceA}:${accountA}:789:Neu`]);
  } finally {
    await api.close();
  }
});

test('meldet bei einem fehlgeschlagenen Import nur den Leseschritt und schließt die Sitzung', async () => {
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    async () => {
      throw new VintedImportReadError('profile', new Error('private-provider-response'));
    },
    async () => {
      throw new Error('Der fehlgeschlagene Import darf nicht gespeichert werden');
    },
  );
  try {
    const response = await api.request('/marketplace-browser/connections/sync', {
      workspaceId: workspaceA,
      connectionId: accountA,
    });
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), {
      code: 'vinted_import_failed',
      stage: 'profile',
      error: 'Vinted-Daten konnten nicht gelesen werden',
    });
    assert.equal(body.includes('private-provider-response'), false);
    assert.equal(api.closes(), 1);
  } finally {
    await api.close();
  }
});

test('reports availability at the same path used by the Angular test page', async () => {
  const api = await setup();
  try {
    const response = await fetch(`${api.url}/marketplace-browser/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, readOnly: false, apiVersion: 2 });
  } finally {
    await api.close();
  }
});

test('reports scheduling only while the actual dispatcher is ready and authorized', async () => {
  let active = true;
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => ({ enabled: active, authorizationVersion: 1, allowedIntervals: [15] }),
  );
  try {
    const enabled = (await (await fetch(`${api.url}/marketplace-browser/healthz`)).json()) as {
      scheduledSync?: { enabled: boolean };
    };
    assert.equal(enabled.scheduledSync?.enabled, true);
    active = false;
    const disabled = (await (await fetch(`${api.url}/marketplace-browser/healthz`)).json()) as {
      scheduledSync?: { enabled: boolean };
    };
    assert.equal(disabled.scheduledSync?.enabled, false);
  } finally {
    await api.close();
  }
});

test('prepares the bound browser profile before opening and hides provider errors', async () => {
  const prepared: string[] = [];
  const api = await setup(undefined, undefined, false, undefined, async (scope) => {
    prepared.push(`${scope.userId}:${scope.workspaceId}:${scope.connectionId}`);
  });
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    assert.equal((await api.request('/marketplace-browser/sessions', scope)).status, 201);
    assert.deepEqual(prepared, [`25600000-0000-4000-8000-000000000001:${workspaceA}:${accountA}`]);
  } finally {
    await api.close();
  }
  const failed = await setup(undefined, undefined, false, undefined, async () => {
    throw new Error('provider-token-must-stay-private');
  });
  try {
    const response = await failed.request('/marketplace-browser/sessions', {
      workspaceId: workspaceA,
      connectionId: accountA,
    });
    assert.equal(response.status, 409);
    assert.equal((await response.text()).includes('provider-token-must-stay-private'), false);
  } finally {
    await failed.close();
  }
});

test('returns only a fixed code when the provider API limit is reached', async () => {
  const api = await setup(undefined, undefined, false, undefined, async () => {
    throw new GoLoginApiLimitError();
  });
  try {
    const response = await api.request('/marketplace-browser/sessions', {
      workspaceId: workspaceA,
      connectionId: accountA,
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      code: 'gologin_api_limit_reached',
      error: 'GoLogin-API-Limit erreicht',
    });
  } finally {
    await api.close();
  }
});

test('returns only a fixed code when the GoLogin profile quota is full', async () => {
  const api = await setup(undefined, undefined, false, undefined, async () => {
    throw new GoLoginProfileLimitError();
  });
  try {
    const response = await api.request('/marketplace-browser/sessions', {
      workspaceId: workspaceA,
      connectionId: accountA,
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: 'gologin_profile_limit_reached' });
  } finally {
    await api.close();
  }
});

test('read-only mode refuses all browser input before accessing the session', async () => {
  const api = await setup(undefined, undefined, true);
  try {
    const response = await fetch(`${api.url}/marketplace-browser/healthz`);
    assert.deepEqual(await response.json(), { ok: true, readOnly: true, apiVersion: 2 });
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const input = await api.request(`/marketplace-browser/sessions/${sessionId}/input`, {
      ...scope,
      input: { kind: 'click', x: 0.5, y: 0.5 },
    });
    assert.equal(input.status, 403);
    assert.deepEqual(api.inputs, []);
    assert.equal(api.runs(), 0);
  } finally {
    await api.close();
  }
});

test('confirms only the active account and returns a bounded identity', async () => {
  const confirmed: string[] = [];
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    { id: '12345', username: 'my-vinted' },
    async (scope, id) => {
      confirmed.push(`${scope.workspaceId}:${scope.connectionId}:${scope.userId}:${id}`);
    },
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}/identify`;
    assert.equal((await api.request(path, { ...scope, connectionId: accountB })).status, 409);
    assert.equal((await api.request(path, { ...scope, workspaceId: workspaceB })).status, 409);
    assert.equal((await api.request(path, scope, 'token-b')).status, 409);
    assert.deepEqual(confirmed, []);
    const response = await api.request(path, scope);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      workspaceId: workspaceA,
      connectionId: accountA,
      externalAccountId: '12345',
      username: 'my-vinted',
    });
    assert.deepEqual(confirmed, [
      `${workspaceA}:${accountA}:25600000-0000-4000-8000-000000000001:${sessionId}`,
    ]);
  } finally {
    await api.close();
  }
});

test('does not confirm absent identity, read-only mode or interrupted session', async () => {
  for (const [readOnly, error, expected] of [
    [false, undefined, 422],
    [true, undefined, 403],
    [false, new MarketplaceBrowserSessionEndedError(), 410],
  ] as const) {
    let confirmations = 0;
    const api = await setup(undefined, undefined, readOnly, error, undefined, null, async () => {
      confirmations++;
    });
    try {
      const scope = { workspaceId: workspaceA, connectionId: accountA };
      await api.request('/marketplace-browser/sessions', scope);
      assert.equal(
        (await api.request(`/marketplace-browser/sessions/${sessionId}/identify`, scope)).status,
        expected,
      );
      assert.equal(confirmations, 0);
    } finally {
      await api.close();
    }
  }
});

test('reports a visible Vinted login form without exposing browser content or confirming the account', async () => {
  let confirmations = 0;
  const api = await setup(
    undefined,
    undefined,
    false,
    new VintedLoginPendingError(),
    undefined,
    null,
    async () => {
      confirmations++;
    },
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const response = await api.request(
      `/marketplace-browser/sessions/${sessionId}/identify`,
      scope,
    );
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { code: 'vinted_login_pending' });
    assert.equal(confirmations, 0);
  } finally {
    await api.close();
  }
});

test('reports only confirmed session endings as gone for the bound account', async () => {
  const api = await setup(undefined, undefined, true, new MarketplaceBrowserSessionEndedError());
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}/frame`;
    assert.equal((await api.request(path, scope)).status, 410);
    assert.equal((await api.request(path, { ...scope, connectionId: accountB })).status, 409);
  } finally {
    await api.close();
  }
});

test('returns only a bounded image and accepts individual inputs for the bound account', async () => {
  const api = await setup();
  try {
    const started = await api.request('/marketplace-browser/sessions', {
      workspaceId: workspaceA,
      connectionId: accountA,
    });
    assert.equal(started.status, 201);
    const result: unknown = await started.json();
    assert.deepEqual(result, { id: sessionId });
    assert.equal(started.headers.get('Cache-Control'), 'no-store');
    const path = `/marketplace-browser/sessions/${sessionId}`;
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    const frame = await api.request(`${path}/frame`, scope, 'token-a-renewed');
    assert.equal(frame.status, 200);
    assert.equal(frame.headers.get('Content-Type'), 'image/jpeg');
    assert.deepEqual(
      new Uint8Array(await frame.arrayBuffer()),
      Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    );
    assert.equal(
      (await api.request(`${path}/input`, { ...scope, input: { kind: 'click', x: 0.25, y: 0.75 } }))
        .status,
      200,
    );
    assert.equal(
      (
        await api.request(`${path}/input`, {
          ...scope,
          input: { kind: 'type', value: 'synthetic text' },
        })
      ).status,
      200,
    );
    assert.equal(
      (await api.request(`${path}/input`, { ...scope, input: { kind: 'press', key: 'Tab' } }))
        .status,
      200,
    );
    assert.deepEqual(api.inputs, ['click:0.25:0.75', 'type:synthetic text', 'press:Tab']);
    assert.equal((await api.request(`${path}/close`, scope)).status, 204);
  } finally {
    await api.close();
  }
});

test('rejects missing auth, another operator, workspace and account before browser access', async () => {
  const api = await setup();
  try {
    const path = `/marketplace-browser/sessions/${sessionId}/frame`;
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    assert.equal(
      (await api.request('/marketplace-browser/sessions', scope, 'bad-token')).status,
      401,
    );
    assert.equal((await api.request('/marketplace-browser/sessions', scope)).status, 201);
    assert.equal((await api.request(path, scope, 'token-b')).status, 409);
    assert.equal(
      (await api.request(path, { workspaceId: workspaceB, connectionId: accountA })).status,
      409,
    );
    assert.equal(
      (await api.request(path, { workspaceId: workspaceA, connectionId: accountB })).status,
      409,
    );
    assert.equal(api.runs(), 0);
  } finally {
    await api.close();
  }
});

test('rejects oversized frames and malformed input without exposing internal errors', async () => {
  const api = await setup(Uint8Array.from([0xff, 0xd8, ...new Array<number>(512 * 1024).fill(0)]));
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}`;
    const frame = await api.request(`${path}/frame`, scope);
    assert.equal(frame.status, 502);
    assert.equal((await frame.text()).includes('synthetic browser'), false);
    assert.equal(
      (await api.request(`${path}/input`, { ...scope, input: { kind: 'click', x: 1.1, y: 0.5 } }))
        .status,
      400,
    );
    assert.equal(
      (await api.request(`${path}/input`, { ...scope, input: { kind: 'press', key: 'Control+L' } }))
        .status,
      400,
    );
    assert.deepEqual(api.inputs, []);
  } finally {
    await api.close();
  }
});

test('verifies the bearer token with Supabase Auth without returning its response body', async () => {
  const verifier = new SupabaseBrowserUserVerifier(
    'https://example.test',
    'public-test-key',
    async (_input, init) => {
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer user-test-token');
      return Response.json({ id: '25600000-0000-4000-8000-000000000001' });
    },
  );
  assert.equal(await verifier.userId('user-test-token'), '25600000-0000-4000-8000-000000000001');
});

test('rejects oversized requests before opening a browser session', async () => {
  const api = await setup();
  try {
    const response = await api.request('/marketplace-browser/sessions', {
      workspaceId: workspaceA,
      connectionId: accountA,
      padding: 'x'.repeat(16_384),
    });
    assert.equal(response.status, 413);
    assert.equal(api.runs(), 0);
  } finally {
    await api.close();
  }
});

test('allows only one operation at a time for an authenticated session', async () => {
  let releaseCapture!: () => void;
  const captureGate = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  const api = await setup(undefined, captureGate);
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}`;
    const first = api.request(`${path}/frame`, scope);
    for (let attempt = 0; attempt < 20 && api.runs() === 0; attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(api.runs(), 1);
    assert.equal(
      (await api.request(`${path}/input`, { ...scope, input: { kind: 'press', key: 'Tab' } }))
        .status,
      429,
    );
    assert.deepEqual(api.inputs, []);
    releaseCapture();
    assert.equal((await first).status, 200);
  } finally {
    releaseCapture();
    await api.close();
  }
});

test('binds one login submission to its user, workspace and account without returning secrets', async () => {
  const api = await setup();
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}/login`;
    const credentials = { username: 'synthetic-user', password: 'synthetic-password' };
    const response = await api.request(path, { ...scope, credentials });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'submitted' });
    assert.deepEqual(api.inputs, ['login:synthetic-user']);
    for (const other of [
      { ...scope, workspaceId: workspaceB },
      { ...scope, connectionId: accountB },
    ])
      assert.equal((await api.request(path, { ...other, credentials })).status, 409);
    assert.equal((await api.request(path, { ...scope, credentials }, 'token-b')).status, 409);
    assert.equal((await api.request(path, { ...scope, credentials }, 'expired')).status, 401);
    assert.equal(api.inputs.length, 1);
    assert.equal(
      (await api.request(path, { ...scope, credentials: { ...credentials, password: '' } })).status,
      400,
    );
    assert.equal(
      (
        await api.request(path, {
          ...scope,
          credentials: { ...credentials, url: 'https://other.example' },
        })
      ).status,
      400,
    );
  } finally {
    await api.close();
  }
});

test('confirms an already authenticated profile without sending credentials again', async () => {
  const confirmations: string[] = [];
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    { id: '12345', username: 'own-test' },
    async (scope, id) => {
      confirmations.push(`${scope.workspaceId}:${scope.connectionId}:${id}`);
    },
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}/login`;
    const credentials = { username: 'unused-user', password: 'unused-password' };
    const response = await api.request(path, { ...scope, credentials });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'already_authenticated' });
    assert.deepEqual(api.inputs, []);
    assert.deepEqual(confirmations, [`${workspaceA}:${accountA}:${sessionId}`]);
    assert.equal(
      (await api.request(path, { ...scope, connectionId: accountB, credentials })).status,
      409,
    );
    assert.equal((await api.request(path, { ...scope, credentials }, 'token-b')).status, 409);
    assert.deepEqual(confirmations, [`${workspaceA}:${accountA}:${sessionId}`]);
  } finally {
    await api.close();
  }
});

test('preserves a pending Vinted code challenge without submitting credentials again', async () => {
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    new VintedVerificationRequiredError(),
    async () => assert.fail('an unverified profile must not be connected'),
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const response = await api.request(`/marketplace-browser/sessions/${sessionId}/login`, {
      ...scope,
      credentials: { username: 'unused-user', password: 'unused-password' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'verification_required' });
    assert.deepEqual(api.inputs, []);
  } finally {
    await api.close();
  }
});

test('does not report an existing session as connected when account confirmation fails', async () => {
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    { id: '12345', username: 'own-test' },
    async () => {
      throw new Error('private database detail');
    },
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const response = await api.request(`/marketplace-browser/sessions/${sessionId}/login`, {
      ...scope,
      credentials: { username: 'unused-user', password: 'unused-password' },
    });
    assert.equal(response.status, 409);
    assert.deepEqual(api.inputs, []);
    assert.equal(JSON.stringify(await response.json()).includes('private database detail'), false);
  } finally {
    await api.close();
  }
});

test('does not confirm an authenticated profile after expiry or browser interruption', async () => {
  for (const reason of ['expired', 'interrupted'] as const) {
    let confirmations = 0;
    const api = await setup(
      undefined,
      undefined,
      false,
      new MarketplaceBrowserSessionEndedError(reason),
      undefined,
      { id: '12345', username: 'own-test' },
      async () => {
        confirmations++;
      },
    );
    try {
      const scope = { workspaceId: workspaceA, connectionId: accountA };
      await api.request('/marketplace-browser/sessions', scope);
      const response = await api.request(`/marketplace-browser/sessions/${sessionId}/login`, {
        ...scope,
        credentials: { username: 'unused-user', password: 'unused-password' },
      });
      assert.equal(response.status, 410);
      assert.equal(confirmations, 0);
      assert.deepEqual(api.inputs, []);
    } finally {
      await api.close();
    }
  }
});

test('bindet die Codebestätigung an Nutzer, Workspace und Konto', async () => {
  const api = await setup();
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}/verify`;
    assert.equal((await api.request(path, { ...scope, code: '123456' }, 'expired')).status, 401);
    assert.equal(
      (await api.request(path, { ...scope, connectionId: accountB, code: '123456' })).status,
      409,
    );
    assert.equal(
      (await api.request(path, { ...scope, workspaceId: workspaceB, code: '123456' })).status,
      409,
    );
    assert.equal((await api.request(path, { ...scope, code: '123456' }, 'token-b')).status, 409);
    assert.deepEqual(api.inputs, []);
    const response = await api.request(path, { ...scope, code: '123456' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'submitted' });
    assert.deepEqual(api.inputs, ['verification-submitted']);
    assert.equal((await api.request(path, { ...scope, code: 'abc' })).status, 400);
    assert.equal((await api.request(`${path.replace('/verify', '/close')}`, scope)).status, 204);
    assert.equal((await api.request(path, { ...scope, code: '123456' })).status, 409);
  } finally {
    await api.close();
  }
});

test('löscht Konten nur über den angemeldeten, kontogebundenen Workerpfad', async () => {
  const removed: string[] = [];
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    async (scope, stop) => {
      await stop();
      removed.push(`${scope.userId}:${scope.workspaceId}:${scope.connectionId}`);
    },
  );
  try {
    const path = '/marketplace-browser/connections/delete';
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    assert.equal((await api.request(path, scope, 'expired')).status, 401);
    assert.deepEqual(removed, []);
    assert.equal((await api.request(path, scope)).status, 204);
    assert.deepEqual(removed, [`25600000-0000-4000-8000-000000000001:${workspaceA}:${accountA}`]);
  } finally {
    await api.close();
  }
});

test('rejects login in read-only mode and for ended sessions', async () => {
  for (const readOnly of [true, false]) {
    const api = await setup(
      undefined,
      undefined,
      readOnly,
      new MarketplaceBrowserSessionEndedError(),
    );
    try {
      const scope = { workspaceId: workspaceA, connectionId: accountA };
      await api.request('/marketplace-browser/sessions', scope);
      const response = await api.request(`/marketplace-browser/sessions/${sessionId}/login`, {
        ...scope,
        credentials: { username: 'synthetic', password: 'synthetic' },
      });
      assert.equal(response.status, readOnly ? 403 : 410);
      assert.equal(api.inputs.length, 0);
    } finally {
      await api.close();
    }
  }
});

test('close interrupts an in-flight login before any later credential submission', async () => {
  let resumeLogin!: () => void;
  const gate = new Promise<void>((resolve) => {
    resumeLogin = resolve;
  });
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    gate,
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}`;
    const pending = api.request(`${path}/login`, {
      ...scope,
      credentials: { username: 'synthetic', password: 'synthetic' },
    });
    for (let attempt = 0; attempt < 50 && api.runs() === 0; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(api.runs(), 1);
    try {
      assert.equal((await api.request(`${path}/close`, scope)).status, 204);
    } finally {
      resumeLogin();
    }
    await pending;
    assert.deepEqual(api.inputs, []);
  } finally {
    resumeLogin();
    await api.close();
  }
});

test('returns a safe rejection code only after the scoped broker check', async () => {
  const { VintedLoginRejectedError } = await import('../src/vinted-browser-reader.ts');
  const api = await setup(
    undefined,
    undefined,
    false,
    new VintedLoginRejectedError(),
    undefined,
    undefined,
    async () => {
      throw new Error('must not confirm');
    },
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const response = await api.request(
      `/marketplace-browser/sessions/${sessionId}/identify`,
      scope,
    );
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      code: 'vinted_login_rejected',
      error: 'Vinted hat die Zugangsdaten abgelehnt',
    });
    const other = await api.request(`/marketplace-browser/sessions/${sessionId}/identify`, {
      ...scope,
      workspaceId: workspaceB,
    });
    assert.equal(other.status, 409);
    assert.equal(JSON.stringify(await other.json()).includes('vinted_login_rejected'), false);
  } finally {
    await api.close();
  }
});

test('keeps the real broker lease alive after duplicate starts while awaiting login verification', async () => {
  const { MarketplaceBrowserSessionBroker } =
    await import('../src/marketplace-browser-session-broker.ts');
  for (const [loginError, expectedCode] of [
    [new VintedLoginRejectedError(), 'vinted_login_rejected'],
    [new VintedLoginPendingError(), 'vinted_login_pending'],
    [new VintedVerificationRequiredError(), 'vinted_verification_required'],
  ] as const) {
    let active = true;
    let stopped = false;
    let reserved = false;
    const broker = new MarketplaceBrowserSessionBroker({
      recovery: { recover: async () => undefined },
      leases: {
        acquire: async (scope) => {
          if (reserved) throw new MarketplaceBrowserSessionBusyError();
          reserved = true;
          return { id: sessionId, scope, expiresAt: Date.now() + 60_000, active: true };
        },
        assertActive: async () => active,
        release: async () => {
          active = false;
        },
      },
      profiles: { resolve: async () => 'synthetic-profile' },
      browsers: {
        open: async () => ({
          close: async () => {
            stopped = true;
          },
          run: async (operation) =>
            operation({
              version: () => 'synthetic',
              identify: async () => {
                throw loginError;
              },
              capture: async () => Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
            }),
        }),
        stop: async () => {
          stopped = true;
        },
      },
    });
    const api = new MarketplaceBrowserHttpApi({
      broker,
      users: { userId: async () => '25600000-0000-4000-8000-000000000001' },
      accounts: { confirm: async () => assert.fail('must not confirm a rejected login') },
    });
    const server = api.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const post = (path: string) =>
      fetch(`http://127.0.0.1:${address.port}/marketplace-browser/sessions${path}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspaceA, connectionId: accountA }),
      });
    try {
      assert.equal((await post('')).status, 201);
      const identified = await post(`/${sessionId}/identify`);
      assert.equal(identified.status, 422);
      assert.equal((await identified.json()).code, expectedCode);
      const duplicate = await post('');
      assert.equal(duplicate.status, 409);
      assert.equal((await duplicate.json()).code, 'browser_session_busy');
      assert.equal(active, true);
      assert.equal(stopped, false);
      assert.equal((await post(`/${sessionId}/frame`)).status, 200);
      const stillPending = await post(`/${sessionId}/identify`);
      assert.equal(stillPending.status, 422);
      assert.equal((await stillPending.json()).code, expectedCode);
    } finally {
      await broker.shutdown();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});
