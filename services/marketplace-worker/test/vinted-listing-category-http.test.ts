import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { MarketplaceBrowserHttpApi } from '../src/marketplace-browser-http-api.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import type { BrowserSessionScope } from '../src/marketplace-browser-session-broker.ts';

const workspaceId = '46600000-0000-4000-8000-000000000001',
  connectionId = '46600000-0000-4000-8000-000000000002';
const fields = {
  categoryId: 1223,
  fields: [
    {
      field: 'condition' as const,
      sizeGroupId: null,
      choices: [{ id: 2, label: 'Sehr gut', selected: false, disabled: false, sizeGroupId: null }],
    },
  ],
  unknownFields: [],
  acceptedPhotoMimeTypes: ['image/jpeg'],
  titleMaxLength: 100,
  descriptionMaxLength: 2000,
  aiPhoto: false,
  bump: false,
};
async function fixture(
  options: {
    missing?: boolean;
    readOnly?: boolean;
    wrongCategory?: boolean;
    revoke?: boolean;
    waitForRead?: () => Promise<void>;
  } = {},
) {
  let opened = 0,
    closed = 0,
    reads = 0,
    revoked = false;
  const targets: unknown[] = [];
  const browser: BrowserInfo = {
    version: () => 'fixture',
    readListingCategory: async (account, category, parents, authorize) => {
      reads++;
      targets.push([account, category, parents]);
      await options.waitForRead?.();
      if (options.revoke) revoked = true;
      await authorize();
      return { ...fields, categoryId: options.wrongCategory ? 2738 : category };
    },
  };
  const api = new MarketplaceBrowserHttpApi({
    users: { userId: () => Promise.resolve('46600000-0000-4000-8000-000000000003') },
    readOnly: options.readOnly,
    listingCategories: options.missing
      ? undefined
      : {
          read: async (
            scope: BrowserSessionScope,
            category: number,
            authorize: () => Promise<void>,
          ) => {
            targets.push([scope.workspaceId, scope.connectionId, scope.userAccessToken, category]);
            await authorize();
            return { accountId: '123', categoryPath: [5] };
          },
          authorize: () =>
            revoked ? Promise.reject(new Error('private denied detail')) : Promise.resolve(),
        },
    broker: {
      open: (scope) => {
        if (scope.workspaceId !== workspaceId || scope.connectionId !== connectionId)
          return Promise.reject(new Error('private denied detail'));
        opened++;
        return Promise.resolve('46600000-0000-4000-8000-000000000004');
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
    request: (body: unknown) =>
      fetch(`http://127.0.0.1:${address.port}/marketplace-browser/listings/category/read`, {
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
test('category HTTP read binds account and category to the caller and releases its browser', async () => {
  const f = await fixture();
  try {
    const response = await f.request({ workspaceId, connectionId, categoryId: 1223 });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { fields });
    assert.deepEqual(f.targets, [
      [workspaceId, connectionId, 'user-token', 1223],
      ['123', 1223, [5]],
    ]);
    assert.equal(f.opened(), 1);
    assert.equal(f.closed(), 1);
  } finally {
    await f.close();
  }
});
test('category HTTP read rejects extra inputs, invalid categories and foreign scope before browser reads', async () => {
  const f = await fixture();
  try {
    for (const categoryId of ['1223', 0, 1.5, null])
      assert.equal((await f.request({ workspaceId, connectionId, categoryId })).status, 400);
    assert.equal(
      (await f.request({ workspaceId, connectionId, categoryId: 1223, categoryPath: [99] })).status,
      400,
    );
    assert.equal(
      (
        await f.request({
          workspaceId: '46600000-0000-4000-8000-000000000009',
          connectionId,
          categoryId: 1223,
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
test('category HTTP read cannot return a changed category, revoked response or unsupported reader', async () => {
  for (const options of [
    { wrongCategory: true },
    { revoke: true },
    { missing: true },
    { readOnly: true },
  ]) {
    const f = await fixture(options);
    try {
      const response = await f.request({ workspaceId, connectionId, categoryId: 1223 });
      assert.equal(response.status, options.missing ? 503 : options.readOnly ? 403 : 409);
      assert.doesNotMatch(await response.text(), /private denied detail|user-token/);
      assert.equal(f.closed(), options.missing || options.readOnly ? 0 : 1);
    } finally {
      await f.close();
    }
  }
});
test('category HTTP read rejects a concurrent request and permits another after cleanup', async () => {
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
  const pending = f.request({ workspaceId, connectionId, categoryId: 1223 });
  try {
    await reading;
    assert.equal((await f.request({ workspaceId, connectionId, categoryId: 1223 })).status, 429);
    assert.equal(f.opened(), 1);
    release();
    assert.equal((await pending).status, 200);
    assert.equal(f.closed(), 1);
    assert.equal((await f.request({ workspaceId, connectionId, categoryId: 1223 })).status, 200);
    assert.equal(f.closed(), 2);
  } finally {
    release();
    await pending;
    await f.close();
  }
});
