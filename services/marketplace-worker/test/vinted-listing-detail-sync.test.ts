import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncVintedListingDetails } from '../src/vinted-listing-detail-sync.ts';
import type { VintedAccountImport } from '../src/vinted-account-import.ts';
import type { VintedPublicationVersion } from '../src/vinted-publication-age.ts';
import { listingCurrentContentFixture } from './fixtures/vinted-listing-current-content.ts';

const observedAt = '2026-11-05T10:00:00.000Z';
const version = '2026-11-04T10:00:00.000Z';
const listing = listingCurrentContentFixture();
const authorize = async () => undefined;
function snapshot(ids = ['98765']): VintedAccountImport {
  return {
    identity: { id: '123', username: 'fixture' },
    observedAt,
    entries: ids.map((externalId) => ({
      externalId,
      kind: 'publication',
      sortAt: observedAt,
      body: {
        title: listing.content.title,
        text: listing.content.description,
        textState: 'loaded',
        price: 20.5,
        listingSourceUpdatedAt: version,
      },
    })),
    areas: {
      profile: { status: 'complete' },
      publications: { status: 'complete' },
      conversations: { status: 'complete' },
      messages: { status: 'complete' },
      sales: { status: 'complete' },
      feedback: { status: 'complete' },
    },
  };
}
function cached(): VintedPublicationVersion {
  return {
    externalId: listing.externalId,
    occurredAt: null,
    publicationAge: null,
    checkedAt: null,
    listingContent: listing.content,
    listingDetailsReadAt: '2026-11-05T09:00:00.000Z',
    listingDetailsSourceUpdatedAt: version,
  };
}

test('automatic import stores all article details without replacing the original photo source', async () => {
  const value = snapshot();
  await syncVintedListingDetails(value, [], async () => listing, authorize);
  assert.deepEqual(value.entries[0]!.body.listingContent, listing.content);
  assert.equal(value.entries[0]!.body.listingDetailsReadAt, observedAt);
  assert.equal(value.entries[0]!.body.listingDetailsSourceUpdatedAt, version);
  assert.equal(value.entries[0]!.body.imageUrls, undefined);
});

test('unchanged stored details are reused without provider requests', async () => {
  const value = snapshot();
  await syncVintedListingDetails(
    value,
    [cached()],
    async () => assert.fail('Unexpected read'),
    authorize,
  );
  assert.deepEqual(value.entries[0]!.body.listingContent, listing.content);
});

test('provider version changes refresh size, colors, material and shipping even with unchanged text', async () => {
  const value = snapshot();
  value.entries[0]!.body.listingSourceUpdatedAt = observedAt;
  const updated = {
    ...listing,
    content: { ...listing.content, sizeId: 608, sizeLabel: '39' },
    schema: {
      ...listing.schema,
      fields: listing.schema.fields.map((field) =>
        field.field === 'size'
          ? { ...field, choices: [{ ...field.choices[0]!, id: 608, label: '39' }] }
          : field,
      ),
    },
  };
  await syncVintedListingDetails(value, [cached()], async () => updated, authorize);
  assert.deepEqual(value.entries[0]!.body.listingContent, updated.content);
});

test('visible title, description and price changes refresh even without a changed version', async () => {
  for (const field of ['title', 'text', 'price']) {
    const value = snapshot();
    value.entries[0]!.body[field] = field === 'price' ? 18 : 'Changed';
    let reads = 0;
    await syncVintedListingDetails(
      value,
      [cached()],
      async () => {
        reads++;
        return listing;
      },
      authorize,
    );
    assert.equal(reads, 1, field);
  }
});

test('without a source version refreshes daily and keeps a recent snapshot', async () => {
  for (const stale of [false, true]) {
    const value = snapshot();
    value.entries[0]!.body.listingSourceUpdatedAt = null;
    let reads = 0;
    await syncVintedListingDetails(
      value,
      [{ ...cached(), listingDetailsReadAt: stale ? version : observedAt }],
      async () => {
        reads++;
        return listing;
      },
      authorize,
    );
    assert.equal(reads, stale ? 1 : 0);
  }
});

test('failed or foreign details retain the last stored values and do not block other listings', async () => {
  const value = snapshot(['98765', '98766', '98767']);
  const reads: string[] = [];
  await syncVintedListingDetails(
    value,
    [{ ...cached(), listingDetailsSourceUpdatedAt: null }],
    async (id) => {
      reads.push(id);
      if (id === '98765') throw new Error('Unavailable');
      return { ...listing, externalId: id, externalAccountId: id === '98766' ? '456' : '123' };
    },
    authorize,
  );
  assert.deepEqual(reads, ['98765', '98766', '98767']);
  assert.deepEqual(value.entries[0]!.body.listingContent, listing.content);
  assert.equal(value.entries[1]!.body.listingContent, undefined);
  assert.deepEqual(value.entries[2]!.body.listingContent, listing.content);
});

test('bounds background reads and gives unattempted listings priority over a previous failure', async () => {
  const value = snapshot(['98765', '98766', '98767', '98768']);
  const reads: string[] = [];
  await syncVintedListingDetails(
    value,
    [{ ...cached(), listingContent: undefined, listingDetailsAttemptedAt: version }],
    async (id) => {
      reads.push(id);
      return { ...listing, externalId: id };
    },
    authorize,
  );
  assert.deepEqual(reads, ['98766', '98767', '98768']);
});

test('recent failed attempts are retained and do not immediately retry', async () => {
  const value = snapshot();
  await syncVintedListingDetails(
    value,
    [{ ...cached(), listingContent: undefined, listingDetailsAttemptedAt: observedAt }],
    async () => assert.fail('Unexpected retry'),
    authorize,
  );
  assert.equal(value.entries[0]!.body.listingDetailsAttemptedAt, observedAt);
});

test('elapsed time stops further background reads', async () => {
  const value = snapshot(['98765', '98766']);
  let time = 0;
  let reads = 0;
  await syncVintedListingDetails(
    value,
    [],
    async () => {
      reads++;
      time = 45_000;
      return listing;
    },
    authorize,
    () => time,
  );
  assert.equal(reads, 1);
});

test('revoked access aborts before storing provider details', async () => {
  const value = snapshot();
  let active = true;
  await assert.rejects(
    syncVintedListingDetails(
      value,
      [],
      async () => {
        active = false;
        return listing;
      },
      async () => {
        if (!active) throw new Error('Revoked');
      },
    ),
    /Revoked/,
  );
  assert.equal(value.entries[0]!.body.listingContent, undefined);
});
