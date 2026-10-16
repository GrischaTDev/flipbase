import { assertEquals } from 'jsr:@std/assert@1.0.14';
import { parseKleinanzeigenDraftContent } from './kleinanzeigen-listing-validation.mts';
import {
  parseKleinanzeigenUserJobRequest,
  parseKleinanzeigenInstallJobRequest,
  parseKleinanzeigenListingJob,
  parseKleinanzeigenJobOutcome,
  parseKleinanzeigenJobPreflight,
} from './kleinanzeigen-job-contracts.ts';
const workspace = '51000000-0000-4000-8000-000000000011';
const draft = '51000000-0000-4000-8000-000000000041';
const requestId = '51000000-0000-4000-8000-000000000061';
const attempt = '51000000-0000-4000-8000-000000000062';
const imageId = '51000000-0000-4000-8000-000000000071';
const scope = { workspaceId: workspace, connectionId: '9007199254740993' };
const content = {
  title: 'Jacke',
  description: 'Ganz',
  priceCents: 1200,
  currency: 'EUR',
  priceType: 'FIXED',
  postalCode: '12345',
  shippingType: 'pickup',
  shippingPriceCents: null,
  categoryId: '153/160/shirts',
  categoryFields: { 'kleidung_herren.condition': 'ok' },
  schemaRevision: 'a'.repeat(64),
};
const image = {
  imageId,
  storagePath:
    'kleinanzeigen-jobs/' + workspace + '/' + requestId + '/' + attempt + '/' + imageId + '.jpg',
  fileName: 'Bild.jpg',
  mimeType: 'image/jpeg',
  byteSize: 1024,
  sha256: 'b'.repeat(64),
};
const snapshot = {
  ...scope,
  draftId: draft,
  draftRevision: 4,
  grantGeneration: 2,
  externalAccountId: '88',
  content,
  images: [image],
};
const now = Date.now();
const at = new Date(now).toISOString();
const job = {
  id: '9007199254740995',
  ...scope,
  draftId: draft,
  draftRevision: 4,
  grantGeneration: 2,
  requestedBy: '51000000-0000-4000-8000-000000000001',
  immutableSnapshot: snapshot,
  state: 'queued',
  version: 1,
  externalId: null,
  providerState: null,
  verifiedAt: null,
  errorCode: null,
  createdAt: at,
  updatedAt: at,
};
Deno.test(
  'Aufträge behalten große Kontokennungen als Zeichenketten und akzeptieren nur vollständige eigene Fotokopien',
  () => {
    assertEquals<unknown>(
      parseKleinanzeigenListingJob(job, scope, parseKleinanzeigenDraftContent, now),
      job,
    );
    for (const changed of [
      { ...job, connectionId: 9007199254740993 },
      { ...job, claimTokenHash: 'secret' },
      { ...job, version: 0 },
      {
        ...job,
        immutableSnapshot: {
          ...snapshot,
          images: [{ ...image, storagePath: 'https://foreign.test/image.jpg' }],
        },
      },
      {
        ...job,
        immutableSnapshot: {
          ...snapshot,
          images: [{ ...image, storagePath: image.storagePath.replace(workspace, draft) }],
        },
      },
      { ...job, immutableSnapshot: { ...snapshot, images: [image, image] } },
      { ...job, immutableSnapshot: { ...snapshot, content: { ...content, priceCents: 1234 } } },
      { ...job, immutableSnapshot: { ...snapshot, draftRevision: 3 } },
    ])
      assertEquals(
        parseKleinanzeigenListingJob(changed, scope, parseKleinanzeigenDraftContent, now),
        null,
      );
  },
);
Deno.test(
  'Bestätigt verlangt aktive Ziel-ID; Verarbeitungszustand kann keinen neuen Auftrag behaupten',
  () => {
    assertEquals(
      parseKleinanzeigenListingJob(
        { ...job, state: 'confirmed' },
        scope,
        parseKleinanzeigenDraftContent,
        now,
      ),
      null,
    );
    assertEquals(
      parseKleinanzeigenListingJob(
        {
          ...job,
          state: 'confirmed',
          externalId: '999',
          providerState: 'processing',
          verifiedAt: at,
        },
        scope,
        parseKleinanzeigenDraftContent,
        now,
      ),
      null,
    );
    assertEquals(
      parseKleinanzeigenListingJob(
        { ...job, externalId: '999', providerState: 'processing', verifiedAt: at },
        scope,
        parseKleinanzeigenDraftContent,
        now,
      ),
      null,
    );
    assertEquals(
      parseKleinanzeigenListingJob(
        {
          ...job,
          state: 'writing',
          externalId: '999',
          providerState: 'processing',
          verifiedAt: at,
        },
        scope,
        parseKleinanzeigenDraftContent,
        now,
      )?.state,
      'writing',
    );
  },
);
Deno.test('Nutzer kann keinen Ausführungszustand oder fremde Kopierpfade übergeben', () => {
  const input = {
    action: 'listing_enqueue',
    ...scope,
    draftId: draft,
    expectedRevision: 4,
    requestId,
  };
  assertEquals<unknown>(parseKleinanzeigenUserJobRequest(input), input);
  for (const changed of [
    { ...input, photos: [image] },
    { ...input, requestedBy: 'other' },
    { ...input, expectedRevision: 0 },
    { ...input, state: 'confirmed' },
    { ...input, connectionId: '01' },
  ])
    assertEquals(parseKleinanzeigenUserJobRequest(changed), null);
});
Deno.test(
  'Installationsaktionen verlangen eigene Versuchkennung und eindeutige Kosten- oder Bildanfrage',
  () => {
    const input = {
      action: 'job_begin',
      ...scope,
      generation: 2,
      jobId: job.id,
      claimToken: 'c'.repeat(64),
      expectedVersion: 2,
      fee: { state: 'free', observedAt: at },
    };
    assertEquals<unknown>(parseKleinanzeigenInstallJobRequest(input), input);
    for (const changed of [
      { ...input, claimToken: 'secret' },
      { ...input, fee: { state: 'free', observedAt: at, price: 0 } },
      { ...input, generation: 0 },
      { ...input, expectedVersion: 0 },
      { ...input, jobId: 1 },
    ])
      assertEquals(parseKleinanzeigenInstallJobRequest(changed), null);
    const quota = {
      action: 'quota_observation',
      ...scope,
      generation: 2,
      jobId: null,
      quota: {
        externalAccountId: '88',
        accountType: 'private',
        used: 99,
        observedAt: at,
        source: 'account_settings',
      },
    };
    assertEquals<unknown>(parseKleinanzeigenInstallJobRequest(quota), quota);
    assertEquals(
      parseKleinanzeigenInstallJobRequest({
        ...quota,
        quota: { ...quota.quota, source: 'active_listings' },
      }),
      null,
    );
  },
);
Deno.test('Anbieterbestätigung verlangt passende ID in einer echten Ziel-URL', () => {
  const result = {
    outcome: 'confirmed',
    externalId: '999',
    externalAccountId: '88',
    providerState: 'active',
    verifiedAt: at,
    url: 'https://www.kleinanzeigen.de/s-anzeige/jacke/999-160-1',
  };
  assertEquals<unknown>(parseKleinanzeigenJobOutcome(result), result);
  for (const changed of [
    { ...result, url: 'https://evil.test/s-anzeige/jacke/999-160-1' },
    { ...result, url: result.url.replace('999-', '998-') },
    { ...result, externalId: null },
    { ...result, providerState: 'processing' },
    { ...result, token: 'secret' },
  ])
    assertEquals(parseKleinanzeigenJobOutcome(changed), null);
});
Deno.test(
  'Vorprüfung erlaubt nur private Bilder dieses Entwurfs und erhält die Reihenfolge',
  () => {
    const preflight = {
      ...snapshot,
      images: [
        {
          imageId,
          storagePath: 'listings/' + workspace + '/' + draft + '/' + imageId + '.jpg',
          fileName: 'Bild.jpg',
          mimeType: 'image/jpeg',
          byteSize: 1024,
          sortOrder: 0,
        },
      ],
    };
    assertEquals<unknown>(
      parseKleinanzeigenJobPreflight(preflight, scope, parseKleinanzeigenDraftContent),
      preflight,
    );
    assertEquals(
      parseKleinanzeigenJobPreflight(
        {
          ...preflight,
          images: [{ ...preflight.images[0], storagePath: 'http://localhost/private' }],
        },
        scope,
        parseKleinanzeigenDraftContent,
      ),
      null,
    );
  },
);
