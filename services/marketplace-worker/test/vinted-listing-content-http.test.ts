import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { MarketplaceBrowserHttpApi } from '../src/marketplace-browser-http-api.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import type { BrowserSessionScope } from '../src/marketplace-browser-session-broker.ts';
import { listingCurrentContentFixture } from './fixtures/vinted-listing-current-content.ts';

const workspaceId = '46700000-0000-4000-8000-000000000001',
  connectionId = '46700000-0000-4000-8000-000000000002',
  entryId = '46700000-0000-4000-8000-000000000005';

async function fixture(
  options: {
    missing?: boolean;
    readOnly?: boolean;
    foreignItem?: boolean;
    reassign?: boolean;
    waitForRead?: () => Promise<void>;
  } = {},
) {
  let opened = 0,
    closed = 0,
    reads = 0,
    reassigned = false;
  const targets: unknown[] = [];
  const browser: BrowserInfo = {
    version: () => 'fixture',
    updateListingContent: async (account, item, base, desired, authorize) => {
      reads++;
      targets.push([account, item, base.priceCents, desired.priceCents]);
      if (options.reassign) reassigned = true;
      await authorize();
      return options.foreignItem ? 'conflict' : 'confirmed';
    },
    readListingContent: async (account, item, authorize) => {
      reads++;
      targets.push([account, item]);
      await options.waitForRead?.();
      if (options.reassign) reassigned = true;
      await authorize();
      return {
        ...listingCurrentContentFixture(),
        ...(options.foreignItem ? { externalId: '98766' } : {}),
      };
    },
  };
  const api = new MarketplaceBrowserHttpApi({
    users: { userId: () => Promise.resolve('46700000-0000-4000-8000-000000000003') },
    readOnly: options.readOnly,
    edits: options.missing
      ? undefined
      : ({
          entry: (scope: BrowserSessionScope, kind: string, id?: string) => {
            targets.push([scope.workspaceId, scope.connectionId, scope.userAccessToken, kind, id]);
            return Promise.resolve({ externalId: '98765', accountId: reassigned ? '124' : '123' });
          },
        } as unknown as import('../src/vinted-edit-access.ts').VintedEditAccess),
    broker: {
      open: (scope) => {
        if (scope.workspaceId !== workspaceId || scope.connectionId !== connectionId)
          return Promise.reject(new Error('private denied detail'));
        opened++;
        return Promise.resolve('46700000-0000-4000-8000-000000000004');
      },
      run: <T>(
        _scope: BrowserSessionScope,
        _id: string,
        operation: (browser: BrowserInfo) => Promise<T>,
      ) => operation(browser),
      close: () => {
        closed++;
        return Promise.resolve();
      },
    },
  });
  const server = api.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    save: (body: unknown) =>
      fetch(`http://127.0.0.1:${address.port}/marketplace-browser/listings/content/save`, {
        method: 'POST',
        headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    request: (body: unknown) =>
      fetch(`http://127.0.0.1:${address.port}/marketplace-browser/listings/content/read`, {
        method: 'POST',
        headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    opened: () => opened,
    closed: () => closed,
    reads: () => reads,
    targets,
  };
}

test('content HTTP read resolves account and item from the own entry and releases its browser', async () => {
  const f = await fixture();
  try {
    const response = await f.request({ workspaceId, connectionId, entryId });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { listing: listingCurrentContentFixture() });
    assert.deepEqual(f.targets[0], [
      workspaceId,
      connectionId,
      'user-token',
      'publication',
      entryId,
    ]);
    assert.ok(f.targets.some((target) => JSON.stringify(target) === '["123","98765"]'));
    assert.equal(f.opened(), 1);
    assert.equal(f.closed(), 1);
  } finally {
    await f.close();
  }
});

test('content HTTP read rejects client supplied targets, invalid entries and foreign scope before browser reads', async () => {
  const f = await fixture();
  try {
    for (const body of [
      { workspaceId, connectionId, entryId: '98765' },
      { workspaceId, connectionId, entryId: null },
      { workspaceId, connectionId, entryId, externalId: '98765' },
      { workspaceId, connectionId, entryId, accountId: '123' },
    ])
      assert.equal((await f.request(body)).status, 400);
    assert.equal(
      (
        await f.request({
          workspaceId: '46700000-0000-4000-8000-000000000009',
          connectionId,
          entryId,
        })
      ).status,
      409,
    );
    assert.equal(f.reads(), 0);
    assert.equal(f.opened(), 0);
  } finally {
    await f.close();
  }
});

test('content HTTP read cannot return a foreign item, a reassigned account or an unsupported reader', async () => {
  for (const options of [
    { foreignItem: true },
    { reassign: true },
    { missing: true },
    { readOnly: true },
  ]) {
    const f = await fixture(options);
    try {
      const response = await f.request({ workspaceId, connectionId, entryId });
      assert.equal(response.status, options.missing ? 503 : options.readOnly ? 403 : 409);
      assert.doesNotMatch(await response.text(), /private denied detail|user-token|Meine Schuhe/);
      assert.equal(f.closed(), options.missing || options.readOnly ? 0 : 1);
    } finally {
      await f.close();
    }
  }
});

test('content HTTP read rejects a concurrent request and permits another after cleanup', async () => {
  let release!: () => void, started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const f = await fixture({
    waitForRead: () => {
      started();
      return waiting;
    },
  });
  const pending = f.request({ workspaceId, connectionId, entryId });
  try {
    await reading;
    assert.equal((await f.request({ workspaceId, connectionId, entryId })).status, 429);
    assert.equal(f.opened(), 1);
    release();
    assert.equal((await pending).status, 200);
    assert.equal((await f.request({ workspaceId, connectionId, entryId })).status, 200);
    assert.equal(f.closed(), 2);
  } finally {
    release();
    await pending;
    await f.close();
  }
});

test('content HTTP save writes only for the own entry and passes conflicts through unchanged', async () => {
  const base = listingCurrentContentFixture().content,
    content = { ...base, priceCents: 1800 };
  const f = await fixture();
  try {
    const response = await f.save({ workspaceId, connectionId, entryId, base, content });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'confirmed' });
    assert.ok(f.targets.some((target) => JSON.stringify(target) === '["123","98765",2050,1800]'));
    assert.equal(f.closed(), 1);
    for (const body of [
      { workspaceId, connectionId, entryId, base },
      { workspaceId, connectionId, entryId, base, content, externalId: '98765' },
      { workspaceId, connectionId, entryId, base, content: { ...content, priceCents: 0 } },
      { workspaceId, connectionId, entryId, base, content: { ...content, token: 'private' } },
      { workspaceId, connectionId, entryId: '98765', base, content },
    ])
      assert.equal((await f.save(body)).status, 400);
    assert.equal(f.reads(), 1);
  } finally {
    await f.close();
  }
  const conflict = await fixture({ foreignItem: true });
  try {
    const response = await conflict.save({ workspaceId, connectionId, entryId, base, content });
    assert.deepEqual(await response.json(), { status: 'conflict' });
  } finally {
    await conflict.close();
  }
  for (const options of [{ reassign: true }, { missing: true }, { readOnly: true }]) {
    const rejected = await fixture(options);
    try {
      const response = await rejected.save({ workspaceId, connectionId, entryId, base, content });
      assert.equal(response.status, options.missing ? 503 : options.readOnly ? 403 : 409);
    } finally {
      await rejected.close();
    }
  }
});
