import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { accountIds, mockMarketplace, workspaceId } from './support/marketplace-account-fixture';
import { emptyVintedListingContent } from '../src/app/features/marketplaces/models/vinted-listing-content';
import { listingCategoryFixture } from './support/vinted-listing-category-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
async function mockDrafts(page: Page, planned = false) {
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
    } else if (name === 'marketplace_list_listing_drafts')
      return route.fulfill({ json: { items: created ? [draft] : [], nextCursor: null } });
    return route.fulfill({ json: draft });
  });
  await page.route('**/storage/v1/**', async (route) => {
    if (route.request().method() === 'POST' && route.request().url().includes('/object/sign/')) {
      const body = route.request().postDataJSON() as { paths: string[] };
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
  return {
    creates,
    templateSaves,
    jobCancels,
    reschedules,
    draft: () => draft,
    uploads: () => uploads,
    pixel,
    jobs,
    jobReads: () => jobReads,
  };
}

async function mockPublication(page: Page, enabled = true, loseFirstResponse = false) {
  const state = await mockDrafts(page, true);
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

for (const width of [1440, 390])
  for (const dark of [false, true]) {
    test(`Inserat vor Veröffentlichung prüfen bei ${width}px ${dark ? 'dunkel' : 'hell'} @marketplace-preview`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await mockPublication(page);
      if (dark) await page.addInitScript(() => localStorage.setItem('flipbase_theme', 'dark'));
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' && /NG\d{4,5}/.test(message.text()))
          errors.push(message.text());
      });
      await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
      const opener = page.getByRole('button', {
        name: 'Veröffentlichung vorbereiten',
        exact: true,
      });
      await opener.click();
      const preview = page.getByRole('dialog', { name: 'Veröffentlichung prüfen', exact: true });
      await expect(
        preview.getByText('Deine gespeicherten Angaben passen zur aktuellen Vinted-Auswahl.'),
      ).toBeVisible();
      const submit = preview.getByRole('button', {
        name: 'Freigeben und beauftragen',
        exact: true,
      });
      await expect(submit).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(preview).not.toBeVisible();
      await expect(opener).toBeFocused();
      await opener.click();
      const scheduleOpener = preview.getByRole('button', { name: 'Termin wählen', exact: true });
      await scheduleOpener.click();
      const planner = page.getByRole('dialog', { name: 'Veröffentlichung planen', exact: true });
      await planner.getByRole('button', { name: 'In einer Stunde', exact: true }).click();
      await page.addScriptTag({ content: axe.source });
      expect(
        await page.evaluate(
          async () => (await (window as unknown as { axe: typeof axe }).axe.run()).violations,
        ),
      ).toEqual([]);
      await planner.getByRole('button', { name: 'Termin übernehmen', exact: true }).click();
      await expect(planner).not.toBeVisible();
      await expect(
        preview.getByRole('button', { name: 'Termin ändern', exact: true }),
      ).toBeFocused();
      const aiPhoto = preview.getByRole('checkbox', {
        name: 'Meine Fotos wurden mit KI erstellt oder verändert',
      });
      await aiPhoto.click();
      await expect(aiPhoto).toHaveAttribute('aria-checked', 'true');
      const consent = preview.getByRole('checkbox', {
        name: 'Ich erlaube Flipbase, Inserate über Testkonto A anzulegen.',
      });
      await consent.click();
      await expect(consent).toHaveAttribute('aria-checked', 'true');
      await expect(submit).toBeEnabled();
      expect(
        await page.evaluate(
          async () => (await (window as unknown as { axe: typeof axe }).axe.run()).violations,
        ),
      ).toEqual([]);
      expect(await page.locator('form form').count()).toBe(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`publication-${width}-${dark ? 'dark' : 'light'}.png`),
        fullPage: false,
      });
      expect(state.approvals).toEqual([]);
      expect(state.enqueues).toEqual([]);
      await submit.focus();
      await page.keyboard.press('Enter');
      await expect(preview).not.toBeVisible();
      await expect(
        page
          .locator('app-vinted-listing-job-panel')
          .getByText('Veröffentlichung beauftragt', { exact: true }),
      ).toBeVisible();
      expect(state.approvals).toEqual([
        {
          p_workspace_id: workspaceId,
          p_connection_id: accountIds[0],
          p_expected_external_account_id: '100',
        },
      ]);
      expect(state.enqueues).toHaveLength(1);
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
  await page.getByRole('button', { name: 'Veröffentlichung vorbereiten', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Veröffentlichung prüfen', exact: true });
  await expect(preview.getByText(/Beschreibung/).last()).toBeVisible();
  await expect(preview.getByText(/auf diesem Server noch nicht verfügbar/)).toBeVisible();
  await expect(
    preview.getByRole('button', { name: 'Freigeben und beauftragen', exact: true }),
  ).toBeDisabled();
  expect(state.approvals).toEqual([]);
  expect(state.enqueues).toEqual([]);
});
test('Sofortauftrag behält bei verlorener Antwort denselben Versuch @marketplace-preview', async ({
  page,
}) => {
  const state = await mockPublication(page, true, true);
  await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
  await page.getByRole('button', { name: 'Veröffentlichung vorbereiten', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Veröffentlichung prüfen', exact: true });
  await expect(preview.getByText(/passen zur aktuellen Vinted-Auswahl/)).toBeVisible();
  await preview
    .getByRole('checkbox', { name: 'Ich erlaube Flipbase, Inserate über Testkonto A anzulegen.' })
    .click();
  await preview.getByRole('button', { name: 'Freigeben und beauftragen', exact: true }).click();
  const retry = preview.getByRole('button', { name: 'Diesen Auftrag erneut prüfen', exact: true });
  await expect(retry).toBeEnabled();
  await expect(preview.getByRole('button', { name: 'Termin wählen', exact: true })).toBeDisabled();
  expect(state.enqueues).toHaveLength(1);
  await retry.click();
  await expect(preview).not.toBeVisible();
  expect(state.enqueues).toHaveLength(2);
  expect(state.enqueues[1]).toEqual(state.enqueues[0]);
  expect(state.enqueues[0]).toMatchObject({ p_action: 'publish', p_ai_photo: false });
  expect(state.enqueues[0]['p_scheduled_at']).toBeUndefined();
  expect(state.approvals).toHaveLength(1);
  expect(state.jobs).toHaveLength(1);
  await expect(
    page
      .locator('app-vinted-listing-job-panel')
      .getByText('Veröffentlichung beauftragt', { exact: true }),
  ).toBeVisible();
});

test('Inseratauftrag aktualisiert sich über einen privaten Kanal @marketplace-preview', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await mockDrafts(page, true);
  let hint: ((payload: unknown) => void) | undefined;
  let privateChannel = false;
  await page.routeWebSocket(/127\.0\.0\.1:54351/, (socket) => {
    socket.onMessage((message) => {
      if (typeof message !== 'string') return;
      const [joinRef, ref, topic, event, payload] = JSON.parse(message) as unknown[];
      if (['phx_join', 'phx_leave', 'heartbeat'].includes(String(event)))
        socket.send(
          JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]),
        );
      if (
        event === 'phx_join' &&
        topic === `realtime:workspace:${workspaceId}:marketplace_listing:9007199254740999`
      ) {
        privateChannel = (payload as { config: { private: boolean } }).config.private;
        hint = (value) =>
          socket.send(
            JSON.stringify([
              joinRef,
              null,
              topic,
              'broadcast',
              { type: 'broadcast', event: 'listing_jobs_changed', payload: value },
            ]),
          );
      }
    });
  });
  await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
  const history = page.locator('app-vinted-listing-job-panel');
  await expect(history.getByText('Veröffentlichung beauftragt', { exact: true })).toBeVisible();
  await expect.poll(() => !!hint).toBe(true);
  await expect.poll(() => state.jobReads()).toBeGreaterThanOrEqual(2);
  expect(privateChannel).toBe(true);
  Object.assign(state.jobs[0], { state: 'claimed', version: 2 });
  hint!({ workspaceId, draftId: '9007199254740999', id: '46600000-0000-4000-8000-000000000099' });
  await expect(history.getByText('Wird vorbereitet', { exact: true })).toBeVisible();
  Object.assign(state.jobs[0], {
    state: 'confirmed',
    version: 3,
    externalId: '46609',
    providerState: 'active',
    verifiedAt: '2026-10-10T00:00:00Z',
  });
  hint!({ workspaceId, draftId: '9007199254740999' });
  await expect(history.getByText('Veröffentlicht', { exact: true })).toBeVisible();
  await expect(history.getByRole('link', { name: /^Bei Vinted ansehen/ }).first()).toHaveAttribute(
    'href',
    'https://www.vinted.de/items/46609',
  );
  await page.addScriptTag({ content: axe.source });
  expect(
    await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector('app-vinted-listing-job-panel') as HTMLElement,
          )
        ).violations,
    ),
  ).toEqual([]);
  expect(state.jobCancels).toEqual([]);
  expect(state.reschedules).toEqual([]);
  expect(state.uploads()).toBe(0);
  await history.scrollIntoViewIfNeeded();
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
          json: { fields: listingCategoryFixture(requests.length === 3 ? 1223 : 2) },
        });
      });
      if (dark) await page.addInitScript(() => localStorage.setItem('flipbase_theme', 'dark'));
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
      const editor = page.locator('app-vinted-listing-editor');
      await editor.getByRole('textbox', { name: 'Titel', exact: true }).fill('Meine Jacke');
      await editor.getByRole('textbox', { name: 'Verkaufspreis', exact: true }).fill('20,50');
      await editor.getByRole('button', { name: /^Vinted-Kategorie/ }).click();
      await page.getByRole('combobox', { name: 'Kategorie suchen', exact: true }).fill('Jacken');
      await page.getByRole('option', { name: /Jacken/ }).click();
      await expect.poll(() => state.draft().content.categoryId).toBe(2);
      const opener = editor.getByRole('button', { name: 'Vinted-Angaben auswählen', exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Vinted-Angaben wählen', exact: true });
      await expect(
        dialog.getByRole('combobox', { name: 'Größe bei Vinted', exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(opener).toBeFocused();
      expect(state.draft().content.sizeId).toBeNull();
      await opener.click();
      const size = dialog.getByRole('combobox', { name: 'Größe bei Vinted', exact: true });
      await size.click();
      await expect(page.getByRole('option', { name: 'L', exact: true })).toHaveCount(0);
      await page.getByRole('option', { name: 'M', exact: true }).click();
      await dialog.getByRole('combobox', { name: 'Zustand bei Vinted', exact: true }).click();
      await page.getByRole('option', { name: 'Sehr gut', exact: true }).click();
      await dialog.getByRole('combobox', { name: 'Paketgröße bei Vinted', exact: true }).click();
      await page.getByRole('option', { name: 'Mittel', exact: true }).click();
      await dialog.getByRole('checkbox', { name: 'Farben: Blau', exact: true }).focus();
      await page.keyboard.press('Space');
      await dialog.getByRole('checkbox', { name: 'Farben: Schwarz', exact: true }).click();
      await expect(
        dialog.getByRole('checkbox', { name: 'Farben: Weiß', exact: true }),
      ).toBeDisabled();
      await dialog.getByRole('checkbox', { name: 'Materialien: Baumwolle', exact: true }).click();
      await page.addScriptTag({ content: axe.source });
      expect(
        await page.evaluate(
          async () =>
            (
              await (window as unknown as { axe: typeof axe }).axe.run(
                document.querySelector('app-vinted-listing-fields-dialog') as HTMLElement,
              )
            ).violations,
        ),
      ).toEqual([]);
      expect(await page.locator('form form').count()).toBe(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`fields-${width}-${dark ? 'dark' : 'light'}.png`),
        fullPage: false,
      });
      await dialog.getByRole('button', { name: 'Angaben übernehmen', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(dialog).not.toBeVisible();
      await expect.poll(() => state.draft().content.sizeId).toBe(208);
      expect(state.draft().content).toMatchObject({
        title: 'Meine Jacke',
        priceCents: 2050,
        conditionId: 2,
        colorIds: [2, 1],
        colorLabels: ['Blau', 'Schwarz'],
        materialIds: [44],
        packageSizeId: 2,
      });
      expect(requests).toEqual(
        Array.from({ length: 2 }, () => ({
          workspaceId,
          connectionId: accountIds[0],
          categoryId: 2,
        })),
      );
      await expect(editor.getByText('Paketgröße: Mittel', { exact: true })).toBeVisible();
      await page.reload();
      await expect(editor.getByRole('textbox', { name: 'Größe', exact: true })).toHaveValue('M');
      await expect(
        editor.getByText('Paketgröße: Bereits festgelegt', { exact: true }),
      ).toBeVisible();
      await editor.getByRole('textbox', { name: 'Größe', exact: true }).fill('XL');
      await expect.poll(() => state.draft().content.sizeId).toBeNull();
      expect(state.draft().content.conditionId).toBe(2);
      await opener.click();
      await expect(dialog.getByRole('alert')).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: 'Angaben übernehmen', exact: true }),
      ).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(editor.getByRole('textbox', { name: 'Größe', exact: true })).toHaveValue('XL');
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
      const opener = editor.getByRole('button', { name: 'Bei Vinted auswählen', exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Vinted-Marke wählen', exact: true });
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(opener).toBeFocused();
      expect(searches).toEqual([]);
      await opener.click();
      await dialog.getByRole('textbox', { name: 'Vinted-Marke suchen', exact: true }).fill('Jako');
      await dialog
        .getByRole('textbox', { name: 'Vinted-Marke suchen', exact: true })
        .press('Enter');
      await expect(dialog.getByRole('button', { name: 'Jako', exact: true })).toBeVisible();
      expect(searches).toEqual([{ keyword: 'Jako', workspaceId }]);
      await page.addScriptTag({ content: axe.source });
      expect(
        await page.evaluate(
          async () =>
            (
              await (window as unknown as { axe: typeof axe }).axe.run(
                document.querySelector('app-vinted-listing-brand-dialog') as HTMLElement,
              )
            ).violations,
        ),
      ).toEqual([]);
      expect(await page.locator('form form').count()).toBe(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`brand-${width}-${dark ? 'dark' : 'light'}.png`),
        fullPage: false,
      });
      await dialog.getByRole('button', { name: 'Jako', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(dialog).not.toBeVisible();
      await expect.poll(() => state.draft().content.brandId).toBe(254956);
      expect(state.draft().content.brandLabel).toBe('Jako');
      await page.reload();
      const brand = editor.getByRole('textbox', { name: 'Marke', exact: true });
      await expect(brand).toHaveValue('Jako');
      await brand.fill('Jako-o');
      await expect.poll(() => state.draft().content.brandLabel).toBe('Jako-o');
      expect(state.draft().content.brandId).toBeNull();
      await opener.click();
      await dialog.getByRole('button', { name: 'Keine Marke', exact: true }).click();
      await expect.poll(() => state.draft().content.brandLabel).toBe('Keine Marke');
      expect(state.draft().content.brandId).toBeNull();
      expect(state.uploads()).toBe(0);
      expect(state.reschedules).toEqual([]);
    });
  }

for (const width of [1440, 390])
  for (const dark of [false, true]) {
    test(`Planung ändern bei ${width}px ${dark ? 'dunkel' : 'hell'} @marketplace-preview`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await mockDrafts(page, true);
      await page.clock.setFixedTime(new Date('2026-10-09T12:00:00Z'));
      if (dark) await page.addInitScript(() => localStorage.setItem('flipbase_theme', 'dark'));
      await page.goto('/marketplaces/vinted/listing-drafts/9007199254740999');
      const history = page.locator('app-vinted-listing-job-panel');
      const opener = history.getByRole('button', { name: 'Planung aktualisieren', exact: true });
      await expect(opener).toBeEnabled();
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Veröffentlichung planen', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('textbox', { name: 'Uhrzeit', exact: true })).toHaveValue(
        '02:30',
      );
      await expect(
        dialog.getByRole('combobox', { name: 'Vorkommen bei der Zeitumstellung' }),
      ).toContainText('Späteres');
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(opener).toBeFocused();
      expect(state.reschedules).toEqual([]);
      await opener.click();
      await dialog.getByRole('combobox', { name: 'Vorkommen bei der Zeitumstellung' }).click();
      await page.getByRole('option', { name: /Früheres/ }).click();
      await dialog.getByRole('combobox', { name: 'Regel für einen verpassten Termin' }).click();
      await page
        .getByRole('option', {
          name: 'Veröffentlichen, sobald die Ausführung verfügbar ist',
          exact: true,
        })
        .click();
      await page.addScriptTag({ content: axe.source });
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
      expect(await page.locator('form form').count()).toBe(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`schedule-${width}-${dark ? 'dark' : 'light'}.png`),
        fullPage: false,
      });
      await dialog.getByRole('button', { name: 'Termin übernehmen', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(dialog).not.toBeVisible();
      expect(state.reschedules).toHaveLength(1);
      expect(state.reschedules[0]).toMatchObject({
        p_job_id: '1',
        p_expected_version: 1,
        p_expected_revision: 1,
        p_scheduled_at: '2026-10-25T00:30:00.000Z',
        p_time_zone: 'Europe/Berlin',
        p_late_policy: 'publish_when_available',
      });
      expect(Object.keys(state.reschedules[0])).not.toContain('p_ai_photo');
      await expect(history.getByText('Abgebrochen', { exact: true })).toBeVisible();
      await expect(history.getByText('Veröffentlichung beauftragt', { exact: true })).toBeVisible();
      await page.reload();
      await expect(history.getByText(/02:30 MESZ/)).toBeVisible();
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
      await editor.getByRole('textbox', { name: 'Marke', exact: true }).fill('Testmarke');
      await expect(page).toHaveURL(/listing-drafts\/9007199254740999$/);
      await expect.poll(() => state.draft().content.priceCents).toBe(4550);
      expect(state.creates).toHaveLength(1);
      expect(state.creates[0]['p_connection_id']).toBeNull();
      await editor.getByRole('button', { name: /^Vinted-Kategorie/ }).click();
      await page.getByRole('combobox', { name: 'Kategorie suchen', exact: true }).fill('Jacken');
      await page.getByRole('option', { name: /Jacken/ }).click();
      await expect.poll(() => state.draft().content.categoryId).toBe(2);
      expect(state.draft().content.categoryLabel).toBe('Kleidung > Jacken');
      await editor.locator('input[type=file]').setInputFiles([
        { name: 'blue.png', mimeType: 'image/png', buffer: state.pixel },
        { name: 'second.png', mimeType: 'image/png', buffer: state.pixel },
      ]);
      const crop = editor.getByRole('button', {
        name: 'blue.png zuschneiden oder drehen',
        exact: true,
      });
      await crop.click();
      const dialog = page.getByRole('dialog', { name: 'Bild zuschneiden', exact: true });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: 'Bild übernehmen', exact: true }),
      ).toBeEnabled();
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(crop).toBeFocused();
      await expect.poll(() => state.draft().images.length).toBe(2);
      await expect(editor.getByText('In Flipbase gespeichert', { exact: true })).toBeVisible();
      await editor.getByRole('button', { name: 'blue.png nach hinten', exact: true }).click();
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
      await expect(editor.getByRole('button', { name: /^Vinted-Kategorie/ })).toContainText(
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
      await expect.poll(() => state.draft().content.title).toBe('Testmarke Lieblingsjacke');
      await page.reload();
      await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
        'Testmarke Lieblingsjacke',
      );
      await expect(editor.getByRole('textbox', { name: 'Verkaufspreis', exact: true })).toHaveValue(
        '45,50',
      );
      await expect(
        editor.getByRole('button', { name: 'second.png nach hinten', exact: true }),
      ).toBeVisible();
      const history = editor.locator('app-vinted-listing-job-panel');
      await expect(history.getByText('Veröffentlichung beauftragt', { exact: true })).toBeVisible();
      await expect(history.getByText('Vinted prüft Dein Inserat', { exact: true })).toBeVisible();
      await expect(history.getByText('Ergebnis unklar', { exact: true })).toBeVisible();
      await expect(history.getByText(/neuere Änderungen/).first()).toBeVisible();
      await history.getByRole('button', { name: 'Auftrag abbrechen', exact: true }).click();
      await expect(history.getByText('Abgebrochen', { exact: true })).toBeVisible();
      expect(state.jobCancels).toEqual([{ p_job_id: '1', p_expected_version: 1 }]);
      await expect(
        history.getByRole('button', { name: 'Auftrag abbrechen', exact: true }),
      ).toHaveCount(0);
      await page.addScriptTag({ content: axe.source });
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
