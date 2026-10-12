import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import {
  listingFailureContext,
  MarketplaceBrowserHttpApi,
} from '../src/marketplace-browser-http-api.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import type { BrowserSessionScope } from '../src/marketplace-browser-session-broker.ts';
import { listingCurrentContentFixture } from './fixtures/vinted-listing-current-content.ts';
import { MarketplaceBrowserSessionEndedError } from '../src/marketplace-browser-session-broker.ts';
import {
  BrowserActionFailedError,
  plainFailureMessage,
  unexpectedFailureDetail,
  VintedListingReadError,
} from '../src/vinted-listing-read-error.ts';
import {
  vintedListingUpdateFailure,
  vintedListingUpdateSteps,
  type VintedListingUpdateStep,
} from '../src/vinted-browser-listing-update.ts';

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
    failAtStep?: 'form' | 'photos';
    failClose?: boolean;
    failConfirm?: boolean;
    /** Das Speichern bricht im getrennten Browser beim Verschieben der Fotos ab. */
    failSave?: boolean;
  } = {},
) {
  let terminated = false,
    opened = 0,
    closed = 0,
    reads = 0,
    reassigned = false;
  const targets: unknown[] = [];
  const browser: BrowserInfo = {
    version: () => 'fixture',
    updateListingContent: async (account, item, base, desired, authorize, photos) => {
      reads++;
      targets.push([account, item, base.priceCents, desired.priceCents]);
      if (photos) targets.push(['photos', photos.base.length, photos.desired]);
      // So kommt der Abbruch aus dem getrennten Browser an: nur die geprüfte Kurzbeschreibung.
      if (options.failSave)
        throw new BrowserActionFailedError(
          unexpectedFailureDetail(vintedListingUpdateFailure('photoMove')),
        );
      if (options.reassign) reassigned = true;
      await authorize();
      return options.foreignItem ? 'conflict' : 'confirmed';
    },
    readListingContent: async (account, item, authorize) => {
      reads++;
      targets.push([account, item]);
      await options.waitForRead?.();
      if (options.failAtStep) throw new VintedListingReadError(options.failAtStep);
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
            // Der vierte Kontoabgleich ist die Bestätigung nach dem Lesen.
            if (options.failConfirm && reads === 1 && targets.length >= 4)
              return Promise.reject(new Error('Kontozugriff nicht bestätigt'));
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
      // Wie der echte Broker: jeder Fehler der Aktion wird durch „Sitzung unterbrochen“ ersetzt.
      run: <T>(
        _scope: BrowserSessionScope,
        _id: string,
        operation: (browser: BrowserInfo) => Promise<T>,
      ) =>
        operation(browser).catch((error: unknown) => {
          if (options.failAtStep || options.failSave) {
            terminated = true;
            throw new MarketplaceBrowserSessionEndedError('interrupted');
          }
          throw error;
        }),
      close: () => {
        closed++;
        if (terminated) return Promise.reject(new Error('Sitzungszugriff verweigert'));
        return options.failClose && closed === 1
          ? Promise.reject(new Error('private stop detail 42'))
          : Promise.resolve();
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

test('content HTTP read names the failing step although the session broker replaces every error', async () => {
  for (const step of ['form', 'photos'] as const) {
    const f = await fixture({ failAtStep: step });
    try {
      const response = await f.request({ workspaceId, connectionId, entryId });
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: 'vinted_listing_read_failed', step });
      assert.equal(f.closed(), 1);
    } finally {
      await f.close();
    }
  }
});

async function capturedListingFailures(
  action: () => Promise<void>,
  event = 'marketplace_listing_request_failed',
): Promise<unknown[]> {
  const original = process.stderr.write.bind(process.stderr);
  const lines: unknown[] = [];
  process.stderr.write = ((chunk: unknown) => {
    try {
      const value: unknown = JSON.parse(String(chunk));
      if (value && typeof value === 'object' && 'event' in value && value.event === event)
        lines.push(value);
    } catch {
      // Fremde Ausgaben bleiben unberührt.
    }
    return true;
  }) as typeof process.stderr.write;
  try {
    await action();
  } finally {
    process.stderr.write = original;
  }
  return lines;
}

test('content HTTP read logs the fixed phase of a failure outside the reader without private text', async () => {
  for (const [options, phase, detail] of [
    [{ failClose: true }, 'close', 'Error'],
    [{ failConfirm: true }, 'confirm', 'Error: Kontozugriff nicht bestätigt'],
  ] as const) {
    const f = await fixture(options);
    try {
      const lines = await capturedListingFailures(async () => {
        const response = await f.request({ workspaceId, connectionId, entryId });
        assert.equal(response.ok, false);
        await response.arrayBuffer();
      });
      assert.deepEqual(lines, [
        {
          event: 'marketplace_listing_request_failed',
          route: 'content/read',
          reason: 'failed',
          phase,
          kind: 'Error',
          detail,
        },
      ]);
      assert.equal(JSON.stringify(lines).includes('private'), false);
    } finally {
      await f.close();
    }
  }
});

test('content HTTP save logs the step of an aborted save before the broker replaces the error', async () => {
  const base = listingCurrentContentFixture().content;
  // Jede Abschnittsmeldung besteht nur aus gewöhnlichen Wörtern, sonst entfiele sie im Protokoll.
  for (const step of Object.keys(vintedListingUpdateSteps) as VintedListingUpdateStep[])
    assert.match(vintedListingUpdateFailure(step).message, plainFailureMessage);
  const f = await fixture({ failSave: true });
  try {
    const lines = await capturedListingFailures(async () => {
      const response = await f.save({ workspaceId, connectionId, entryId, base, content: base });
      assert.equal(response.ok, false);
      await response.arrayBuffer();
    }, 'marketplace_listing_read_detail');
    assert.deepEqual(lines, [
      {
        event: 'marketplace_listing_read_detail',
        route: 'content/save',
        origin: 'browser',
        detail: 'Error: Speichern abgebrochen bei fotos verschieben',
      },
    ]);
    assert.equal(f.closed(), 1);
  } finally {
    await f.close();
  }
});

test('listing failure context names an ended session and keeps reader steps untouched', () => {
  assert.deepEqual(
    listingFailureContext(new MarketplaceBrowserSessionEndedError('interrupted'), 'read'),
    {
      phase: 'read',
      kind: 'MarketplaceBrowserSessionEndedError',
      sessionEnd: 'interrupted',
      detail: 'Error: Browsersitzung unterbrochen',
    },
  );
  assert.deepEqual(listingFailureContext(new VintedListingReadError('form'), 'read'), {
    phase: 'read',
  });
  assert.deepEqual(listingFailureContext('text', undefined), { detail: 'Unknown' });
});

test('content HTTP save passes a photo arrangement on and rejects anything but known photos', async () => {
  const base = listingCurrentContentFixture().content;
  const photoA = 'https://images1.vinted.net/tc/fixtureA/f800/1.webp',
    photoB = 'https://images1.vinted.net/tc/fixtureB/f800/2.webp';
  const f = await fixture();
  try {
    const response = await f.save({
      workspaceId,
      connectionId,
      entryId,
      base,
      content: base,
      photos: { base: [photoA, photoB], desired: [photoB] },
    });
    assert.equal(response.status, 200);
    assert.ok(
      f.targets.some(
        (target) => JSON.stringify(target) === JSON.stringify(['photos', 2, [photoB]]),
      ),
    );
    for (const photos of [
      { base: [photoA], desired: [photoB] },
      { base: [photoA], desired: [] },
      { base: ['https://example.org/a.webp'], desired: ['https://example.org/a.webp'] },
      'text',
    ])
      assert.equal(
        (await f.save({ workspaceId, connectionId, entryId, base, content: base, photos })).status,
        400,
        JSON.stringify(photos),
      );
    assert.equal(f.reads(), 1);
  } finally {
    await f.close();
  }
});
