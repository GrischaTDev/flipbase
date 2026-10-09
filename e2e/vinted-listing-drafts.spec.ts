import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mockMarketplace, workspaceId } from './support/marketplace-account-fixture';
import { emptyVintedListingContent } from '../src/app/features/marketplaces/models/vinted-listing-content';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
async function mockDrafts(page: Page) {
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
  await mockMarketplace(page, false, false, false, false, undefined, undefined, false, 0);
  let draft = {
    id: '9007199254740999',
    workspaceId,
    connectionId: null,
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
  let created = false,
    imageId = 0,
    uploads = 0;
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
  return { creates, templateSaves, draft: () => draft, uploads: () => uploads, pixel };
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
