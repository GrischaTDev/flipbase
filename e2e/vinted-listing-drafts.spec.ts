import { expect, test, type Locator, type Page } from '@playwright/test';
import axe from 'axe-core';
import { accountIds, mockMarketplace, workspaceId } from './support/marketplace-account-fixture';
import { emptyVintedListingContent } from '../src/app/features/marketplaces/models/vinted-listing-content';
import { listingCategoryFixture } from './support/vinted-listing-category-fixture';

/** Entwürfe werden nur auf ausdrücklichen Wunsch gespeichert. */
async function saveDraft(page: Page) {
  const editor = page.locator('app-vinted-listing-editor');
  await editor.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(editor.getByText('Entwurf gespeichert', { exact: true })).toBeVisible();
}

async function enableActionOverview(page: Page) {
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      json: {
        id: '25000000-0000-4000-8000-000000000001',
        email: 'marketplace@example.test',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: { flipbase_action_overview: true },
        created_at: '2026-09-26T00:00:00Z',
      },
    }),
  );
}

async function mockShoeCategories(page: Page) {
  await page.route('**/rest/v1/vinted_category_syncs*', (route) =>
    route.fulfill({
      json: {
        id: 1,
        refreshed_at: '2026-10-09T12:00:00Z',
        requested_at: null,
        last_attempt_at: null,
        category_count: 3,
        last_error: null,
      },
    }),
  );
  await page.route('**/rest/v1/vinted_categories*', (route) =>
    route.fulfill({
      json:
        Number(new URL(route.request().url()).searchParams.get('offset') ?? 0) > 0
          ? []
          : [
              { id: 1, parent_id: null, title: 'Damen', path: 'Damen' },
              { id: 2, parent_id: 1, title: 'Schuhe', path: 'Damen > Schuhe' },
              { id: 3, parent_id: 2, title: 'Sneaker', path: 'Damen > Schuhe > Sneaker' },
            ],
    }),
  );
}

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

for (const width of [390, 1440]) {
  test.describe(`Datenübernahme ${width}px`, () => {
    test.use({ hasTouch: width === 390 });
    for (const theme of ['light', 'dark'] as const) {
      test(`trennt Vinted-Entwürfe und übernimmt gewählte Daten bei ${width}px ${theme} @marketplace-preview`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        const browserErrors: string[] = [];
        page.on('pageerror', (error) => browserErrors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error' && /NG[0-9]{4}/.test(message.text()))
            browserErrors.push(message.text());
        });
        const state = await mockDrafts(page, true);
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        const source = {
          ...state.draft(),
          id: '2',
          content: {
            ...emptyVintedListingContent(),
            title: 'Quelljacke',
            description: 'Nur Text der Quelle',
            priceCents: 9900,
          },
        };
        state.setOverviewDrafts([state.draft(), source]);
        await page.route('**/rest/v1/rpc/marketplace_read_listing_draft', (route) =>
          route.request().postDataJSON().p_id === '2'
            ? route.fulfill({ json: source })
            : route.fallback(),
        );
        await page.route('**/rest/v1/marketplace_account_entries?**', (route) => {
          const query = new URL(route.request().url()).searchParams;
          if (query.get('body->>publicationState') !== 'eq.draft') return route.fallback();
          expect(query.get('workspace_id')).toBe(`eq.${workspaceId}`);
          expect(query.get('connection_id')).toBe(`eq.${accountIds[0]}`);
          return route.fulfill({
            headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
            ...(route.request().method() === 'HEAD'
              ? { body: '' }
              : {
                  json: [
                    {
                      id: '25000000-0000-4000-8000-000000000099',
                      external_id: '99',
                      sort_at: '2026-10-22T10:00:00Z',
                      body: {
                        title: 'Nativer Vinted-Schal',
                        publicationState: 'draft',
                        price: 20,
                        currency: 'EUR',
                      },
                    },
                  ],
                }),
          });
        });
        await page.goto('/marketplaces/vinted/listing-drafts');
        await expect(page.locator('html')).toHaveClass(
          theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/,
        );
        const native = page.getByRole('region', { name: 'Bei Vinted gespeicherte Entwürfe' });
        await expect(native.getByRole('heading', { name: 'Nativer Vinted-Schal' })).toBeVisible();
        await expect(native.locator('app-badge')).toHaveText('Vinted-Entwurf');
        await expect(native).not.toContainText('Alter unbekannt');
        await expect(native.getByRole('link')).toHaveAttribute(
          'href',
          `/marketplaces/vinted/listings/${accountIds[0]}/25000000-0000-4000-8000-000000000099`,
        );
        await page.goto(`/marketplaces/vinted/listing-drafts/${state.draft().id}`);
        const editor = page.locator('app-vinted-listing-editor');
        await editor.getByRole('textbox', { name: 'Titel', exact: true }).fill('Mein Titel');
        await editor
          .getByRole('textbox', { name: 'Beschreibung', exact: true })
          .fill('Meine Beschreibung');
        await editor.getByRole('textbox', { name: 'Verkaufspreis', exact: true }).fill('12,');
        const opener = editor.getByRole('button', { name: 'Daten übernehmen', exact: true });
        await opener.click();
        const dialog = page.getByRole('dialog', { name: 'Daten übernehmen', exact: true });
        await expect(dialog).toBeVisible();
        await dialog.getByRole('combobox', { name: 'Quelle auswählen' }).click();
        await dialog.getByRole('option', { name: 'Quelljacke', exact: true }).click();
        await expect(dialog.getByText('Nur Text der Quelle', { exact: true })).toBeVisible();
        await expect(
          dialog.getByRole('button', { name: 'Übertragen', exact: true }),
        ).toBeDisabled();
        await dialog.getByRole('checkbox', { name: 'Titel', exact: true }).click();
        await expect(dialog.getByRole('checkbox', { name: 'Titel', exact: true })).toBeChecked();
        await checkListingSurface(page, 'app-vinted-listing-copy-dialog');
        await page.screenshot({ path: test.info().outputPath('listing-copy-dialog.png') });
        await dialog.getByRole('button', { name: 'Übertragen', exact: true }).click();
        await expect(dialog).not.toBeVisible();
        await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
          'Quelljacke',
        );
        await expect(
          editor.getByRole('textbox', { name: 'Beschreibung', exact: true }),
        ).toHaveValue('Meine Beschreibung');
        await expect(
          editor.getByRole('textbox', { name: 'Verkaufspreis', exact: true }),
        ).toHaveValue('12,');
        expect(state.creates).toEqual([]);
        expect(state.draft().content.title).toBe('');
        await opener.click();
        await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
        await expect(opener).toBeFocused();
        await editor.getByRole('textbox', { name: 'Verkaufspreis', exact: true }).fill('12,50');
        await saveDraft(page);
        expect(state.draft().content).toMatchObject({
          title: 'Quelljacke',
          description: 'Meine Beschreibung',
          priceCents: 1250,
        });
        expect(state.creates).toEqual([]);
        await checkListingSurface(page, 'app-vinted-listing-editor');
        expect(browserErrors).toEqual([]);
      });
    }
  });
}

async function checkListingSurface(page: Page, selector: string) {
  await page.evaluate(axe.source);
  const violations = await page.evaluate(
    async (selector) =>
      (await (window as unknown as { axe: typeof axe }).axe.run(document.querySelector(selector)!))
        .violations,
    selector,
  );
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function mockDrafts(page: Page, planned = false, accountName?: string) {
  const pixel = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 200;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#b6d5e8';
      context.fillRect(0, 0, 160, 200);
      context.fillStyle = '#377ca7';
      context.fillRect(30, 25, 100, 150);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );
  await mockMarketplace(
    page,
    false,
    false,
    false,
    false,
    planned ? [] : undefined,
    undefined,
    false,
    planned ? 1 : 0,
    accountName
      ? {
          origin: process.env['PWA_TEST_BACKEND_ORIGIN'] ?? 'http://127.0.0.1:54351',
          userId: '25000000-0000-4000-8000-000000000001',
          displayName: accountName,
        }
      : undefined,
  );
  let draft = {
    id: '9007199254740999',
    workspaceId,
    connectionId: planned ? accountIds[0] : null,
    revision: 1,
    content: emptyVintedListingContent(),
    images: [] as {
      id: string;
      storagePath: string;
      fileName: string;
      mimeType: string;
      byteSize: number;
    }[],
    inventoryItemId: null,
    createdAt: '2026-10-09T12:00:00Z',
    updatedAt: '2026-10-09T12:00:00Z',
  };
  let created = planned,
    imageId = 0,
    uploads = 0,
    jobReads = 0;
  let overviewDrafts: (typeof draft)[] | null = null;
  let failNextDeletion = false;
  const draftLists: Record<string, unknown>[] = [];
  const draftDeletes: Record<string, unknown>[] = [];
  const signedImageBatches: string[][] = [];
  const jobs = [
    {
      id: '1',
      workspaceId,
      connectionId: planned ? accountIds[0] : null,
      draftId: draft.id,
      draftRevision: 1,
      executionMode: 'local',
      externalAccountId: '123',
      action: 'publish',
      state: 'queued',
      version: 1,
      scheduledAt: '2026-10-25T01:30:00Z',
      timeZone: 'Europe/Berlin',
      latePolicy: 'pause_after_30_minutes',
      errorCode: null,
      externalId: null as string | null,
      providerState: null as string | null,
      verifiedAt: null as string | null,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      replacesJobId: null as string | null,
    },
  ];
  jobs.push({
    ...jobs[0],
    id: '2',
    state: 'confirmed',
    externalId: '999',
    providerState: 'processing',
    verifiedAt: draft.updatedAt,
  });
  jobs.push({ ...jobs[0], id: '3', state: 'outcome_unknown' });
  const jobCancels: Record<string, unknown>[] = [];
  const reschedules: Record<string, unknown>[] = [];
  const reserved = new Map<string, (typeof draft.images)[number]>();
  const creates: Record<string, unknown>[] = [],
    templateSaves: Record<string, unknown>[] = [];
  let templates = [
    {
      id: '1',
      workspaceId,
      name: 'Meine Markenjacke',
      fields: { title: '{brand} Lieblingsjacke' },
      revision: 1,
      updatedAt: draft.updatedAt,
    },
  ];
  await page.route('**/rest/v1/vinted_category_syncs*', (route) =>
    route.fulfill({
      json: {
        id: 1,
        requested_at: null,
        last_attempt_at: null,
        refreshed_at: '2026-10-09T12:00:00Z',
        category_count: 2,
        last_error: null,
      },
    }),
  );
  await page.route('**/rest/v1/vinted_categories*', (route) =>
    route.fulfill({
      json:
        Number(new URL(route.request().url()).searchParams.get('offset') ?? 0) > 0
          ? []
          : [
              { id: 1, parent_id: null, title: 'Kleidung', path: 'Kleidung' },
              { id: 2, parent_id: 1, title: 'Jacken', path: 'Kleidung / Jacken' },
            ],
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_*listing*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (name === 'marketplace_read_listing_jobs') {
      jobReads++;
      return route.fulfill({ json: { items: created ? jobs : [] } });
    }
    if (name === 'marketplace_reschedule_listing') {
      reschedules.push(body);
      const previous = jobs.find((job) => job.id === body['p_job_id']);
      if (
        !previous ||
        previous.version !== body['p_expected_version'] ||
        !['queued', 'paused'].includes(previous.state)
      )
        return route.fulfill({ status: 409, json: { code: '40001' } });
      const next = {
        ...previous,
        id: '4',
        replacesJobId: previous.id,
        draftRevision: draft.revision,
        scheduledAt: String(body['p_scheduled_at']),
        timeZone: String(body['p_time_zone']),
        latePolicy: String(body['p_late_policy']),
      };
      Object.assign(previous, { state: 'cancelled', version: previous.version + 1 });
      jobs.unshift(next);
      return route.fulfill({ json: next });
    }
    if (name === 'marketplace_cancel_listing_job') {
      jobCancels.push(body);
      const job = jobs.find((job) => job.id === body['p_job_id']);
      if (!job || body['p_expected_version'] !== job.version || job.state !== 'queued')
        return route.fulfill({ status: 409, json: { code: '40001' } });
      Object.assign(job, { state: 'cancelled', version: job.version + 1 });
      return route.fulfill({ json: job });
    }
    if (name === 'marketplace_create_listing_draft') {
      creates.push(body);
      if (!created) {
        created = true;
        draft = { ...draft, content: body['p_content'] as typeof draft.content };
      }
    } else if (name === 'marketplace_save_listing_draft') {
      if (body['p_id'] !== draft.id || body['p_expected_revision'] !== draft.revision)
        return route.fulfill({ status: 409, json: { code: '40001' } });
      draft = {
        ...draft,
        content: body['p_content'] as typeof draft.content,
        revision: draft.revision + 1,
      };
    } else if (name === 'marketplace_reserve_listing_image') {
      const id = String(++imageId),
        storagePath = `${workspaceId}/${draft.id}/${id}.png`;
      reserved.set(id, {
        id,
        storagePath,
        fileName: String(body['p_file_name']),
        mimeType: String(body['p_mime_type']),
        byteSize: Number(body['p_byte_size']),
      });
      return route.fulfill({ json: { id, storagePath } });
    } else if (name === 'marketplace_commit_listing_image') {
      const image = reserved.get(String(body['p_image_id']));
      if (!image) return route.fulfill({ status: 400, json: { code: '22023' } });
      draft = { ...draft, images: [...draft.images, image], revision: draft.revision + 1 };
    } else if (name === 'marketplace_set_listing_image_order') {
      draft = {
        ...draft,
        images: (body['p_image_ids'] as string[]).map((id) => reserved.get(id)!),
        revision: draft.revision + 1,
      };
    } else if (name === 'marketplace_list_listing_templates')
      return route.fulfill({ json: templates });
    else if (name === 'marketplace_save_listing_template') {
      templateSaves.push(body);
      const template = {
        id: '2',
        workspaceId,
        name: String(body['p_name']),
        fields: body['p_fields'] as { title: string },
        revision: 1,
        updatedAt: draft.updatedAt,
      };
      templates = [...templates, template];
      return route.fulfill({ json: template });
    } else if (name === 'marketplace_list_listing_drafts') {
      draftLists.push(body);
      return route.fulfill({
        json: { items: overviewDrafts ?? (created ? [draft] : []), nextCursor: null },
      });
    } else if (name === 'marketplace_delete_listing_draft') {
      draftDeletes.push(body);
      const selected = (overviewDrafts ?? (created ? [draft] : [])).find(
        (entry) => entry.id === body['p_id'],
      );
      if (
        !selected ||
        body['p_workspace_id'] !== selected.workspaceId ||
        body['p_expected_revision'] !== selected.revision
      )
        return route.fulfill({ status: 409, json: { code: '40001' } });
      if (failNextDeletion) {
        failNextDeletion = false;
        return route.fulfill({ status: 409, json: { code: '55000' } });
      }
      if (overviewDrafts)
        overviewDrafts = overviewDrafts.filter((entry) => entry.id !== selected.id);
      else created = false;
      return route.fulfill({ json: null });
    }
    return route.fulfill({ json: draft });
  });
  await page.route('**/storage/v1/**', async (route) => {
    if (route.request().method() === 'POST' && route.request().url().includes('/object/sign/')) {
      const body = route.request().postDataJSON() as { paths: string[] };
      signedImageBatches.push(body.paths);
      return route.fulfill({
        json: body.paths.map((path) => ({
          path,
          signedURL: `/object/sign/marketplace-listing-media/${path}?token=fixture`,
          error: null,
        })),
      });
    }
    if (route.request().method() === 'POST') {
      uploads++;
      return route.fulfill({ json: { Key: 'marketplace-listing-media/fixture', Id: 'fixture' } });
    }
    return route.fulfill({ contentType: 'image/png', body: pixel });
  });
  await page.route('**/marketplace-browser/listings/category/read', (route) =>
    route.fulfill({
      json: { fields: listingCategoryFixture(Number(route.request().postDataJSON().categoryId)) },
    }),
  );
  return {
    creates,
    templateSaves,
    jobCancels,
    reschedules,
    draftLists,
    draftDeletes,
    signedImageBatches,
    setOverviewDrafts: (items: (typeof draft)[]) => {
      overviewDrafts = items;
    },
    failNextDelete: () => {
      failNextDeletion = true;
    },
    draft: () => draft,
    uploads: () => uploads,
    pixel,
    jobs,
    jobReads: () => jobReads,
  };
}

async function mockPublication(
  page: Page,
  enabled = true,
  loseFirstResponse = false,
  accountName?: string,
) {
  const state = await mockDrafts(page, true, accountName);
  const job = { ...state.jobs[0] };
  state.jobs.splice(0);
  Object.assign(state.draft(), {
    content: {
      ...emptyVintedListingContent(),
      title: 'Meine Jako-Jacke',
      description: 'Sehr gut erhalten.',
      priceCents: 2050,
      categoryId: 2,
      categoryLabel: 'Kleidung / Jacken',
      brandId: 254956,
      brandLabel: 'Jako',
      sizeId: 208,
      sizeLabel: 'M',
      conditionId: 2,
      conditionLabel: 'Sehr gut',
      colorIds: [1],
      colorLabels: ['Schwarz'],
      materialIds: [44],
      materialLabels: ['Baumwolle'],
      packageSizeId: 2,
    },
    images: [
      {
        id: '1',
        storagePath: `${workspaceId}/${state.draft().id}/1.png`,
        fileName: 'Jacke.png',
        mimeType: 'image/png',
        byteSize: state.pixel.byteLength,
      },
    ],
  });
  let allowed = false,
    authorizationVersion = 0;
  const approvals: Record<string, unknown>[] = [],
    enqueues: Record<string, unknown>[] = [],
    revocations: Record<string, unknown>[] = [];
  await page.route('**/marketplace-browser/healthz', (route) =>
    route.fulfill({
      json: { ok: true, readOnly: false, apiVersion: 2, listingPublishingEnabled: enabled },
    }),
  );
  await page.route('**/marketplace-browser/listings/category/read', (route) => {
    const fields = listingCategoryFixture(2);
    return route.fulfill({
      json: {
        fields: {
          ...fields,
          fields: [
            ...fields.fields,
            {
              field: 'brand',
              sizeGroupId: null,
              choices: [
                { id: 999, label: 'No Brand', disabled: false, selected: false, sizeGroupId: null },
              ],
            },
          ],
        },
      },
    });
  });
  await page.route('**/functions/v1/vinted-brand-search', (route) =>
    route.fulfill({ json: { brands: [{ id: 254956, name: 'Jako' }] } }),
  );
  await page.route(
    /\/rest\/v1\/rpc\/marketplace_(read_listing_permission|approve_listings|revoke_listings|enqueue_listing)$/,
    (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1);
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (name === 'marketplace_enqueue_listing') {
        enqueues.push(body);
        const queued = {
          ...job,
          id: '10',
          state: 'queued',
          executionMode: 'cloud',
          externalAccountId: '100',
          draftRevision: state.draft().revision,
          scheduledAt: body['p_scheduled_at'] ? String(body['p_scheduled_at']) : null,
          timeZone: body['p_time_zone'] ? String(body['p_time_zone']) : null,
          latePolicy: body['p_late_policy']
            ? String(body['p_late_policy'])
            : 'pause_after_30_minutes',
        };
        if (!state.jobs.length) state.jobs.unshift(queued as typeof job);
        if (loseFirstResponse && enqueues.length === 1) return route.abort('failed');
        return route.fulfill({ json: queued });
      }
      if (name === 'marketplace_approve_listings') {
        approvals.push(body);
        allowed = true;
        authorizationVersion++;
      }
      if (name === 'marketplace_revoke_listings') {
        revocations.push(body);
        allowed = false;
        authorizationVersion++;
      }
      return route.fulfill({ json: { allowed, authorizationVersion, executionMode: 'cloud' } });
    },
  );
  return { ...state, approvals, enqueues, revocations };
}

test('hält verspätete Markenvorschläge im kurzen Bildschirm sichtbar @marketplace-preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 460 });
  await mockDrafts(page);
  let release!: () => void;
  let requested = false;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/functions/v1/vinted-brand-search', async (route) => {
    requested = true;
    await response;
    await route.fulfill({
      json: {
        brands: Array.from({ length: 20 }, (_, index) => ({
          id: index + 1,
          name: `Marke ${index + 1}`,
        })),
      },
    });
  });
  await page.goto('/marketplaces/vinted/listings/new');
  const editor = page.locator('app-vinted-listing-editor');
  await editor.getByRole('combobox', { name: 'Marke', exact: true }).fill('Marke');
  await expect.poll(() => requested).toBe(true);
  const panel = editor.locator('app-vinted-listing-brand-dialog [popover]');
  await expect(panel).toBeVisible();
  release();
  await expect(page.getByRole('option', { name: 'Marke 20', exact: true })).toBeAttached();
  await expect
    .poll(async () => {
      const box = await panel.boundingBox();
      return box ? box.y + box.height : 9999;
    })
    .toBeLessThanOrEqual(452);
});

for (const missing of ['account', 'photos'] as const) {
  test(`fokussiert ${missing === 'account' ? 'das fehlende Zielkonto' : 'die fehlenden Fotos'} nach angeforderter Prüfung @marketplace-preview`, async ({
    page,
  }) => {
    const state = await mockPublication(page);
    if (missing === 'account') state.draft().connectionId = null;
    else state.draft().images = [];
    await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
    const editor = page.locator('app-vinted-listing-editor');
    await editor.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }).click();
    await expect(
      missing === 'account'
        ? editor.getByRole('combobox', { name: 'Zielkonto für diesen Entwurf', exact: true })
        : editor.getByRole('button', { name: 'Bilder hinzufügen', exact: true }),
    ).toBeFocused();
    if (missing === 'photos') {
      await expect(
        editor.getByRole('group', { name: 'Fotos', exact: true }),
      ).toHaveAccessibleDescription(/Foto/);
      await page.evaluate(axe.source);
      expect(
        await page.evaluate(
          async () =>
            (await (window as unknown as { axe: typeof axe }).axe.run('app-vinted-listing-editor'))
              .violations,
        ),
      ).toEqual([]);
    }
    expect(state.approvals).toEqual([]);
    expect(state.enqueues).toEqual([]);
  });
}

for (const width of [1440, 390])
  for (const dark of [false, true]) {
    test(`Veröffentlichung ohne zweite Prüfseite planen bei ${width}px ${dark ? 'dunkel' : 'hell'} @marketplace-preview`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const longAccountName = width === 390 ? 'MeinStore' + 'A'.repeat(100) : undefined;
      const state = await mockPublication(page, true, false, longAccountName);
      if (dark) await page.addInitScript(() => localStorage.setItem('flipbase_theme', 'dark'));
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
      const editor = page.locator('app-vinted-listing-editor');
      const aiPhoto = editor.getByRole('checkbox', {
        name: 'Meine Fotos wurden mit KI erstellt oder verändert',
      });
      await aiPhoto.click();
      await saveDraft(page);
      await page.reload();
      await expect(aiPhoto).toHaveAttribute('aria-checked', 'true');
      await expect(
        page.getByRole('navigation', { name: 'Schritte der Inseraterstellung' }),
      ).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Inserat prüfen' })).toHaveCount(0);
      await expect(editor.locator('app-vinted-listing-job-panel')).toHaveCount(0);
      await expect(editor.getByRole('button', { name: 'Jetzt veröffentlichen' })).toBeEnabled();

      await editor.getByRole('button', { name: 'Veröffentlichung planen' }).click();
      const planner = page.getByRole('dialog', { name: 'Veröffentlichung planen', exact: true });
      await planner.getByRole('button', { name: 'In einer Stunde', exact: true }).click();
      await page.evaluate(axe.source);
      expect(
        await page.evaluate(
          async () => (await (window as unknown as { axe: typeof axe }).axe.run()).violations,
        ),
      ).toEqual([]);
      await planner.getByRole('button', { name: 'Termin übernehmen', exact: true }).click();
      await expect(planner).not.toBeVisible();
      await expect.poll(() => state.enqueues.length).toBe(1);
      await expect(page.locator('[data-publication-result]')).toContainText('beauftragt');
      await expect(editor.locator('app-vinted-listing-publication-preview')).toHaveCount(0);
      await expect(editor.locator('app-vinted-listing-job-panel')).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`publication-${width}-${dark ? 'dark' : 'light'}.png`),
        fullPage: false,
      });
      expect(state.approvals).toEqual([
        {
          p_workspace_id: workspaceId,
          p_connection_id: accountIds[0],
          p_expected_external_account_id: '100',
        },
      ]);
      expect(state.enqueues[0]).toMatchObject({
        p_draft_id: state.draft().id,
        p_expected_revision: state.draft().revision,
        p_action: 'publish',
        p_ai_photo: true,
        p_time_zone: 'Europe/Berlin',
        p_late_policy: 'pause_after_30_minutes',
      });
      expect(Date.parse(String(state.enqueues[0]['p_scheduled_at']))).toBeGreaterThan(Date.now());
      expect(state.uploads()).toBe(0);
      expect(errors).toEqual([]);
    });
  }
test('Serverfreigabe und unvollständige Angaben verhindern neue Inserataufträge @marketplace-preview', async ({
  page,
}) => {
  const state = await mockPublication(page, false);
  Object.assign(state.draft(), { content: { ...state.draft().content, description: '' } });
  await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
  const editor = page.locator('app-vinted-listing-editor');
  await expect(
    editor.getByRole('textbox', { name: 'Beschreibung', exact: true }),
  ).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }).click();
  await expect(editor.getByRole('textbox', { name: 'Beschreibung', exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true })).toBeEnabled();
  await expect(editor.getByRole('textbox', { name: 'Beschreibung', exact: true })).toBeFocused();
  expect(state.approvals).toEqual([]);
  expect(state.enqueues).toEqual([]);
  await editor
    .getByRole('textbox', { name: 'Beschreibung', exact: true })
    .fill('Vollständige Beschreibung.');
  await page.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }).click();
  const feedback = page.locator('app-vinted-listing-publication-preview');
  await expect(feedback.getByText(/Veröffentlichung ist derzeit nicht verfügbar/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inserat prüfen' })).toHaveCount(0);
  await expect(feedback.getByRole('button', { name: 'Denselben Auftrag erneut prüfen' })).toHaveCount(0);
  expect(state.approvals).toEqual([]);
  expect(state.enqueues).toEqual([]);
});

test('Fotogrenze gilt bei der Auswahl, unvollständiger Entwurf bleibt speicherbar @marketplace-preview', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockDrafts(page);
  await page.goto('/marketplaces/vinted/listings/new');
  const editor = page.locator('app-vinted-listing-editor');
  await editor.locator('input[type=file]').setInputFiles(
    Array.from({ length: 21 }, (_, index) => ({
      name: `foto-${index + 1}.png`,
      mimeType: 'image/png',
      buffer: state.pixel,
    })),
  );
  await expect(editor.getByText(/20 von 20 Fotos/)).toBeVisible();
  await expect(
    editor.getByRole('alert').filter({ hasText: 'Du kannst höchstens 20 Bilder auswählen.' }),
  ).toBeVisible();
  await saveDraft(page);
  expect(state.draft().images).toHaveLength(20);
  expect(state.draft().content.title).toBe('');
  expect(state.draft().content.priceCents).toBeNull();
  await page.evaluate(axe.source);
  expect(
    await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector('app-vinted-listing-editor') as HTMLElement,
          )
        ).violations,
    ),
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('listing-editor-missing-fields-mobile.png'),
    fullPage: false,
  });
});

test('Gelesene Textgrenzen erscheinen vor der Veröffentlichung und kürzen vorhandenen Text nicht @marketplace-preview', async ({
  page,
}) => {
  const state = await mockPublication(page);
  state.draft().content.title = 'T'.repeat(101);
  await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
  const editor = page.locator('app-vinted-listing-editor');
  const title = editor.getByRole('textbox', { name: 'Titel', exact: true });
  await expect(title).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }).click();
  await expect(title).toHaveValue('T'.repeat(101));
  await expect(title).toHaveAttribute('maxlength', '100');
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await expect(
    editor.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }),
  ).toBeEnabled();
  await editor
    .getByRole('textbox', { name: 'Beschreibung', exact: true })
    .fill('Sehr gut erhalten. Ergänzung.');
  await saveDraft(page);
  expect(state.draft().content.title).toBe('T'.repeat(101));
  await page.reload();
  await expect(title).toHaveValue('T'.repeat(101));
  expect(state.enqueues).toEqual([]);
});

test('Größerer alter Entwurf behält alle Fotos und kann nicht versehentlich veröffentlicht werden @marketplace-preview', async ({
  page,
}) => {
  const state = await mockPublication(page);
  const original = state.draft().images[0];
  Object.assign(state.draft(), {
    images: Array.from({ length: 21 }, (_, index) => ({
      ...original,
      id: String(index + 1),
      fileName: `alt-${index + 1}.png`,
    })),
  });
  await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
  const editor = page.locator('app-vinted-listing-editor');
  await expect(editor.getByText(/21 von 20 Fotos/)).toBeVisible();
  await page.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }).click();
  await expect(
    editor.getByText('Vinted erlaubt höchstens 20 Fotos pro Inserat.', { exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }),
  ).toBeEnabled();
  expect(state.draft().images).toHaveLength(21);
  expect(state.enqueues).toEqual([]);
});
test('Sofortauftrag behält bei verlorener Antwort denselben Versuch @marketplace-preview', async ({
  page,
}) => {
  const state = await mockPublication(page, true, true);
  let releaseCategories!: () => void;
  const categoryGate = new Promise<void>((resolve) => (releaseCategories = resolve));
  await page.route('**/rest/v1/vinted_category_syncs*', async (route) => {
    await categoryGate;
    await route.fallback();
  });
  await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
  const opener = page.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true });
  await expect(page.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
    'Meine Jako-Jacke',
  );
  try {
    await expect(opener).toBeDisabled();
  } finally {
    releaseCategories();
  }
  await opener.click();
  const feedback = page.locator('app-vinted-listing-publication-preview');
  const retry = feedback.getByRole('button', {
    name: 'Denselben Auftrag erneut prüfen',
    exact: true,
  });
  await expect(retry).toBeEnabled();
  expect(state.enqueues).toHaveLength(1);
  await retry.click();
  await expect(feedback).not.toBeVisible();
  expect(state.enqueues).toHaveLength(2);
  expect(state.enqueues[1]).toEqual(state.enqueues[0]);
  expect(state.enqueues[0]).toMatchObject({ p_action: 'publish', p_ai_photo: false });
  expect(state.enqueues[0]['p_scheduled_at']).toBeUndefined();
  expect(state.approvals).toHaveLength(1);
  expect(state.jobs).toHaveLength(1);
  await expect(page.locator('[data-publication-result]')).toContainText('beauftragt');
  await expect(page.locator('app-vinted-listing-job-panel')).toHaveCount(0);
});

test('Inserataufträge erscheinen ausschließlich im zentralen Aktionsmenü @marketplace-preview', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await mockDrafts(page, true);
  await enableActionOverview(page);
  await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
  const editor = page.locator('app-vinted-listing-editor');
  await expect(editor.locator('app-vinted-listing-job-panel')).toHaveCount(0);
  const trigger = page.getByRole('button', { name: /^Laufende Aktionen \(/ });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const overview = page.getByRole('region', { name: 'Laufende Aktionen', exact: true });
  const listings = overview.locator('app-vinted-listing-action-overview');
  await expect(listings.getByText('Veröffentlichung beauftragt', { exact: true })).toBeVisible();
  Object.assign(state.jobs[0], { state: 'claimed', version: 2 });
  await overview.getByRole('button', { name: 'Aktionsübersicht aktualisieren' }).click();
  await expect(listings.getByText('Wird vorbereitet', { exact: true })).toBeVisible();
  Object.assign(state.jobs[0], {
    state: 'confirmed',
    version: 3,
    externalId: '46609',
    providerState: 'active',
    verifiedAt: '2026-10-10T00:00:00Z',
  });
  await overview.getByRole('button', { name: 'Aktionsübersicht aktualisieren' }).click();
  await expect(listings.getByText('Veröffentlicht', { exact: true })).toBeVisible();
  await expect(listings.getByRole('link', { name: /^Bei Vinted ansehen/ })).toHaveAttribute(
    'href',
    'https://www.vinted.de/items/46609',
  );
  await page.evaluate(axe.source);
  expect(
    await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector('app-vinted-listing-action-overview') as HTMLElement,
          )
        ).violations,
    ),
  ).toEqual([]);
  expect(state.jobCancels).toEqual([]);
  expect(state.reschedules).toEqual([]);
  expect(state.uploads()).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('listing-live-status.png'), fullPage: false });
});

for (const width of [1440, 390])
  for (const dark of [false, true]) {
    test(`Vinted-Artikelangaben auswählen bei ${width}px ${dark ? 'dunkel' : 'hell'} @marketplace-preview`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await mockDrafts(page, true);
      const requests: unknown[] = [];
      await page.route('**/marketplace-browser/listings/category/read', (route) => {
        requests.push(route.request().postDataJSON());
        return route.fulfill({
          json: { fields: listingCategoryFixture(2) },
        });
      });
      if (dark) await page.addInitScript(() => localStorage.setItem('flipbase_theme', 'dark'));
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
      const editor = page.locator('app-vinted-listing-editor');
      await editor.getByRole('textbox', { name: 'Titel', exact: true }).fill('Meine Jacke');
      await editor.getByRole('textbox', { name: 'Verkaufspreis', exact: true }).fill('20,50');
      await editor.getByRole('button', { name: /^Kategorie(?! entfernen)/ }).click();
      await page.getByRole('combobox', { name: 'Kategorie suchen', exact: true }).fill('Jacken');
      await page.getByRole('option', { name: /Jacken/ }).click();
      await saveDraft(page);
      await expect.poll(() => state.draft().content.categoryId).toBe(2);
      await expect(
        editor.getByRole('button', { name: 'Vinted-Angaben auswählen', exact: true }),
      ).toHaveCount(0);
      const size = editor.getByRole('combobox', { name: 'Größe', exact: true });
      await expect(size).toBeVisible();
      await size.click();
      await expect(page.getByRole('option', { name: 'L', exact: true })).toBeVisible();
      await page.getByRole('option', { name: 'M', exact: true }).click();
      await editor.getByRole('combobox', { name: 'Zustand', exact: true }).click();
      await page.getByRole('option', { name: 'Sehr gut', exact: true }).click();
      await editor.getByRole('combobox', { name: 'Paketgröße', exact: true }).click();
      await page.getByRole('option', { name: 'Mittel', exact: true }).click();
      const colors = editor.getByRole('combobox', { name: 'Farben', exact: true });
      await colors.click();
      await page.getByRole('option', { name: 'Blau', exact: true }).click();
      await page.getByRole('option', { name: 'Schwarz', exact: true }).click();
      await expect(page.getByRole('option', { name: 'Weiß', exact: true })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await page.keyboard.press('Escape');
      await editor.getByRole('combobox', { name: 'Materialien', exact: true }).click();
      await page.getByRole('option', { name: 'Baumwolle', exact: true }).click();
      await page.keyboard.press('Escape');
      await saveDraft(page);
      await expect.poll(() => state.draft().content.sizeId).toBe(5);
      expect(state.draft().content).toMatchObject({
        title: 'Meine Jacke',
        priceCents: 2050,
        conditionId: 3,
        colorIds: [9, 1],
        colorLabels: ['Blau', 'Schwarz'],
        materialIds: [1],
        packageSizeId: 2,
      });
      expect(requests).toEqual([]);
      await page.evaluate(axe.source);
      expect(
        await page.evaluate(
          async () => (await (window as unknown as { axe: typeof axe }).axe.run()).violations,
        ),
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`fields-${width}-${dark ? 'dark' : 'light'}.png`),
        fullPage: false,
      });
      await page.reload();
      await expect(size).toHaveValue('M');
      await expect(editor.getByRole('combobox', { name: 'Paketgröße', exact: true })).toContainText(
        'Mittel',
      );
      // Ein Ausfall von Vinted darf das eigene Formular nach Neuladen nicht beeinflussen.
      await page.route('**/marketplace-browser/listings/category/read', (route) => {
        requests.push(route.request().postDataJSON());
        return route.fulfill({ status: 503, json: { error: 'Vinted nicht erreichbar' } });
      });
      await page.reload();
      await expect(size).toHaveValue('M');
      await expect(editor.getByRole('button', { name: 'Erneut laden', exact: true })).toHaveCount(
        0,
      );
      expect(requests).toEqual([]);
      await expect(editor.getByRole('combobox', { name: 'Paketgröße', exact: true })).toContainText(
        'Mittel',
      );
      expect(state.uploads()).toBe(0);
      expect(state.reschedules).toEqual([]);
      expect(state.jobCancels).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

for (const width of [1440, 390])
  for (const dark of [false, true]) {
    test(`Vinted-Marke auswählen bei ${width}px ${dark ? 'dunkel' : 'hell'} @marketplace-preview`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await mockDrafts(page, true);
      const searches: unknown[] = [];
      await page.route('**/functions/v1/vinted-brand-search', (route) => {
        searches.push(route.request().postDataJSON());
        return route.fulfill({
          json: {
            brands: [
              { id: 317425, name: 'Jako-o' },
              { id: 254956, name: 'Jako' },
            ],
          },
        });
      });
      if (dark) await page.addInitScript(() => localStorage.setItem('flipbase_theme', 'dark'));
      await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
      const editor = page.locator('app-vinted-listing-editor');
      const brand = editor.getByRole('combobox', { name: 'Marke', exact: true });
      await brand.fill('Jako');
      await expect(page.getByRole('option', { name: 'Jako', exact: true })).toBeVisible();
      expect(searches).toEqual([{ keyword: 'Jako', workspaceId }]);
      await page.getByRole('option', { name: 'Jako', exact: true }).click();
      await page.keyboard.press('Escape');
      await saveDraft(page);
      await expect.poll(() => state.draft().content.brandId).toBe(254956);
      expect(state.draft().content.brandLabel).toBe('Jako');
      await page.reload();
      await expect(brand).toHaveValue('Jako');
      await brand.fill('Jako-o');
      await saveDraft(page);
      expect(state.draft().content.brandId).toBeNull();
      await brand.fill('');
      await page.getByRole('option', { name: 'Keine Marke', exact: true }).click();
      await page.keyboard.press('Escape');
      await saveDraft(page);
      expect(state.draft().content.brandLabel).toBe('Keine Marke');
      expect(state.draft().content.brandId).toBeNull();
      await page.evaluate(axe.source);
      expect(
        await page.evaluate(
          async () => (await (window as unknown as { axe: typeof axe }).axe.run()).violations,
        ),
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`brand-${width}-${dark ? 'dark' : 'light'}.png`),
        fullPage: false,
      });
      expect(state.uploads()).toBe(0);
      expect(state.reschedules).toEqual([]);
    });
  }

for (const width of [1440, 390])
  for (const dark of [false, true]) {
    test(`Planung zentral ändern bei ${width}px ${dark ? 'dunkel' : 'hell'} @marketplace-preview`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await mockDrafts(page, true);
      await enableActionOverview(page);
      await page.clock.setFixedTime(new Date('2026-10-09T12:00:00Z'));
      if (dark) await page.addInitScript(() => localStorage.setItem('flipbase_theme', 'dark'));
      await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
      const trigger = page.getByRole('button', { name: /^Laufende Aktionen \(/ });
      await trigger.click();
      const overview =
        width < 640
          ? page.getByRole('dialog', { name: 'Laufende Aktionen', exact: true })
          : page.getByRole('region', { name: 'Laufende Aktionen', exact: true });
      const listings = overview.locator('app-vinted-listing-action-overview');
      const opener = listings.getByRole('button', { name: 'Termin ändern', exact: true });
      await expect(opener).toBeEnabled();
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Veröffentlichung planen', exact: true });
      await expect(dialog.getByRole('textbox', { name: 'Uhrzeit' })).toHaveValue('02:30');
      await expect(
        dialog.getByRole('combobox', { name: 'Vorkommen bei der Zeitumstellung' }),
      ).toContainText('Späteres');
      await dialog.getByRole('combobox', { name: 'Vorkommen bei der Zeitumstellung' }).click();
      await page.getByRole('option', { name: /Früheres/ }).click();
      await dialog.getByRole('combobox', { name: 'Regel für einen verpassten Termin' }).click();
      await page.getByRole('option', {
        name: 'Veröffentlichen, sobald die Ausführung verfügbar ist',
        exact: true,
      }).click();
      await page.evaluate(axe.source);
      expect(
        await page.evaluate(
          async () =>
            (
              await (window as unknown as { axe: typeof axe }).axe.run(
                document.querySelector('app-vinted-listing-schedule-dialog') as HTMLElement,
              )
            ).violations,
        ),
      ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`schedule-${width}-${dark ? 'dark' : 'light'}.png`),
        fullPage: false,
      });
      await dialog.getByRole('button', { name: 'Termin übernehmen', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect.poll(() => state.reschedules.length).toBe(1);
      expect(state.reschedules[0]).toMatchObject({
        p_job_id: '1',
        p_expected_version: 1,
        p_expected_revision: 1,
        p_scheduled_at: '2026-10-25T00:30:00.000Z',
        p_time_zone: 'Europe/Berlin',
        p_late_policy: 'publish_when_available',
      });
      expect(Object.keys(state.reschedules[0])).not.toContain('p_ai_photo');
      await expect(listings.getByText('Veröffentlichung beauftragt', { exact: true }).first()).toBeVisible();
      expect(state.jobCancels).toEqual([]);
    });
  }

for (const width of [1440, 390])
  for (const dark of [false, true]) {
    test(`Entwurf mit Fotos und Vorlagen bei ${width}px ${dark ? 'dunkel' : 'hell'} @marketplace-preview @core-smoke`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await mockDrafts(page);
      if (dark) await page.addInitScript(() => localStorage.setItem('flipbase_theme', 'dark'));
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/marketplaces/vinted/listings/new');
      const editor = page.locator('app-vinted-listing-editor');
      await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toBeVisible();
      expect(state.creates).toHaveLength(0);
      await editor.getByRole('textbox', { name: 'Titel', exact: true }).fill('Meine Jacke');
      await editor
        .getByRole('textbox', { name: 'Beschreibung', exact: true })
        .fill('Guter Zustand.\nOhne Flecken.');
      await editor.getByRole('textbox', { name: 'Verkaufspreis', exact: true }).fill('45,50');
      await editor.getByRole('combobox', { name: 'Marke', exact: true }).fill('Testmarke');
      // Ohne ausdrückliches Speichern entsteht kein Entwurf, auch nicht nach einer Pause.
      await page.waitForTimeout(1200);
      expect(state.creates).toHaveLength(0);
      await saveDraft(page);
      // Nach dem Speichern bleibt „Inserat erstellen“ geöffnet.
      await expect(page).toHaveURL(/listings\/new$/);
      await expect(page.getByRole('heading', { name: 'Inserat erstellen' })).toBeVisible();
      await expect.poll(() => state.draft().content.priceCents).toBe(4550);
      expect(state.creates).toHaveLength(1);
      expect(state.creates[0]['p_connection_id']).toBeNull();
      await editor.getByRole('button', { name: /^Kategorie(?! entfernen)/ }).click();
      await expect(page.getByRole('option', { name: /Kleidung/ })).toBeVisible();
      expect(
        (await page.getByRole('dialog', { name: 'Kategorie', exact: true }).boundingBox())!.height,
      ).toBeLessThan(220);
      await page.getByRole('combobox', { name: 'Kategorie suchen', exact: true }).fill('Jacken');
      await page.getByRole('option', { name: /Jacken/ }).click();
      await saveDraft(page);
      await expect.poll(() => state.draft().content.categoryId).toBe(2);
      expect(state.draft().content.categoryLabel).toBe('Kleidung > Jacken');
      await editor.locator('input[type=file]').setInputFiles([
        { name: 'blue.png', mimeType: 'image/png', buffer: state.pixel },
        { name: 'second.png', mimeType: 'image/png', buffer: state.pixel },
      ]);
      const image = editor.getByRole('button', {
        name: 'Hauptbild: blue.png, Details öffnen',
        exact: true,
      });
      await image.click();
      const details = page.getByRole('dialog', { name: 'Bilddetails', exact: true });
      await details.getByRole('button', { name: 'Zuschneiden', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Bild für Vinted zuschneiden', exact: true });
      await expect(
        dialog.getByRole('button', { name: 'Bild übernehmen', exact: true }),
      ).toBeEnabled();
      const frame = dialog.locator('.ngx-ic-cropper');
      const rect = await frame.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.width / rect!.height).toBeCloseTo(2 / 3, 1);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await saveDraft(page);
      await expect.poll(() => state.draft().images.length).toBe(2);
      await expect(editor.getByText('Entwurf gespeichert', { exact: true })).toBeVisible();
      await image.click();
      await details.getByRole('combobox', { name: 'Position in der Galerie', exact: true }).click();
      await page.getByRole('option', { name: '2', exact: true }).click();
      await details.getByRole('button', { name: 'Übernehmen', exact: true }).click();
      await saveDraft(page);
      await expect.poll(() => state.draft().images[0]?.fileName).toBe('second.png');
      expect(state.uploads()).toBe(2);
      await editor.getByRole('combobox', { name: 'Inseratvorlage auswählen' }).click();
      await page.getByRole('option', { name: 'Meine Markenjacke', exact: true }).click();
      await expect(
        editor.getByText('Neu: Testmarke Lieblingsjacke', { exact: true }),
      ).toBeVisible();
      await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
        'Meine Jacke',
      );
      await editor.getByRole('button', { name: 'Vorlage übernehmen', exact: true }).click();
      await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
        'Testmarke Lieblingsjacke',
      );
      await expect(editor.getByRole('textbox', { name: 'Verkaufspreis', exact: true })).toHaveValue(
        '45,50',
      );
      await expect(editor.getByRole('button', { name: /^Kategorie(?! entfernen)/ })).toContainText(
        'Jacken',
      );
      await editor
        .getByRole('textbox', { name: 'Neue Vorlage', exact: true })
        .fill('Jacken ohne Preis');
      await editor.getByRole('button', { name: 'Als Vorlage speichern', exact: true }).click();
      await expect.poll(() => state.templateSaves.length).toBe(1);
      expect(Object.keys(state.templateSaves[0]['p_fields'] as object).sort()).toEqual([
        'description',
        'title',
      ]);
      expect(state.templateSaves[0]['p_id']).toBeNull();
      expect(state.templateSaves[0]['p_expected_revision']).toBeNull();
      await saveDraft(page);
      await expect.poll(() => state.draft().content.title).toBe('Testmarke Lieblingsjacke');
      expect(state.creates).toHaveLength(1);
      await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
      await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
        'Testmarke Lieblingsjacke',
      );
      await expect(editor.getByRole('textbox', { name: 'Verkaufspreis', exact: true })).toHaveValue(
        '45,50',
      );
      await expect(
        editor.getByRole('button', { name: 'Hauptbild: second.png, Details öffnen', exact: true }),
      ).toBeVisible();
      await expect(editor.locator('app-vinted-listing-job-panel')).toHaveCount(0);
      expect(state.jobCancels).toEqual([]);
      await page.evaluate(axe.source);
      expect(
        await page.evaluate(
          async () =>
            (
              await (window as unknown as { axe: typeof axe }).axe.run(
                document.querySelector('app-vinted-listing-editor') as HTMLElement,
              )
            ).violations,
        ),
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`draft-${width}-${dark ? 'dark' : 'light'}.png`),
        fullPage: true,
      });
      await editor.getByRole('button', { name: 'Zur Entwurfsübersicht', exact: true }).click();
      const list = page.locator('app-vinted-listing-drafts');
      await expect(list.getByText('Testmarke Lieblingsjacke', { exact: true })).toBeVisible();
      await list
        .getByRole('link', { name: 'Testmarke Lieblingsjacke bearbeiten', exact: true })
        .click();
      await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
        'Testmarke Lieblingsjacke',
      );
      expect(errors).toEqual([]);
    });
  }

for (const width of [1440, 390]) {
  test.describe(`Entwurfsübersicht bei ${width}px`, () => {
    test.use({ hasTouch: width === 390 });

    for (const dark of [false, true]) {
      test(`zeigt und löscht Entwürfe in Raster und Liste ${dark ? 'dunkel' : 'hell'} @marketplace-preview`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        const state = await mockDrafts(page, true);
        if (dark) await page.addInitScript(() => localStorage.setItem('flipbase_theme', 'dark'));
        const newestTitle =
          'Neue Lieblingsjacke mit besonders langem Titel für die Entwurfsübersicht';
        const newest = {
          ...state.draft(),
          id: '9007199254741003',
          revision: 3,
          content: {
            ...emptyVintedListingContent(),
            title: newestTitle,
            priceCents: 2550,
            brandLabel: 'BesondersLangeMarkeOhneLeerzeichen',
            sizeLabel: 'M',
            conditionLabel: 'Sehr gut',
          },
          createdAt: '2026-10-20T12:00:00Z',
          updatedAt: '2026-10-20T12:00:00Z',
        };
        newest.images = ['main', 'detail'].map((name, index) => ({
          id: index === 0 ? '9' : '1',
          storagePath: `${workspaceId}/${newest.id}/${name}.png`,
          fileName: `${name}.png`,
          mimeType: 'image/png',
          byteSize: state.pixel.length,
        }));
        const older = {
          ...state.draft(),
          id: '9007199254741001',
          revision: 7,
          connectionId: null,
          content: { ...emptyVintedListingContent(), title: 'Älterer Pullover' },
          createdAt: '2026-10-18T10:00:00Z',
          updatedAt: '2026-10-22T13:00:00Z',
        };
        const unnamed = {
          ...state.draft(),
          connectionId: null,
          images: [
            {
              id: '2',
              storagePath: `${workspaceId}/${state.draft().id}/unnamed.png`,
              fileName: 'unnamed.png',
              mimeType: 'image/png',
              byteSize: state.pixel.length,
            },
          ],
          createdAt: '2026-10-15T08:00:00Z',
          updatedAt: '2026-10-21T13:00:00Z',
        };
        // Der Server liefert Erstelldaten absteigend; spätere Änderungen dürfen diese Folge nicht ersetzen.
        const drafts = [newest, older, unnamed];
        state.setOverviewDrafts(drafts);
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto('/marketplaces/vinted/listing-drafts');
        const overview = page.locator('app-vinted-listing-drafts');
        const cards = overview.locator('app-card');
        const links = overview.getByRole('link', { name: / bearbeiten$/ });
        const views = overview.getByRole('group', { name: 'Entwurfsansicht', exact: true });
        const gridView = views.getByRole('button', { name: 'Rasteransicht', exact: true });
        const listView = views.getByRole('button', { name: 'Listenansicht', exact: true });
        const deleteNewest = overview.getByRole('button', {
          name: `${newestTitle} löschen`,
          exact: true,
        });
        const deleteOlder = overview.getByRole('button', {
          name: 'Älterer Pullover löschen',
          exact: true,
        });
        const activate = (button: Locator) => (width === 390 ? button.tap() : button.click());

        const checkRows = async () => {
          await expect(cards).toHaveCount(3);
          await expect(links).toHaveCount(3);
          const overviewBounds = (await overview.boundingBox())!;
          const firstCardBounds = (await cards.first().boundingBox())!;
          expect(Math.abs(firstCardBounds.x - overviewBounds.x)).toBeLessThanOrEqual(1);
          if ((await listView.getAttribute('aria-pressed')) === 'true') {
            expect(Math.abs(firstCardBounds.width - overviewBounds.width)).toBeLessThanOrEqual(1);
          }
          for (const [index, draft] of drafts.entries()) {
            const title = draft.content.title || 'Unbenannter Entwurf';
            await expect(links.nth(index)).toHaveAttribute('aria-label', `${title} bearbeiten`);
            await expect(links.nth(index)).toHaveAttribute(
              'href',
              `/marketplaces/vinted/listing-drafts/${draft.id}`,
            );
            await expect(cards.nth(index).getByText('Entwurf', { exact: true })).toBeVisible();
            await expect(cards.nth(index).locator('time')).toHaveAttribute(
              'datetime',
              draft.createdAt,
            );
            await expect(cards.nth(index).locator('time')).toContainText(
              draft.createdAt.slice(0, 10).split('-').reverse().join('.'),
            );
          }
          await expect(cards.first()).toContainText('25,50');
          await expect(
            cards.first().getByText(/BesondersLangeMarkeOhneLeerzeichen.*\bM\b/s),
          ).toBeVisible();
          await expect(cards.first()).toContainText('Testkonto A');
          await expect(cards.nth(1)).toContainText('Noch offen');
          await expect(cards.nth(1)).toContainText('Noch kein Konto');
          await expect(cards.nth(1).locator('[data-product-placeholder]')).toBeVisible();
          await expect(links.locator('button, a, [role="button"]')).toHaveCount(0);
          await expect(overview.getByRole('button', { name: / löschen$/ })).toHaveCount(3);
          expect(await deleteNewest.evaluate((button) => button.closest('a'))).toBeNull();
        };
        const checkAccessibility = async () => {
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          ).toBe(true);
          expect(
            await page.evaluate(async () => {
              const result = await (window as unknown as { axe: typeof axe }).axe.run(
                document.querySelector('app-vinted-listing-drafts') as HTMLElement,
              );
              return result.violations;
            }),
          ).toEqual([]);
        };

        await expect(gridView).toHaveAttribute('aria-pressed', 'true');
        await expect(listView).toHaveAttribute('aria-pressed', 'false');
        await checkRows();
        const mainImage = cards.first().locator('app-product-thumbnail img');
        await expect(mainImage).toHaveAttribute(
          'src',
          new RegExp(`${newest.id}/main\\.png\\?token=fixture$`),
        );
        await expect
          .poll(() => mainImage.evaluate((image) => (image as HTMLImageElement).naturalWidth > 0))
          .toBe(true);
        expect(state.signedImageBatches).toEqual([
          [newest.images[0].storagePath, unnamed.images[0].storagePath],
        ]);
        expect(state.draftLists).toEqual([{ p_workspace_id: workspaceId, p_query: '' }]);
        const gridBounds = (await cards.first().boundingBox())!;
        const gridImageWidth = (await cards.first().locator('app-product-thumbnail').boundingBox())!
          .width;
        if (width === 390) {
          expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
          for (const button of [gridView, listView, deleteNewest]) {
            const bounds = (await button.boundingBox())!;
            expect(bounds.width).toBeGreaterThanOrEqual(44);
            expect(bounds.height).toBeGreaterThanOrEqual(44);
          }
        }
        await page.evaluate(axe.source);
        await checkAccessibility();
        await page.screenshot({
          path: testInfo.outputPath(`draft-overview-grid-${width}-${dark ? 'dark' : 'light'}.png`),
          fullPage: true,
        });

        await activate(listView);
        await expect(listView).toHaveAttribute('aria-pressed', 'true');
        await expect(gridView).toHaveAttribute('aria-pressed', 'false');
        await checkRows();
        expect(
          (await cards.first().locator('app-product-thumbnail').boundingBox())!.width,
        ).toBeLessThan(gridImageWidth);
        expect((await cards.first().boundingBox())!.height).toBeLessThan(gridBounds.height);
        expect((await cards.first().boundingBox())!.width).toBeGreaterThan(width / 2);
        await expect(mainImage).toHaveAttribute(
          'src',
          new RegExp(`${newest.id}/main\\.png\\?token=fixture$`),
        );
        await checkAccessibility();
        await page.screenshot({
          path: testInfo.outputPath(`draft-overview-list-${width}-${dark ? 'dark' : 'light'}.png`),
          fullPage: true,
        });

        await gridView.focus();
        await page.keyboard.press('Enter');
        await expect(gridView).toHaveAttribute('aria-pressed', 'true');
        await listView.focus();
        await page.keyboard.press('Space');
        await expect(listView).toHaveAttribute('aria-pressed', 'true');
        expect(state.signedImageBatches).toHaveLength(1);

        await activate(deleteNewest);
        const dialog = page.getByRole('dialog', { name: 'Entwurf löschen?', exact: true });
        await expect(dialog).toContainText(newestTitle);
        expect(state.draftDeletes).toHaveLength(0);
        await activate(dialog.getByRole('button', { name: 'Abbrechen', exact: true }));
        await expect(dialog).not.toBeVisible();
        await expect(deleteNewest).toBeFocused();
        expect(state.draftDeletes).toHaveLength(0);
        await checkRows();

        state.failNextDelete();
        await activate(deleteOlder);
        await activate(dialog.getByRole('button', { name: 'Löschen', exact: true }));
        await expect(dialog).not.toBeVisible();
        await expect(overview.getByRole('alert')).toContainText(
          'Dieser Entwurf hat noch eine geplante, laufende oder ungeklärte Veröffentlichung.',
        );
        await expect(deleteOlder).toBeEnabled();
        await checkRows();
        expect(state.draftDeletes).toEqual([
          { p_workspace_id: workspaceId, p_id: older.id, p_expected_revision: older.revision },
        ]);

        await activate(deleteNewest);
        await activate(dialog.getByRole('button', { name: 'Löschen', exact: true }));
        await expect(dialog).not.toBeVisible();
        await expect(overview.getByText('Entwurf gelöscht.', { exact: true })).toBeVisible();
        await expect(links).toHaveCount(2);
        await expect(links.first()).toHaveAttribute('aria-label', 'Älterer Pullover bearbeiten');
        await expect(links.last()).toHaveAttribute('aria-label', 'Unbenannter Entwurf bearbeiten');
        await expect(links.first()).toBeFocused();
        await expect(deleteNewest).toHaveCount(0);
        expect(state.draftDeletes).toEqual([
          { p_workspace_id: workspaceId, p_id: older.id, p_expected_revision: older.revision },
          { p_workspace_id: workspaceId, p_id: newest.id, p_expected_revision: newest.revision },
        ]);
        await expect(page).toHaveURL(/\/marketplaces\/vinted\/listing-drafts$/);
        await page.reload();
        await expect(links).toHaveCount(2);
        await expect(deleteNewest).toHaveCount(0);
        const section = overview.getByRole('region', { name: 'Flipbase-Entwürfe', exact: true });
        const search = section.getByRole('searchbox', { name: 'Entwürfe nach Titel durchsuchen' });
        let finishFailure!: () => void;
        const pendingFailure = new Promise<void>((resolve) => (finishFailure = resolve));
        let failNextRead = true;
        await page.route('**/rest/v1/rpc/marketplace_list_listing_drafts', async (route) => {
          const query = (route.request().postDataJSON() as { p_query?: unknown }).p_query;
          if (query === 'Fehlerprüfung' && failNextRead) {
            await pendingFailure;
            failNextRead = false;
            return route.fulfill({ status: 400, json: { code: 'XX000' } });
          }
          if (query === 'Kein Treffer' || query === 'Fehlerprüfung') {
            return route.fulfill({ json: { items: [], nextCursor: null } });
          }
          if (query === 'Pullover') {
            return route.fulfill({ json: { items: [older], nextCursor: null } });
          }
          return route.fallback();
        });
        await search.fill('Kein Treffer');
        await expect(
          section.getByText('Noch keine passenden Entwürfe', { exact: true }),
        ).toBeVisible();
        await expect(
          section.getByRole('link', { name: 'Inserat erstellen', exact: true }),
        ).toBeVisible();
        await expect(links).toHaveCount(0);
        await search.fill('Pullover');
        await expect(links).toHaveCount(1);
        await expect(links.first()).toHaveAttribute('aria-label', 'Älterer Pullover bearbeiten');
        await search.fill('Fehlerprüfung');
        await expect(section.getByRole('status')).toHaveText('Entwürfe werden geladen …');
        finishFailure();
        await expect(section.getByRole('alert')).toBeVisible();
        await activate(section.getByRole('button', { name: 'Erneut versuchen', exact: true }));
        await expect(section.getByRole('alert')).toHaveCount(0);
        await expect(
          section.getByText('Noch keine passenden Entwürfe', { exact: true }),
        ).toBeVisible();
        await search.fill('');
        await expect(links).toHaveCount(2);
        await page.evaluate(axe.source);
        await checkAccessibility();
        expect(errors).toEqual([]);
      });
    }
  });
}

for (const width of [1440, 390]) {
  test.describe(`Eigenes Schuhformular ${width}px`, () => {
    test.use({ hasTouch: width === 390 });
    for (const theme of ['light', 'dark'] as const) {
      test(`erstellt Damenschuhe trotz ausgefallenem Vinted-Formularabruf ${width}px ${theme} @marketplace-preview`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        const state = await mockPublication(page);
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        state.draft().content = {
          ...state.draft().content,
          title: 'Nike Sneaker',
          categoryId: 3,
          categoryLabel: 'Damen > Schuhe > Sneaker',
          brandId: null,
          brandLabel: 'Nike',
          sizeId: null,
          sizeLabel: '',
          packageSizeId: null,
        };
        await mockShoeCategories(page);
        await page.route('**/functions/v1/vinted-brand-search', (route) =>
          route.fulfill({ json: { brands: [{ id: 53, name: 'Nike' }] } }),
        );
        const categoryRequests: unknown[] = [];
        await page.route('**/marketplace-browser/listings/category/read', (route) => {
          categoryRequests.push(route.request().postDataJSON());
          return route.fulfill({
            status: 503,
            json: { error: 'Vinted-Auswahl konnte nicht geladen werden' },
          });
        });
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
        await expect(page.locator('html')).toHaveClass(
          theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/,
        );
        const editor = page.locator('app-vinted-listing-editor');
        const size = editor.getByRole('combobox', { name: 'Größe', exact: true });
        await size.click();
        await expect(page.getByRole('option', { name: 'M', exact: true })).toHaveCount(0);
        await page.getByRole('option', { name: '38', exact: true }).click();
        await expect(editor.getByRole('combobox', { name: 'Zustand', exact: true })).toBeVisible();
        await expect(editor.getByRole('combobox', { name: 'Farben', exact: true })).toBeVisible();
        await expect(
          editor.getByRole('combobox', { name: 'Materialien', exact: true }),
        ).toBeVisible();
        await expect(
          editor.getByRole('combobox', { name: 'Paketgröße', exact: true }),
        ).toBeVisible();
        await saveDraft(page);
        expect(state.draft().content.sizeLabel).toBe('38');
        expect(state.draft().content.brandId).toBeNull();
        expect(state.draft().content.brandLabel).toBe('Nike');
        expect(state.draft().content.attributes['flipbaseListingForm']).toBe('1');
        await page.reload();
        await expect(size).toHaveValue('38');
        await page.screenshot({
          path: testInfo.outputPath(`shoes-editor-${width}-${theme}.png`),
          fullPage: true,
        });
        await editor
          .locator('app-card')
          .filter({ has: page.locator('#vinted-choice-size') })
          .screenshot({ path: testInfo.outputPath(`shoes-details-${width}-${theme}.png`) });
        await editor.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }).click();
        const parcel = editor.getByRole('combobox', { name: 'Paketgröße', exact: true });
        await expect(editor.getByText('Ergänze bitte: Paketgröße.', { exact: true })).toBeVisible();
        await parcel.click();
        await page.getByRole('option', { name: 'Mittel', exact: true }).click();
        await expect(parcel).toContainText('Mittel');
        await expect(editor.getByText('Ergänze bitte: Paketgröße.', { exact: true })).toHaveCount(
          0,
        );
        await expect(
          editor.getByText('Wähle erneut bei Vinted: Marke.', { exact: true }),
        ).toBeVisible();
        const brand = editor.getByRole('combobox', { name: 'Marke', exact: true });
        await brand.fill('Nike');
        await page.getByRole('option', { name: 'Nike', exact: true }).click();
        await editor.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }).click();
        expect(state.draft().content.packageSizeId).toBe(2);
        expect(state.draft().content.brandId).toBe(53);
        await expect.poll(() => state.enqueues.length).toBe(1);
        await expect(page.locator('[data-publication-result]')).toContainText('beauftragt');
        await checkListingSurface(page, 'app-vinted-listing-editor');
        await page.screenshot({
          path: testInfo.outputPath(`shoes-direct-${width}-${theme}.png`),
          fullPage: true,
        });
        expect(categoryRequests).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  });
}

test('fordert bei gespeicherten Damenschuhen als Oberkategorie eine konkrete Schuhart @marketplace-preview', async ({
  page,
}) => {
  const state = await mockPublication(page);
  await mockShoeCategories(page);
  let categoryUnavailable = true;
  await page.route('**/rest/v1/vinted_category_syncs*', (route) =>
    categoryUnavailable
      ? route.fulfill({ status: 503, json: { message: 'Kategorien nicht erreichbar' } })
      : route.fallback(),
  );
  state.draft().content = {
    ...state.draft().content,
    categoryId: 2,
    categoryLabel: 'Damen > Schuhe',
    sizeId: null,
    sizeLabel: '',
  };
  await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
  const editor = page.locator('app-vinted-listing-editor');
  const retry = editor.getByRole('button', { name: 'Kategorien erneut laden', exact: true });
  await expect(retry).toBeVisible();
  await editor.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }).click();
  await expect(
    page.locator('app-vinted-listing-publication-preview'),
  ).toHaveCount(0);
  categoryUnavailable = false;
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
    'Meine Jako-Jacke',
  );
  await editor.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }).click();
  await expect(
    editor.getByText('Wähle unter „Schuhe“ eine passende Unterkategorie aus.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('app-vinted-listing-publication-preview'),
  ).toHaveCount(0);
  await editor.getByRole('button', { name: /^Kategorie(?! entfernen)/ }).click();
  await page.getByRole('combobox', { name: 'Kategorie suchen', exact: true }).fill('Schuhe');
  await expect(page.getByRole('option', { name: 'Schuhe', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: /Sneaker/ }).click();
  await expect(
    editor.getByText('Wähle unter „Schuhe“ eine passende Unterkategorie aus.', { exact: true }),
  ).toHaveCount(0);
  const size = editor.getByRole('combobox', { name: 'Größe', exact: true });
  await size.click();
  await page.getByRole('option', { name: '44,5', exact: true }).click();
  await expect(size).toHaveValue('44,5');
  expect(state.enqueues).toEqual([]);
  expect(state.draft().content.categoryId).toBe(2);
});
