import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MarketplaceAccountActionRunner,
  validateAccountActionPayload,
} from '../src/marketplace-account-action-runner.ts';
import {
  parseAccountActionClaim,
  SupabaseMarketplaceAccountActionStore,
} from '../src/supabase-marketplace-account-action-store.ts';
import { beforeVintedWrite } from '../src/vinted-write-authorization.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import { MarketplaceBrowserHttpApi } from '../src/marketplace-browser-http-api.ts';
import { BrowserSessionCommands } from '../src/browser-session-commands.ts';
import { isolatedBrowserActions, validateBrowserResult } from '../src/isolated-browser-actions.ts';
import { parseVintedProfileSaveResult } from '../src/vinted-profile-contracts.ts';
import { MarketplaceBrowserSessionEndedError } from '../src/marketplace-browser-session-broker.ts';
import { listingCurrentContentFixture } from './fixtures/vinted-listing-current-content.ts';
import type { VintedAccountImport, VintedImportEntry } from '../src/vinted-account-import.ts';

const ids = Array.from(
  { length: 7 },
  (_, index) => `57000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);
const workerId = ids[0]!,
  runnerId = ids[1]!,
  workspaceId = ids[2]!,
  connectionId = ids[3]!,
  userId = ids[4]!,
  sessionId = ids[5]!,
  entryId = ids[6]!;
function fixture(kind = 'profile_edit_read', payload: Record<string, unknown> = {}) {
  const target = {
    accountId: '123',
    externalId: '456',
    entryId,
    entryKind: 'publication',
    body: {},
  };
  const expiresAt = new Date(Date.now() + 60_000).toISOString(),
    absoluteExpiresAt = new Date(Date.now() + 600_000).toISOString();
  const claim = parseAccountActionClaim(
    {
      actionId: entryId,
      claimToken: sessionId,
      actionKind: kind,
      payload,
      target,
      workspaceId,
      connectionId,
      userId,
      sessionId,
      workerId,
      workerEpoch: 1,
      runnerId,
      expiresAt,
      absoluteExpiresAt,
    },
    workerId,
    1,
    runnerId,
  );
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const store = new SupabaseMarketplaceAccountActionStore({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    fetch: async (input, init) => {
      const name = new URL(String(input)).pathname.split('/').at(-1)!;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ name, body });
      const result =
        name === 'marketplace_account_action_check'
          ? { active: true, sessionId, expiresAt, absoluteExpiresAt, target: claim.target }
          : true;
      return Response.json(result);
    },
  });
  return { claim, store, calls };
}
for (const afterWrite of [false, true])
  test(`lost provider result retries only before durable write marker: ${afterWrite}`, async () => {
    const { claim, store, calls } = fixture('profile_edit_save', { about: 'Neu' });
    const order: string[] = [];
    const browser: BrowserInfo = {
      version: () => '',
      updateProfileAbout: async (_account, _about, authorize) => {
        if (afterWrite) await beforeVintedWrite(authorize);
        throw new Error('provider transport');
      },
    };
    const runner = new MarketplaceAccountActionRunner({
      url: 'https://db.example',
      serviceRoleKey: 'server',
      publishableKey: 'public',
      store,
      broker: {
        open: async () => sessionId,
        run: async (_scope, _id, operation) => operation(browser),
        close: async () => {
          order.push('stopped');
        },
        discardUnstartedAction: async () => undefined,
      },
    });
    await runner.run(claim);
    assert.deepEqual(order, ['stopped']);
    const names = calls.map((call) => call.name);
    assert.equal(names.includes('marketplace_account_action_retry'), !afterWrite);
    assert.equal(names.includes('marketplace_account_action_begin_write'), afterWrite);
    if (afterWrite) assert.equal(calls.at(-1)?.body.p_state, 'outcome_unknown');
  });
test('read action persists result after browser stop and never reserves a write', async () => {
  const { claim, store, calls } = fixture();
  let stopped = false;
  const original = store.finish.bind(store);
  store.finish = async (...args) => {
    assert.equal(stopped, true);
    return original(...args);
  };
  const runner = new MarketplaceAccountActionRunner({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    store,
    broker: {
      open: async () => sessionId,
      run: async (_scope, _id, operation) =>
        operation({ version: () => '', readProfileAbout: async () => 'Hallo' }),
      close: async () => {
        stopped = true;
      },
      discardUnstartedAction: async () => undefined,
    },
  });
  await runner.run(claim);
  assert.deepEqual(calls.at(-1)?.body.p_result, { about: 'Hallo' });
  assert.equal(calls.at(-1)?.body.p_state, 'succeeded');
  assert.equal(
    calls.some((call) => call.name === 'marketplace_account_action_begin_write'),
    false,
  );
});
test('invalid saved payload cannot launch a browser or be retried', async () => {
  const { claim, store, calls } = fixture('price_save', {
    entryId,
    expectedPriceCents: 1,
    priceCents: -1,
  });
  let discarded = false;
  const runner = new MarketplaceAccountActionRunner({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    store,
    broker: {
      open: async () => {
        throw new Error('must not launch');
      },
      run: async () => {
        throw new Error('must not run');
      },
      close: async () => {
        throw new Error('must not close');
      },
      discardUnstartedAction: async () => {
        discarded = true;
      },
    },
  });
  await runner.run(claim);
  assert.equal(discarded, true);
  assert.equal(calls.at(-1)?.body.p_error_code, 'invalid_payload');
  assert.equal(
    calls.some((call) => call.name === 'marketplace_account_action_retry'),
    false,
  );
});
test('action claim is bound to worker, runner, session and server target', () => {
  const { claim } = fixture();
  assert.equal(claim.scope.userAccessToken, '');
  assert.equal(claim.scope.accountAction?.sessionId, sessionId);
  assert.throws(() =>
    parseAccountActionClaim({ workerId, workerEpoch: 1, runnerId: ids[2] }, workerId, 1, runnerId),
  );
  assert.throws(() =>
    validateAccountActionPayload('price_save', {
      entryId,
      expectedPriceCents: 1,
      priceCents: 2,
      token: 'secret',
    }),
  );
  assert.throws(() => validateAccountActionPayload('profile_cities_read', { query: 'a' }));
});
test('cloud HTTP accepts without browser work, preserves duplicate ID and reports hard queue limit', async () => {
  const { store } = fixture();
  let enqueues = 0;
  store.enqueue = async (_scope, id, kind, payload) => {
    enqueues++;
    assert.equal(id, entryId);
    assert.equal(kind, 'price_save');
    assert.equal(payload.priceCents, 200);
    return { action: { id: entryId, state: 'queued', version: 1 } };
  };
  const server = new MarketplaceBrowserHttpApi({
    users: { userId: async () => userId },
    accountActions: store,
    broker: {
      open: async () => {
        throw new Error('must not open');
      },
      run: async () => {
        throw new Error('must not run');
      },
      close: async () => undefined,
    },
  }).createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const capability = await fetch(`http://127.0.0.1:${address.port}/marketplace-browser/healthz`);
    assert.equal((await capability.json()).accountActionsEnabled, true);
    for (let index = 0; index < 2; index++) {
      const response: Response = await fetch(
        `http://127.0.0.1:${address.port}/marketplace-browser/listings/price/save`,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            connectionId,
            entryId,
            requestId: entryId,
            expectedPriceCents: 100,
            priceCents: 200,
          }),
        },
      );
      assert.equal(response.status, 202);
      assert.equal((await response.json()).action.id, entryId);
    }
    assert.equal(enqueues, 2);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('isolated browser waits for durable before-write acknowledgement and never writes after rejection', async () => {
  let writes = 0,
    marks = 0;
  const commands = new BrowserSessionCommands({
    version: () => '',
    updateProfileAbout: async (_account, _about, authorize) => {
      await beforeVintedWrite(authorize);
      writes++;
      return 'confirmed';
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => commands.request(input) });
  const authorized = Object.assign(async () => undefined, {
    beforeWrite: async () => {
      marks++;
    },
  });
  assert.equal(await browser.updateProfileAbout?.('123', 'Hallo', authorized), 'confirmed');
  assert.equal(marks, 1);
  assert.equal(writes, 1);
  const refused = Object.assign(async () => undefined, {
    beforeWrite: async () => {
      throw new Error('begin ack missing');
    },
  });
  await assert.rejects(browser.updateProfileAbout!('123', 'Zweiter', refused));
  assert.equal(writes, 1);
});

test('compound edits accept a full category schema above 16 KiB and reject oversized bodies before admission', async () => {
  const { store } = fixture();
  const snapshot = listingCurrentContentFixture();
  const sizes = snapshot.schema.fields.find((field) => field.field === 'size')!;
  sizes.choices = Array.from({ length: 300 }, (_, index) => ({
    id: 1000 + index,
    label: 'Größe ' + index,
    selected: false,
    disabled: false,
    sizeGroupId: 31,
  }));
  const fields = {
    title: 'Meine Schuhe',
    description: 'Sehr gut erhalten.',
    price: '20.50',
    brand: '254956',
    size: '607',
    condition: '2',
    package: '2',
    color: 'Blau · Gelb',
    material: 'Acryl',
  };
  const body = JSON.stringify({
    workspaceId,
    connectionId,
    requestId: entryId,
    entryId,
    intent: {
      base: snapshot,
      fields,
      initialFields: fields,
      categoryEdit: snapshot,
      extras: null,
      photos: null,
    },
  });
  assert.ok(Buffer.byteLength(body) > 16 * 1024);
  let admissions = 0;
  store.enqueue = async (_scope, id, kind) => {
    admissions++;
    assert.equal(kind, 'listing_edit_intent');
    return { action: { id, state: 'queued', version: 1 } };
  };
  const server = new MarketplaceBrowserHttpApi({
    users: { userId: async () => userId },
    accountActions: store,
    broker: {
      open: async () => {
        throw new Error('Keine Browserarbeit bei der Annahme');
      },
      run: async () => {
        throw new Error('Keine Browserarbeit bei der Annahme');
      },
      close: async () => undefined,
    },
  }).createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/marketplace-browser/listings/edit/intent`;
  const headers = { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 202);
    assert.equal(
      (
        await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ padding: 'x'.repeat(1024 * 1024 + 4096) }),
        })
      ).status,
      413,
    );
    assert.equal(admissions, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('hard queue-limit rejection exposes one fixed German validation error', async () => {
  const store = new SupabaseMarketplaceAccountActionStore({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    fetch: async () =>
      Response.json(
        {
          code: 'P0001',
          details: 'account_action_queue_full',
          message: 'untrusted private context',
        },
        { status: 400 },
      ),
  });
  await assert.rejects(
    store.enqueue(
      { workspaceId, connectionId, userId, userAccessToken: 'fixture' },
      entryId,
      'profile_edit_read',
      {},
    ),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'account_action_queue_full' &&
      error.message.includes('50 Aktionen') &&
      !error.message.includes('private'),
  );
});

test('reconciliation cannot read an item from a different parent account', async () => {
  const { claim, store, calls } = fixture('outcome_reconcile', { actionId: entryId });
  claim.reconciliationContext = {
    actionId: entryId,
    kind: 'price_save',
    payload: { entryId, priceCents: 1000 },
    target: { ...claim.target, accountId: '999' },
  };
  let reads = 0;
  const runner = new MarketplaceAccountActionRunner({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    store,
    broker: {
      open: async () => sessionId,
      run: async (_scope, _id, operation) =>
        operation({
          version: () => '',
          readListingContent: async () => {
            reads++;
            throw new Error('must not read another account');
          },
        }),
      close: async () => undefined,
      discardUnstartedAction: async () => undefined,
    },
  });
  await runner.run(claim);
  assert.equal(reads, 0);
  assert.equal(calls.at(-1)?.body.p_state, 'failed');
  assert.equal(calls.at(-1)?.body.p_error_code, 'authorization_revoked');
});

test('unknown deletion is reconciled by read only evidence without another delete', async () => {
  const { claim, store, calls } = fixture('outcome_reconcile', { actionId: entryId });
  claim.target = { accountId: '123', externalId: null, entryId: null, entryKind: null, body: null };
  claim.reconciliationContext = {
    target: { accountId: '123', externalId: '456', entryId, entryKind: 'publication', body: {} },
    actionId: entryId,
    kind: 'listing_delete',
    payload: { entryId },
  };
  let reads = 0;
  let removals = 0;
  const runner = new MarketplaceAccountActionRunner({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    store,
    fetch: async (input, init) => {
      assert.equal(new URL(String(input)).pathname, '/rest/v1/marketplace_account_entries');
      assert.equal(init?.method, 'DELETE');
      removals++;
      return new Response(null, { status: 204 });
    },
    broker: {
      open: async () => sessionId,
      run: async (_scope, _id, operation) =>
        operation({
          version: () => '',
          readListingPresence: async () => {
            reads++;
            return 'absent';
          },
          deleteListing: async () => {
            throw new Error('must never delete again');
          },
        }),
      close: async () => undefined,
      discardUnstartedAction: async () => undefined,
    },
  });
  await runner.run(claim);
  assert.equal(reads, 1);
  assert.equal(removals, 1);
  assert.equal((calls.at(-1)?.body.p_result as Record<string, unknown>).resolution, 'succeeded');
  assert.deepEqual((calls.at(-1)?.body.p_result as Record<string, unknown>).providerResult, {
    status: 'confirmed',
  });
  assert.equal(
    calls.some((call) => call.name === 'marketplace_account_action_begin_write'),
    false,
  );
});

for (const kind of [
  'price_save',
  'listing_content_save',
  'profile_edit_save',
  'profile_details_save',
])
  test(`confirmed reconciliation refreshes the account cache without provider writes: ${kind}`, async () => {
    const { claim, store, calls } = fixture('outcome_reconcile', { actionId: entryId });
    claim.target = {
      accountId: '123',
      externalId: null,
      entryId: null,
      entryKind: null,
      body: null,
    };
    const current = { ...listingCurrentContentFixture(), externalId: '456' };
    const profile = {
      about: 'Neu',
      city: 'Berlin',
      showCity: true,
      language: 'de-DE',
      country: 'Deutschland',
      imageUrl: null,
      languages: [{ id: 'de-DE', label: 'Deutsch' }],
      canUploadPhoto: true,
    };
    const payload =
      kind === 'price_save'
        ? { entryId, priceCents: current.content.priceCents }
        : kind === 'listing_content_save'
          ? { entryId, content: current.content }
          : kind === 'profile_edit_save'
            ? { about: 'Neu' }
            : {
                changes: {
                  about: profile.about,
                  city: profile.city,
                  showCity: profile.showCity,
                  language: profile.language,
                },
              };
    claim.reconciliationContext = {
      target: { accountId: '123', externalId: '456', entryId, entryKind: 'publication', body: {} },
      actionId: entryId,
      kind,
      payload,
    };
    const persisted: Record<string, unknown>[] = [];
    const runner = new MarketplaceAccountActionRunner({
      url: 'https://db.example',
      serviceRoleKey: 'server',
      publishableKey: 'public',
      store,
      fetch: async (_input, init) => {
        if (!init?.method)
          return Response.json([{ body: { foreign: 42 }, observed_at: '2026-01-01T00:00:00Z' }]);
        persisted.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Response.json(init.method === 'PATCH' ? [{}] : true);
      },
      broker: {
        open: async () => sessionId,
        run: async (_scope, _id, operation) =>
          operation({
            version: () => '',
            readListingContent: async (account, external) => {
              assert.equal(account, '123');
              assert.equal(external, '456');
              return current;
            },
            readProfileAbout: async () => 'Neu',
            readProfileDetails: async () => profile,
          }),
        close: async () => undefined,
        discardUnstartedAction: async () => undefined,
      },
    });
    await runner.run(claim);
    assert.equal(persisted.length, 1);
    assert.equal((calls.at(-1)?.body.p_result as Record<string, unknown>).resolution, 'succeeded');
    const replay = (calls.at(-1)?.body.p_result as Record<string, unknown>)
      .providerResult as Record<string, unknown>;
    assert.equal(replay.status, 'confirmed');
    if (kind === 'price_save')
      assert.deepEqual(validateBrowserResult('updateListingPrice', replay), {
        status: 'confirmed',
        fields: {
          title: current.content.title,
          description: current.content.description,
          price: String(current.content.priceCents / 100),
        },
      });
    if (kind === 'profile_details_save')
      assert.deepEqual(parseVintedProfileSaveResult(replay), { status: 'confirmed', profile });
    assert.equal(
      calls.some((call) => call.name === 'marketplace_account_action_begin_write'),
      false,
    );
    if (kind === 'profile_details_save')
      assert.equal((persisted[0]?.body as Record<string, unknown>).foreign, 42);
    else assert.equal(persisted[0]?.p_connection_id, connectionId);
  });

test('failed cache repair never discards read-only provider confirmation or repeats a write', async () => {
  const { claim, store, calls } = fixture('outcome_reconcile', { actionId: entryId });
  claim.target = { accountId: '123', externalId: null, entryId: null, entryKind: null, body: null };
  claim.reconciliationContext = {
    target: { accountId: '123', externalId: '456', entryId, entryKind: 'publication', body: {} },
    actionId: entryId,
    kind: 'profile_edit_save',
    payload: { about: 'Neu' },
  };
  const runner = new MarketplaceAccountActionRunner({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    store,
    fetch: async () => new Response(null, { status: 503 }),
    broker: {
      open: async () => sessionId,
      run: async (_scope, _id, operation) =>
        operation({ version: () => '', readProfileAbout: async () => 'Neu' }),
      close: async () => undefined,
      discardUnstartedAction: async () => undefined,
    },
  });
  await runner.run(claim);
  const result = calls.at(-1)?.body.p_result as Record<string, unknown>;
  assert.equal(result.resolution, 'succeeded');
  assert.equal(result.cache, 'pending');
  assert.deepEqual(result.providerResult, { status: 'confirmed', cache: 'pending' });
  assert.equal(calls.at(-1)?.body.p_state, 'succeeded');
});

test('a still-present listing yields a replayable failed delete without another delete click', async () => {
  const { claim, store, calls } = fixture('outcome_reconcile', { actionId: entryId });
  claim.target = { accountId: '123', externalId: null, entryId: null, entryKind: null, body: null };
  claim.reconciliationContext = {
    target: { accountId: '123', externalId: '456', entryId, entryKind: 'publication', body: {} },
    actionId: entryId,
    kind: 'listing_delete',
    payload: { entryId },
  };
  const runner = new MarketplaceAccountActionRunner({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    store,
    fetch: async () => {
      throw new Error('must not delete the cache of an existing listing');
    },
    broker: {
      open: async () => sessionId,
      run: async (_scope, _id, operation) =>
        operation({
          version: () => '',
          readListingPresence: async () => 'present',
          deleteListing: async () => {
            throw new Error('must not delete again');
          },
        }),
      close: async () => undefined,
      discardUnstartedAction: async () => undefined,
    },
  });
  await runner.run(claim);
  const result = calls.at(-1)?.body.p_result as Record<string, unknown>;
  assert.equal(result.resolution, 'failed');
  assert.deepEqual(result.providerResult, { status: 'failed' });
  assert.equal(
    calls.some((call) => call.name === 'marketplace_account_action_begin_write'),
    false,
  );
});

test('matching profile text cannot confirm an unverified profile photo or fabricate a replay result', async () => {
  const { claim, store, calls } = fixture('outcome_reconcile', { actionId: entryId });
  claim.target = { accountId: '123', externalId: null, entryId: null, entryKind: null, body: null };
  const profile = {
    about: 'Neu',
    city: 'Berlin',
    showCity: true,
    language: 'de-DE',
    country: 'Deutschland',
    imageUrl: null,
    languages: [{ id: 'de-DE', label: 'Deutsch' }],
    canUploadPhoto: true,
  };
  claim.reconciliationContext = {
    target: { accountId: '123', externalId: '456', entryId, entryKind: 'publication', body: {} },
    actionId: entryId,
    kind: 'profile_details_save',
    payload: {
      changes: {
        about: profile.about,
        city: profile.city,
        showCity: profile.showCity,
        language: profile.language,
        photo: {
          mimeType: 'image/jpeg',
          base64: Buffer.from([255, 216, 255, 0, 255, 217]).toString('base64'),
        },
      },
    },
  };
  const runner = new MarketplaceAccountActionRunner({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    store,
    fetch: async () => {
      throw new Error('unconfirmed profile must not be cached as completed');
    },
    broker: {
      open: async () => sessionId,
      run: async (_scope, _id, operation) =>
        operation({ version: () => '', readProfileDetails: async () => profile }),
      close: async () => undefined,
      discardUnstartedAction: async () => undefined,
    },
  });
  await runner.run(claim);
  const result = calls.at(-1)?.body.p_result as Record<string, unknown>;
  assert.equal(result.resolution, null);
  assert.equal('providerResult' in result, false);
  assert.equal(
    calls.some((call) => call.name === 'marketplace_account_action_begin_write'),
    false,
  );
});

test('confirmed broker cleanup after an action error does not stop the whole worker or close twice', async () => {
  const { claim, store, calls } = fixture();
  const runner = new MarketplaceAccountActionRunner({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    store,
    broker: {
      open: async () => sessionId,
      run: async () => {
        throw new MarketplaceBrowserSessionEndedError('interrupted', { isSessionClosed: true });
      },
      close: async () => {
        throw new Error('must not close an already released session');
      },
      discardUnstartedAction: async () => undefined,
    },
  });
  await runner.run(claim);
  assert.equal(calls.at(-1)?.name, 'marketplace_account_action_retry');
});

test('lost initial begin acknowledgement cannot perform a provider write and is only retried by the database', async () => {
  const { claim, store, calls } = fixture('profile_edit_save', { about: 'Neu' });
  let writes = 0;
  store.begin = async () => {
    throw new Error('lost begin ACK');
  };
  const runner = new MarketplaceAccountActionRunner({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    store,
    broker: {
      open: async () => sessionId,
      run: async (_scope, _id, operation) =>
        operation({
          version: () => '',
          updateProfileAbout: async (_account, _about, authorize) => {
            await beforeVintedWrite(authorize);
            writes++;
            return 'confirmed';
          },
        }),
      close: async () => undefined,
      discardUnstartedAction: async () => undefined,
    },
  });
  await runner.run(claim);
  assert.equal(writes, 0);
  assert.equal(calls.at(-1)?.name, 'marketplace_account_action_retry');
  assert.equal(calls.at(-1)?.body.p_error_code, 'begin_unconfirmed');
});

test('already confirmed target price completes as a no-op without pretending to have written', async () => {
  const { claim, store, calls } = fixture('price_save', {
    entryId,
    expectedPriceCents: 100,
    priceCents: 100,
  });
  const runner = new MarketplaceAccountActionRunner({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    store,
    fetch: async () => Response.json(true),
    broker: {
      open: async () => sessionId,
      run: async (_scope, _id, operation) =>
        operation({
          version: () => '',
          updateListingPrice: async () => ({
            status: 'confirmed',
            fields: { title: 'Artikel', description: 'Beschreibung', price: '1,00' },
          }),
        }),
      close: async () => undefined,
      discardUnstartedAction: async () => undefined,
    },
  });
  await runner.run(claim);
  assert.equal(
    calls.some((call) => call.name === 'marketplace_account_action_begin_write'),
    false,
  );
  assert.equal(calls.at(-1)?.body.p_state, 'succeeded');
  assert.equal((calls.at(-1)?.body.p_result as Record<string, unknown>).noWriteNeeded, true);
});
function conversationReadRunner(
  store: SupabaseMarketplaceAccountActionStore,
  importAccount: NonNullable<BrowserInfo['importAccount']>,
) {
  const written: VintedAccountImport[] = [];
  const runner = new MarketplaceAccountActionRunner({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    store,
    broker: {
      open: async () => sessionId,
      run: async (_scope, _id, operation) => operation({ version: () => '', importAccount }),
      close: async () => undefined,
      discardUnstartedAction: async () => undefined,
    },
  });
  Reflect.set(runner, 'imports', {
    conversationVersions: async () => [],
    write: async (_scope: unknown, _session: string, snapshot: VintedAccountImport) => {
      written.push(snapshot);
      return { profile: 1, publication: 0, conversation: 1, message: 1, sale: 0 };
    },
  });
  return { runner, written };
}
test('conversation read stores only the requested conversation as a partial snapshot', async () => {
  const { claim, store, calls } = fixture('conversations_read', { conversationId: entryId });
  const observedAt = new Date().toISOString();
  const entry = (
    kind: VintedImportEntry['kind'],
    externalId: string,
    extra: Partial<VintedImportEntry> = {},
  ): VintedImportEntry => ({
    kind,
    externalId,
    sortAt: observedAt,
    body: {},
    ...extra,
  });
  const { runner, written } = conversationReadRunner(
    store,
    async (): Promise<VintedAccountImport> => ({
      identity: { id: '123', username: 'konto' },
      observedAt,
      entries: [
        entry('profile', '123'),
        entry('conversation', '456', { body: { detailCheckedAt: observedAt } }),
        entry('conversation', '789'),
        entry('message', '4561', { parentExternalId: '456' }),
        entry('message', '7891', { parentExternalId: '789' }),
        entry('sale', '999'),
      ],
      areas: {
        profile: { status: 'complete' },
        publications: { status: 'partial' },
        conversations: { status: 'complete' },
        messages: { status: 'partial' },
        sales: { status: 'partial' },
        feedback: { status: 'partial' },
      },
      rejectedSaleIds: ['999'],
      inboxEvents: {
        version: 1,
        observedAt,
        events: [],
        complete: true,
        coveredConversationIds: ['456', '789'],
      },
    }),
  );
  await runner.run(claim);
  assert.equal(calls.at(-1)?.body.p_state, 'succeeded');
  assert.equal(written.length, 1);
  const snapshot = written[0]!;
  assert.deepEqual(
    snapshot.entries.map((item) => `${item.kind}:${item.externalId}`),
    ['profile:123', 'conversation:456', 'message:4561'],
  );
  assert.equal(snapshot.areas.conversations.status, 'partial');
  assert.equal(snapshot.rejectedSaleIds, undefined);
  assert.equal(snapshot.inboxEvents?.complete, false);
  assert.deepEqual(snapshot.inboxEvents?.coveredConversationIds, ['456']);
});
test('a provider failure after browser start is retried as provider_failed, not browser_unavailable', async () => {
  const { claim, store, calls } = fixture('conversations_read', { conversationId: entryId });
  const { runner } = conversationReadRunner(store, async () => {
    throw new Error('Gespräch nicht bestätigt');
  });
  await runner.run(claim);
  const retry = calls.find((call) => call.name === 'marketplace_account_action_retry');
  assert.equal(retry?.body.p_error_code, 'provider_failed');
});
