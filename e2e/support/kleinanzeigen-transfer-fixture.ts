import { parseKleinanzeigenJob } from '../../src/app/features/marketplaces/models/kleinanzeigen-listing-job';

import type { Page } from '@playwright/test';
import { mockMarketplaceOverview } from './marketplace-overview-fixture';
import { workspaceId, accountIds } from './marketplace-account-fixture';
import type {
  KleinanzeigenDraftContent,
  KleinanzeigenTransferDraft,
} from '../../supabase/functions/_shared/kleinanzeigen-listing-contracts';
import type { KleinanzeigenListingJob } from '../../supabase/functions/_shared/kleinanzeigen-job-contracts';
export async function mockKleinanzeigenTransfer(
  page: Page,
  options: {
    quotaUsed?: number;
    result?: 'confirmed' | 'fees' | 'unknown' | 'processing';
    imagesComplete?: boolean;
    longSource?: boolean;
    extensionAvailable?: boolean;
    lostEnqueueReply?: boolean;
    wrongBindingOnPublish?: boolean;
    quotaUnknown?: boolean;
    secondTarget?: boolean;
    missingSourceValues?: boolean;
    handoffError?: boolean;
    categoryUnavailable?: boolean;
    relisting?: boolean;
  } = {},
) {
  await mockMarketplaceOverview(page);
  const sourceCalls: string[] = [];
  await page.route('**/marketplace-browser/**', (route) => {
    sourceCalls.push(route.request().url());
    return route.fulfill({ status: 503, json: { error: 'source_provider_must_not_be_started' } });
  });
  const connectionId = '9007199254740993';
  const externalAccountId = '88';
  const generation = 2;
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  const draftId = '25000000-0000-4000-8000-000000000041';
  const imageId = '25000000-0000-4000-8000-000000000071';
  const calls: Record<string, unknown>[] = [];
  const bridgeRequests: Record<string, unknown>[] = [];
  const savedSchemaRequests: URL[] = [];
  let draft: KleinanzeigenTransferDraft | null = null;
  let job: KleinanzeigenListingJob | null = null;
  let providerCalls = 0;
  let lostReply = true;
  const binding = {
    workspaceId,
    connectionId,
    externalAccountId,
    displayName: 'Kleinanzeigen Privatkonto',
    accountType: 'private',
    status: 'connected',
    generation,
    expiresAt,
    canPublish: true,
  };
  const schema = {
    categoryPath: '153/160/shirts',
    categoryLabel: 'Mode & Beauty > Herrenbekleidung > Shirts',
    titleMax: 65,
    descriptionMax: 4000,
    photoCountMax: 20,
    photoBytesMax: 12582912,
    priceStepCents: 100,
    fields: [
      {
        key: 'kleidung_herren.condition',
        label: 'Zustand',
        kind: 'select',
        selection: 'value',
        required: false,
        choices: [
          { value: 'ok', label: 'Gut', description: '' },
          { value: 'like_new', label: 'Sehr Gut', description: '' },
        ],
      },
    ],
    shipping: { defaultGroup: null, defaultMethods: [], groups: [] },
  };
  await page.route('**/rest/v1/listing_images?**', (route) =>
    route.fulfill({
      json: [
        {
          id: imageId,
          listing_id: draftId,
          workspace_id: workspaceId,
          storage_path: 'listings/' + workspaceId + '/' + draftId + '/image.jpg',
          file_name: 'Bild.jpg',
          sort_order: 0,
        },
      ],
    }),
  );
  await page.route('**/storage/v1/object/sign/item-media', (route) => {
    const paths = route.request().postDataJSON().paths as string[];
    return route.fulfill({
      json: paths.map((path) => ({
        path,
        signedURL: '/object/sign/item-media/' + path + '?token=fixture',
        error: null,
      })),
    });
  });
  await page.route('**/rest/v1/kleinanzeigen_form_schemas?**', (route) => {
    const url = new URL(route.request().url());
    savedSchemaRequests.push(url);
    if (
      url.searchParams.get('workspace_id') !== 'eq.' + workspaceId ||
      ![connectionId, '9007199254740994'].includes(
        url.searchParams.get('connection_id')?.replace('eq.', '') ?? '',
      ) ||
      url.searchParams.get('grant_generation') !== 'eq.' + generation
    )
      return route.fulfill({ status: 403, json: { message: 'Falscher Formularkontext' } });
    return route.fulfill({
      json: [
        {
          category_path: schema.categoryPath,
          schema_revision: 'c'.repeat(64),
          provider_schema: schema,
          grant_generation: generation,
          observed_at: new Date().toISOString(),
        },
      ],
    });
  });
  await page.exposeFunction('__flipbaseTransferRequest', (request: Record<string, unknown>) => {
    bridgeRequests.push(request);
  });
  await page.route('https://images1.vinted.net/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8AAAAABJRU5ErkJggg==',
        'base64',
      ),
    }),
  );
  await page.exposeFunction('__flipbaseTransferProvider', (mode: string) => {
    providerCalls++;
    if (!job) throw Error('Kein gespeicherter Testauftrag');
    const result = mode === 'reconcile' ? 'confirmed' : (options.result ?? 'confirmed');
    const confirmed = result === 'confirmed';
    const processing = result === 'processing';
    job = {
      ...job,
      state: confirmed
        ? 'confirmed'
        : processing
          ? 'writing'
          : result === 'fees'
            ? 'needs_user_action'
            : 'outcome_unknown',
      version: job.version + 1,
      externalId: confirmed || processing ? '999' : null,
      providerState: confirmed ? 'active' : processing ? 'processing' : null,
      verifiedAt: confirmed || processing ? new Date().toISOString() : null,
      errorCode:
        result === 'fees' ? 'fees_due' : result === 'unknown' ? 'publication_unconfirmed' : null,
      updatedAt: new Date().toISOString(),
    };
    return { workspaceId, connectionId, generation, jobId: job.id, handled: true };
  });
  await page.addInitScript(
    ({
      binding,
      schema,
      quotaUsed,
      available,
      wrongBindingOnPublish,
      quotaUnknown,
      handoffError,
      categoryUnavailable,
    }) => {
      let categoryReviewed = false;
      window.addEventListener('message', async (event) => {
        if (
          event.source !== window ||
          event.origin !== location.origin ||
          !event.data ||
          typeof event.data !== 'object'
        )
          return;
        const data = event.data as Record<string, unknown>;
        if (
          typeof data['type'] === 'string' &&
          data['type'].startsWith('FLIPBASE_') &&
          ![
            'FLIPBASE_EXTENSION_STATUS',
            'FLIPBASE_KLEINANZEIGEN_RESULT',
            'FLIPBASE_VINTED_LOCAL_RESULT',
          ].includes(data['type'])
        ) {
          await (
            window as unknown as {
              __flipbaseTransferRequest: (request: Record<string, unknown>) => Promise<void>;
            }
          ).__flipbaseTransferRequest(data);
        }
        const send = (value: unknown) => window.postMessage(value, location.origin);
        if (data['type'] === 'FLIPBASE_CHECK_EXTENSION') {
          send({
            type: 'FLIPBASE_EXTENSION_STATUS',
            installed: available,
            kleinanzeigenFormSchema: available,
            kleinanzeigenAssistedListings: available,
            kleinanzeigenRelisting: available,
            kleinanzeigenQuota: available,
            kleinanzeigenCapabilities: { accounts: available, sync: available, publish: available },
          });
          return;
        }
        if (
          !available ||
          typeof data['type'] !== 'string' ||
          !data['type'].startsWith('FLIPBASE_KLEINANZEIGEN_') ||
          data['type'] === 'FLIPBASE_KLEINANZEIGEN_RESULT'
        )
          return;
        let result: unknown;
        if (data['type'] === 'FLIPBASE_KLEINANZEIGEN_STATUS')
          result =
            wrongBindingOnPublish && categoryReviewed
              ? { ...binding, externalAccountId: '89' }
              : binding;
        else if (data['type'] === 'FLIPBASE_KLEINANZEIGEN_RELIST_ATTEMPTS') result = [];
        else if (data['type'] === 'FLIPBASE_KLEINANZEIGEN_OPEN_LISTING') {
          send({
            type: 'FLIPBASE_KLEINANZEIGEN_RESULT',
            requestId: data['requestId'],
            success: !handoffError,
            result: { opened: true, handoffId: data['handoffId'] },
            error: 'Das Browserkonto hat sich geändert.',
          });
          return;
        } else if (data['type'] === 'FLIPBASE_KLEINANZEIGEN_RELIST_LISTING')
          result = {
            externalId: data['externalId'],
            outcome: 'outcome_unknown',
            errorCode: 'publication_unconfirmed',
          };
        else if (data['type'] === 'FLIPBASE_KLEINANZEIGEN_QUOTA')
          result = {
            workspaceId: binding.workspaceId,
            connectionId: binding.connectionId,
            externalAccountId: binding.externalAccountId,
            generation: binding.generation,
            expiresAt: binding.expiresAt,
            canPublish: true,
            quota: {
              used: quotaUnknown ? null : quotaUsed,
              observedAt: quotaUnknown ? null : new Date().toISOString(),
              reserved: 0,
              allowed: !quotaUnknown && quotaUsed < 100,
              reason: quotaUnknown ? 'quota_unknown' : quotaUsed < 100 ? null : 'quota_exhausted',
            },
          };
        else if (data['type'] === 'FLIPBASE_KLEINANZEIGEN_FORM_SCHEMA') {
          if (categoryUnavailable) {
            send({
              type: 'FLIPBASE_KLEINANZEIGEN_RESULT',
              requestId: data['requestId'],
              success: false,
              error: 'Diese Kategorie wird nicht angeboten.',
            });
            return;
          }
          const path = String(data['categoryPath']);
          const choices =
            path === ''
              ? [{ path: '153', label: 'Mode & Beauty', isParent: true }]
              : path === '153'
                ? [{ path: '153/160', label: 'Herrenbekleidung', isParent: true }]
                : path === '153/160'
                  ? [{ path: '153/160/shirts', label: 'Shirts', isParent: false }]
                  : [];
          const leaf = path === schema.categoryPath;
          if (leaf) categoryReviewed = true;
          result = {
            workspaceId: binding.workspaceId,
            connectionId: binding.connectionId,
            externalAccountId: binding.externalAccountId,
            generation: binding.generation,
            categoryPath: path,
            categoryLabel: leaf
              ? schema.categoryLabel
              : path === ''
                ? ''
                : path === '153'
                  ? 'Mode & Beauty'
                  : 'Mode & Beauty > Herrenbekleidung',
            choices,
            schema: leaf ? schema : null,
            schemaRevision: leaf ? 'c'.repeat(64) : null,
            observedAt: new Date().toISOString(),
          };
        } else if (data['type'] === 'FLIPBASE_KLEINANZEIGEN_PUBLISH_JOB')
          result = await (
            window as unknown as { __flipbaseTransferProvider: (mode: string) => Promise<unknown> }
          ).__flipbaseTransferProvider(String(data['mode']));
        else return;
        send({
          type: 'FLIPBASE_KLEINANZEIGEN_RESULT',
          requestId: data['requestId'],
          success: true,
          result,
        });
      });
    },
    {
      binding,
      schema,
      quotaUsed: options.quotaUsed ?? 99,
      available: options.extensionAvailable ?? true,
      wrongBindingOnPublish: options.wrongBindingOnPublish ?? false,
      quotaUnknown: options.quotaUnknown ?? false,
      handoffError: options.handoffError ?? false,
      categoryUnavailable: options.categoryUnavailable ?? false,
    },
  );
  await page.route('**/functions/v1/kleinanzeigen-account', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push(body);
    const action = body['action'];
    if (action === 'read_accounts')
      return route.fulfill({
        json: {
          workspaceId,
          canManage: true,
          accounts: [
            {
              ...binding,
              listingCount: 1,
              activeCount: 1,
              lastSyncedAt: new Date().toISOString(),
              quota: {
                used: options.quotaUsed ?? 99,
                observedAt: new Date().toISOString(),
                source: 'account_settings',
              },
              localGrant: { active: true, canPublish: true, generation, expiresAt },
              sync: null,
            },
            ...(options.secondTarget
              ? [
                  {
                    ...binding,
                    connectionId: '9007199254740994',
                    externalAccountId: '89',
                    displayName: 'Zweites Kleinanzeigen-Konto',
                    listingCount: null,
                    activeCount: null,
                    lastSyncedAt: null,
                    quota: null,
                    localGrant: { active: true, canPublish: true, generation, expiresAt },
                    sync: null,
                  },
                ]
              : []),
          ].map(
            ({ generation: ignored, expiresAt: ignored2, canPublish: ignored3, ...account }) =>
              account,
          ),
        },
      });
    if (action === 'read_publications') {
      const items =
        job?.externalId && job.providerState
          ? [
              {
                publicationId: '12',
                externalId: job.externalId,
                title: job.immutableSnapshot.content.title,
                url: 'https://www.kleinanzeigen.de/s-anzeige/jacke/' + job.externalId + '-1-2',
                state: job.providerState,
                available: true,
                publishedAt: null,
                observedAt: job.verifiedAt,
              },
            ]
          : options.relisting
            ? ['711', '712'].map((externalId, index) => ({
                publicationId: String(index + 1),
                externalId,
                title: `Kleinanzeigen Artikel ${index + 1}`,
                url: `https://www.kleinanzeigen.de/s-anzeige/artikel/${externalId}-1-2`,
                state: 'active',
                available: true,
                publishedAt: null,
                observedAt: new Date().toISOString(),
              }))
            : [];
      return route.fulfill({
        json: {
          workspaceId,
          connectionId,
          total: items.length,
          items,
          nextId: null,
          snapshotAt: new Date().toISOString(),
          completeness: 'complete',
        },
      });
    }
    if (action === 'prepare_transfer')
      return route.fulfill({
        json: {
          state: 'ready',
          workspaceId,
          targetConnectionId: body['targetConnectionId'],
          connectionId: accountIds[0],
          entryId: '25000000-0000-4000-8000-000000001000',
          externalId: '100',
          externalAccountId: '100',
          executionMode: 'cloud',
          source: {
            externalAccountId: '100',
            externalId: '100',
            title: options.longSource
              ? 'L'.repeat(100)
              : body['targetConnectionId'] === '9007199254740994'
                ? 'Jacke für zweites Konto'
                : 'Vinted-Jacke vollständig',
            description: options.missingSourceValues
              ? ''
              : options.longSource
                ? 'Langtext '.repeat(600)
                : 'Vollständige Beschreibung aus Vinted.',
            priceCents: options.missingSourceValues ? null : 0,
            currency: 'EUR',
            photoReferences: options.missingSourceValues
              ? []
              : ['https://images1.vinted.net/fixture.png'],
            attributeHints: { Zustand: 'Gut' },
          },
          observedAt: new Date().toISOString(),
          fingerprint: 'a'.repeat(64),
        },
      });
    if (action === 'save_transfer') {
      draft = {
        id: draftId,
        workspaceId,
        targetConnectionId: String(body['targetConnectionId']),
        sourceReference: body['source'] as KleinanzeigenTransferDraft['sourceReference'],
        revision: (draft?.revision ?? 3) + 1,
        status: 'prepared',
        content: body['content'] as unknown as KleinanzeigenDraftContent,
        imagesComplete: options.imagesComplete ?? true,
      };
      return route.fulfill({ json: draft });
    }
    if (action === 'listing_latest')
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(job) });
    if (action === 'listing_enqueue') {
      if (!draft) throw Error('Entwurf fehlt');
      const at = new Date().toISOString();
      job = {
        id: '12',
        workspaceId,
        connectionId,
        draftId,
        draftRevision: draft.revision,
        grantGeneration: generation,
        requestedBy: '25000000-0000-4000-8000-000000000001',
        immutableSnapshot: {
          workspaceId,
          connectionId,
          draftId,
          draftRevision: draft.revision,
          grantGeneration: generation,
          externalAccountId,
          content: draft.content,
          images: [
            {
              imageId,
              storagePath:
                'kleinanzeigen-jobs/' +
                workspaceId +
                '/' +
                String(body['requestId']) +
                '/25000000-0000-4000-8000-000000000062/' +
                imageId +
                '.jpg',
              fileName: 'Bild.jpg',
              mimeType: 'image/jpeg',
              byteSize: 4,
              sha256: 'b'.repeat(64),
            },
          ],
        },
        state: 'queued',
        version: 1,
        externalId: null,
        providerState: null,
        verifiedAt: null,
        errorCode: null,
        createdAt: at,
        updatedAt: at,
      };
      if (!parseKleinanzeigenJob(job, { workspaceId, connectionId }))
        throw Error('Ungültiger Testauftrag: ' + JSON.stringify(job));
      if (options.lostEnqueueReply && lostReply) {
        lostReply = false;
        return route.fulfill({ status: 503, json: { error: 'lost_enqueue_reply' } });
      }
      return route.fulfill({ json: job });
    }
    if (action === 'listing_status' || action === 'listing_reconcile')
      return route.fulfill({ json: job });
    return route.fulfill({ status: 400, json: { error: 'unexpected_transfer_fixture_action' } });
  });
  return {
    calls,
    bridgeRequests,
    savedSchemaRequests,
    sourceCalls,
    get job() {
      return job;
    },
    get providerCalls() {
      return providerCalls;
    },
  };
}
