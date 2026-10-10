import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { listingClaimFixture as cloud } from '../services/marketplace-worker/test/fixtures/marketplace-listing-claim.ts';
import { parseVintedListingSnapshot } from '../services/marketplace-worker/src/vinted-listing-contracts.ts';

const require = createRequire(import.meta.url);
const runtime = require('../tools/flipbase-extension/vinted-listing-runtime.js');
const clientModule = require('../tools/flipbase-extension/vinted-listing-client.js');
const workspaceId = cloud.scope.workspaceId,
  connectionId = cloud.scope.connectionId;
const now = Date.parse('2026-10-09T12:00:00Z');
const binding = {
  workspaceId,
  connectionId,
  externalAccountId: cloud.accountId,
  expiresAt: '2026-10-09T12:20:00Z',
};
const wire = {
  jobId: cloud.jobId,
  claimToken: cloud.claimToken,
  workspaceId,
  connectionId,
  externalAccountId: cloud.accountId,
  action: cloud.action,
  snapshot: cloud.snapshot,
  expiresAt: cloud.scope.listingWrite.expiresAt,
  absoluteExpiresAt: cloud.scope.listingWrite.absoluteExpiresAt,
};
const originalBytes = new Uint8Array([255, 216, 255, 1, 255, 217]);
function fixture(options = {}) {
  const calls = [];
  let clock = now;
  const claim = structuredClone(wire);
  claim.snapshot.images[0].byteSize = originalBytes.length;
  const adapter = {
    now: () => clock,
    request: async (request) => {
      calls.push(request);
      if (options.request) return options.request(request);
      if (request.action === 'listing_claim') return claim;
      if (request.action === 'listing_check')
        return {
          active: true,
          expiresAt: new Date(clock + 90_000).toISOString(),
          absoluteExpiresAt: wire.absoluteExpiresAt,
        };
      if (request.action === 'listing_begin') return { ok: true };
      return {
        id: wire.jobId,
        draftId: '12',
        workspaceId,
        connectionId,
        externalAccountId: cloud.accountId,
        action: wire.action,
        state: request.result.outcome,
        executionMode: 'local',
        ...(request.result.outcome === 'confirmed' ? request.result : {}),
        ...options.receipt,
      };
    },
    photo: async (request) => {
      calls.push(request);
      return options.photo
        ? options.photo(request)
        : new Response(originalBytes, {
            headers: {
              'content-type': 'image/jpeg',
              'content-length': String(originalBytes.length),
              'x-listing-image-id': request.imageId,
            },
          });
    },
  };
  return {
    client: clientModule.createClient(binding, adapter),
    calls,
    setTime: (value) => {
      clock = value;
    },
  };
}

test('local and cloud share the same immutable listing snapshot parser', () => {
  assert.equal(runtime.parseSnapshot, parseVintedListingSnapshot);
  const parsed = runtime.parseSnapshot(cloud.snapshot, workspaceId, connectionId);
  assert.deepEqual(parsed, cloud.snapshot);
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.images));
  assert.ok(Object.isFrozen(parsed.images[0]));
  assert.ok(Object.isFrozen(parsed.content));
  assert.ok(Object.isFrozen(parsed.content.attributes));
});

test('shared snapshots reject foreign scope, paths, duplicate originals, paid bumps and unbounded files', () => {
  const image = cloud.snapshot.images[0];
  for (const snapshot of [
    { ...cloud.snapshot, connectionId: cloud.scope.userId },
    { ...cloud.snapshot, bump: true },
    { ...cloud.snapshot, cookie: 'private' },
    { ...cloud.snapshot, images: [image, image] },
    {
      ...cloud.snapshot,
      images: [
        { ...image, storagePath: image.storagePath.replace(workspaceId, cloud.scope.userId) },
      ],
    },
    { ...cloud.snapshot, images: [{ ...image, byteSize: 50 * 1024 * 1024 + 1 }] },
    { ...cloud.snapshot, images: [{ ...image, id: Number(image.id) }] },
    { ...cloud.snapshot, images: [{ ...image, fileName: '../image.jpg' }] },
    { ...cloud.snapshot, content: { ...cloud.snapshot.content, currency: 'USD' } },
    { ...cloud.snapshot, content: { ...cloud.snapshot.content, priceCents: 12.5 } },
    { ...cloud.snapshot, content: { ...cloud.snapshot.content, attributes: { constructor: 'x' } } },
  ])
    assert.throws(() => runtime.parseSnapshot(snapshot, workspaceId, connectionId));
});

test('local claims preserve large text IDs and reject mismatched identity, commands and leases', () => {
  const claim = clientModule.parseClaim(wire, binding, now);
  assert.deepEqual(claim, wire);
  assert.ok(Object.isFrozen(claim));
  assert.ok(Object.isFrozen(claim.snapshot));
  for (const bad of [
    { ...wire, jobId: Number(wire.jobId) },
    { ...wire, jobId: '9223372036854775808' },
    { ...wire, externalAccountId: '999' },
    { ...wire, workspaceId: cloud.scope.userId },
    { ...wire, action: 'update' },
    { ...wire, cookie: 'private' },
    { ...wire, expiresAt: '2026-10-09T12:00:00Z' },
    { ...wire, expiresAt: '2026-10-09T12:30:00Z' },
    { ...wire, absoluteExpiresAt: '2026-10-09T12:30:00Z' },
    { ...wire, expiresAt: '2026-02-30T12:00:00Z' },
  ])
    assert.throws(() => clientModule.parseClaim(bad, binding, now));
});

test('claim and checks use only the bound scope and renew the lease without mutating the claim', async () => {
  const f = fixture();
  const claim = await f.client.claim();
  assert.deepEqual(f.calls[0], { action: 'listing_claim', workspaceId, connectionId });
  assert.equal(await f.client.check(claim), true);
  const check = {
    action: 'listing_check',
    workspaceId,
    connectionId,
    jobId: wire.jobId,
    claimToken: wire.claimToken,
  };
  assert.deepEqual(f.calls[1], check);
  f.setTime(now + 60_000);
  assert.equal(await f.client.check(claim), true);
  f.setTime(now + 120_000);
  assert.equal(await f.client.check(claim), true);
  assert.equal(claim.expiresAt, wire.expiresAt);
  await assert.rejects(f.client.check(structuredClone(claim)));
  await assert.rejects(f.client.claim());
});

test('null claims and expired binding do not create a provider action', async () => {
  const empty = fixture({ request: () => null });
  assert.equal(await empty.client.claim(), null);
  assert.equal(await empty.client.claim(), null);
  const f = fixture();
  f.setTime(now + 1_200_000);
  await assert.rejects(f.client.claim());
  assert.equal(f.calls.length, 0);
});

test('parallel begin reserves once, waits for authority and never retries a lost acknowledgement', async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture({
    request: async (request) => {
      if (request.action === 'listing_claim') return wire;
      if (request.action === 'listing_check') {
        await pending;
        return {
          active: true,
          expiresAt: wire.expiresAt,
          absoluteExpiresAt: wire.absoluteExpiresAt,
        };
      }
      throw new Error('lost begin acknowledgement');
    },
  });
  const claim = await f.client.claim();
  const first = f.client.begin(claim);
  await assert.rejects(f.client.begin(claim));
  release();
  await assert.rejects(first);
  await assert.rejects(f.client.begin(claim));
  assert.equal(f.calls.filter((call) => call.action === 'listing_begin').length, 1);
});

test('revoked or malformed checks stop begin before any begin request', async () => {
  for (const answer of [
    { active: false },
    { active: true, expiresAt: wire.expiresAt, absoluteExpiresAt: '2099-01-01T00:00:00Z' },
    { active: ['true'], expiresAt: wire.expiresAt, absoluteExpiresAt: wire.absoluteExpiresAt },
    { active: true, expiresAt: '2026-10-09T11:59:59Z', absoluteExpiresAt: wire.absoluteExpiresAt },
  ]) {
    const f = fixture({
      request: (request) => (request.action === 'listing_claim' ? wire : answer),
    });
    const claim = await f.client.claim();
    await assert.rejects(f.client.begin(claim));
    assert.equal(
      f.calls.some((call) => call.action === 'listing_begin'),
      false,
    );
  }
});

test('photo requests name an owned original and return bytes after fresh authority checks', async () => {
  const f = fixture();
  const claim = await f.client.claim();
  const photo = await f.client.loadPhoto(claim, claim.snapshot.images[0].id);
  assert.deepEqual(photo, {
    id: claim.snapshot.images[0].id,
    fileName: 'jacke.jpg',
    mimeType: 'image/jpeg',
    bytes: originalBytes,
  });
  assert.deepEqual(
    f.calls.map((call) => call.action),
    ['listing_claim', 'listing_check', 'listing_photo', 'listing_check'],
  );
  assert.deepEqual(f.calls[2], {
    action: 'listing_photo',
    workspaceId,
    connectionId,
    jobId: wire.jobId,
    claimToken: wire.claimToken,
    imageId: claim.snapshot.images[0].id,
  });
  const count = f.calls.length;
  await assert.rejects(f.client.loadPhoto(claim, '999'));
  assert.equal(f.calls.length, count);
});

test('photo reply rejects another ID, redirect, MIME, oversize and truncated bytes', async () => {
  for (const response of [
    new Response(originalBytes, {
      headers: { 'content-type': 'image/jpeg', 'x-listing-image-id': '999' },
    }),
    new Response(null, { status: 302 }),
    new Response(originalBytes, {
      headers: { 'content-type': 'image/png', 'x-listing-image-id': wire.snapshot.images[0].id },
    }),
    new Response(new Uint8Array(7), {
      headers: { 'content-type': 'image/jpeg', 'x-listing-image-id': wire.snapshot.images[0].id },
    }),
    new Response(new Uint8Array(5), {
      headers: { 'content-type': 'image/jpeg', 'x-listing-image-id': wire.snapshot.images[0].id },
    }),
  ]) {
    const f = fixture({ photo: () => response });
    const claim = await f.client.claim();
    await assert.rejects(f.client.loadPhoto(claim, claim.snapshot.images[0].id));
  }
});

test('finish remains bound to the original attempt after grant expiry and checks its receipt', async () => {
  const f = fixture();
  const claim = await f.client.claim();
  await f.client.begin(claim);
  f.setTime(now + 1_200_000);
  const result = { outcome: 'outcome_unknown', errorCode: 'provider_unconfirmed' };
  await f.client.finish(claim, result);
  assert.deepEqual(f.calls.at(-1), {
    action: 'listing_finish',
    workspaceId,
    connectionId,
    jobId: wire.jobId,
    claimToken: wire.claimToken,
    result,
  });
  for (const receipt of [
    { id: '999' },
    { workspaceId: cloud.scope.userId },
    { externalAccountId: '999' },
    { action: 'vinted_draft' },
    { state: 'confirmed' },
  ]) {
    const wrong = fixture({ receipt });
    const wrongClaim = await wrong.client.claim();
    await assert.rejects(wrong.client.finish(wrongClaim, result));
  }
});

test('unbound results and confirmation without an acknowledged begin are not sent', async () => {
  const f = fixture();
  const claim = await f.client.claim();
  const result = {
    outcome: 'confirmed',
    action: 'publish',
    externalId: '98765',
    externalAccountId: '123',
    providerState: 'active',
    verifiedAt: '2026-10-09T12:00:00.000Z',
  };
  await assert.rejects(f.client.finish(claim, result));
  assert.equal(f.calls.length, 1);
  await f.client.begin(claim);
  await assert.rejects(f.client.finish(claim, { ...result, externalAccountId: '999' }));
  await assert.rejects(f.client.finish(claim, { ...result, providerState: 'draft' }));
  assert.equal(
    f.calls.some((call) => call.action === 'listing_finish'),
    false,
  );
  await f.client.finish(claim, result);
  assert.deepEqual(f.calls.at(-1).result, result);
});

test('binding rejects coerced scope identifiers before contacting the backend', () => {
  for (const bad of [
    { ...binding, workspaceId: [workspaceId] },
    { ...binding, connectionId: [connectionId] },
    { ...binding, externalAccountId: 123 },
  ])
    assert.throws(() =>
      clientModule.createClient(bad, {
        now: () => now,
        request: () => assert.fail(),
        photo: () => assert.fail(),
      }),
    );
});

test('late check replies cannot reactivate a finished or already revoked attempt', async () => {
  for (const finish of [false, true]) {
    let release,
      checks = 0;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const f = fixture({
      request: (request) => {
        if (request.action === 'listing_claim') return wire;
        if (request.action === 'listing_check') return ++checks === 1 ? pending : { active: false };
        return {
          id: wire.jobId,
          draftId: '12',
          workspaceId,
          connectionId,
          externalAccountId: cloud.accountId,
          action: wire.action,
          state: 'failed',
          executionMode: 'local',
        };
      },
    });
    const claim = await f.client.claim();
    const earlier = f.client.check(claim);
    if (finish) await f.client.finish(claim, { outcome: 'failed', errorCode: 'cancelled' });
    else assert.equal(await f.client.check(claim), false);
    release({ active: true, expiresAt: wire.expiresAt, absoluteExpiresAt: wire.absoluteExpiresAt });
    assert.equal(await earlier, false);
  }
});

test('saved photo proof matches original order across native and public CDN variants', () => {
  const first = '06_00efb_aT3zEV4gS3asXadrwvWbPVtr';
  const second = '06_0174e_Hwk26KHg8FtTcfxMybzUiV2P';
  const uploaded = [first, second].map((asset, index) => ({
    sourceImageId: String(index + 1),
    previewUrl: `https://images1.vinted.net/tc/${asset}/f800/1788288106.webp`,
  }));
  const saved = {
    valid: true,
    items: [first, second].map((asset, index) => ({
      index,
      ready: true,
      url: `https://images2.vinted.net/t/${asset}/310x430/1788288106.webp?s=${'a'.repeat(40)}`,
    })),
  };
  assert.equal(runtime.photosMatch(uploaded, saved, ['1', '2']), true);
  for (const bad of [
    { ...saved, items: saved.items.toReversed() },
    { ...saved, items: saved.items.slice(0, 1) },
    { ...saved, valid: false },
    { ...saved, items: [{ ...saved.items[0], ready: false }, saved.items[1]] },
    { ...saved, items: [{ ...saved.items[0], index: 1 }, saved.items[1]] },
    { ...saved, items: [saved.items[0], { ...saved.items[1], url: saved.items[0].url }] },
    {
      ...saved,
      items: [
        { ...saved.items[0], url: saved.items[0].url.replace('1788288106', '1788288107') },
        saved.items[1],
      ],
    },
    {
      ...saved,
      items: [
        { ...saved.items[0], url: 'https://evil.test/t/' + first + '/f800/1788288106.webp' },
        saved.items[1],
      ],
    },
  ])
    assert.equal(runtime.photosMatch(uploaded, bad, ['1', '2']), false);
  assert.equal(runtime.photosMatch(uploaded, saved, ['2', '1']), false);
  assert.equal(runtime.photosMatch(uploaded, saved, ['1', '1']), false);
  assert.equal(runtime.photosMatch([], { valid: true, items: [] }, []), false);
});

test('photo proof rejects unsafe CDN URLs even when preview and saved URL look equal', () => {
  for (const url of [
    'data:image/png;base64,AA',
    'blob:https://www.vinted.de/42',
    'http://images1.vinted.net/t/asset/f800/1788288106.webp',
    'https://images1.vinted.net.evil.test/t/asset/f800/1788288106.webp',
    'https://user:password@images1.vinted.net/t/asset/f800/1788288106.webp',
    'https://images1.vinted.net/t/asset/f800/1788288106.webp#hash',
    'https://images1.vinted.net/t/asset/f800/1788288106.webp?secret=private',
    'https://images1.vinted.net/t/asset/not-a-size/1788288106.webp',
  ])
    assert.equal(
      runtime.photosMatch(
        [{ sourceImageId: '1', previewUrl: url }],
        { valid: true, items: [{ index: 0, ready: true, url }] },
        ['1'],
      ),
      false,
    );
});
