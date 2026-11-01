import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { mockMarketplace, workspaceId, accountIds } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
const scope = { workspaceId, connectionId: accountIds[0] };
async function fixture(page: Page) {
  await mockMarketplace(page);
  const sent: string[] = [];
  const published: unknown[] = [];
  let uncertain = false;
  const message = {
    id: 'm1',
    createdAt: '2026-11-01T10:00:00Z',
    text: 'Ist der Schal noch da?',
    sender: 'buyer',
    recipient: 'seller',
    attachments: [],
  };
  await page.route('**/functions/v1/ebay-account', async (route) => {
    if (route.request().headers()['content-type']?.startsWith('multipart/form-data'))
      return route.fulfill({ json: { ...scope, imageUrl: 'https://i.ebayimg.com/test.png' } });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const action = body['action'];
    let response: unknown;
    if (action === 'status')
      response = {
        configured: true,
        listingManagementAvailable: true,
        listingCreationAvailable: true,
        messagingAvailable: true,
        connection: {
          ...scope,
          status: 'connected',
          environment: 'production',
          username: 'seller',
          lastReadAt: null,
        },
      };
    else if (action === 'inbox')
      response = {
        ...scope,
        total: 1,
        nextOffset: null,
        conversations: [
          {
            id: 'c1',
            type: body['type'],
            title: body['type'] === 'FROM_EBAY' ? 'Information von eBay' : 'Vintage Wollschal',
            unreadCount: 1,
            listingId: '123',
            latestMessage: { ...message, sender: body['type'] === 'FROM_EBAY' ? 'eBay' : 'buyer' },
          },
        ],
      };
    else if (action === 'conversation')
      response = {
        ...scope,
        conversationId: body['conversationId'],
        type: body['type'],
        title: 'Vintage Wollschal',
        total: sent.length + 1,
        nextOffset: null,
        messages: [
          message,
          ...sent.map((text, index) => ({
            ...message,
            id: `sent-${index}`,
            sender: 'seller',
            recipient: 'buyer',
            text,
          })),
        ],
      };
    else if (action === 'message_send') {
      sent.push(String(body['text']));
      if (uncertain)
        return route.fulfill({ status: 502, json: { error: 'message_send_unconfirmed' } });
      response = {
        ...scope,
        message: {
          ...message,
          id: 'sent-0',
          sender: 'seller',
          recipient: 'buyer',
          text: body['text'],
        },
      };
    } else if (action === 'conversation_read') response = { ...scope, ok: true };
    else if (action === 'listing_settings')
      response = {
        ...scope,
        payment: [{ id: '1', name: 'Zahlung Standard' }],
        fulfillment: [{ id: '2', name: 'DHL Paket' }],
        returns: [{ id: '3', name: 'Rückgabe Standard' }],
      };
    else if (action === 'listing_categories')
      response = { ...scope, categories: [{ id: '12', name: 'Accessoires › Schals' }] };
    else if (action === 'listing_category')
      response = {
        ...scope,
        conditions: [{ id: '3000', name: 'Gebraucht' }],
        aspects: [
          { name: 'Marke', required: true, multiple: false, selectionOnly: false, values: [] },
        ],
      };
    else if (action === 'listing_validate' || action === 'listing_create') {
      if (action === 'listing_create') published.push(body['draft']);
      response = {
        ...scope,
        valid: true,
        listingId: action === 'listing_create' ? '123' : null,
        reviewHash: 'a'.repeat(64),
        issues: [],
        warnings: [],
        fees: [{ name: 'INSERTION_FEE', amount: 0.35, currency: 'EUR' }],
      };
    } else if (action === 'listing_created') response = { ...scope, listingId: '123' };
    else throw new Error(`Nicht erwarteter eBay-Aufruf: ${String(action)}`);
    return route.fulfill({ json: response });
  });
  await page.route('https://i.ebayimg.com/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#5b3139"/></svg>',
    }),
  );
  return {
    sent,
    published,
    failNextSend: () => {
      uncertain = true;
    },
  };
}
async function select(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function verifyLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const violations = await page.evaluate(async (source) => {
    const script = document.createElement('script');
    script.textContent = source;
    document.head.appendChild(script);
    const result = await (window as unknown as { axe: typeof axe }).axe.run();
    script.remove();
    return result.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    }));
  }, axe.source);
  expect(violations).toEqual([]);
}
async function screenshot(page: Page, name: string) {
  const directory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
  if (directory) {
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: join(directory, name), fullPage: true });
  }
}
for (const { width, theme, touch } of [
  { width: 1440, theme: 'light', touch: false },
  { width: 1440, theme: 'dark', touch: false },
  { width: 834, theme: 'dark', touch: true },
  { width: 390, theme: 'light', touch: true },
  { width: 320, theme: 'dark', touch: true },
] as const) {
  test.describe(`eBay ${width}px ${theme}`, () => {
    test.use({ viewport: { width, height: 960 }, hasTouch: touch });
    test('Postfach lesen, bewusst antworten und eBay-Systempost unterscheiden', async ({
      page,
    }) => {
      const data = await fixture(page);
      await page.goto('/marketplaces/ebay/messages');
      await expect(page.getByRole('heading', { name: 'Postfach', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /buyer.*Vintage Wollschal/ })).toBeVisible();
      if (theme === 'dark')
        await page.getByRole('button', { name: 'Dunkles Design aktivieren', exact: true }).click();
      await screenshot(page, `ebay-inbox-list-${width}-${theme}.png`);
      await page.getByRole('button', { name: /buyer.*Vintage Wollschal/ }).click();
      await expect(page.getByRole('log')).toContainText('Ist der Schal noch da?');
      await page
        .getByLabel('Deine Antwort', { exact: true })
        .fill('Ja, der Schal ist noch verfügbar.');
      await page.getByLabel('Deine Antwort', { exact: true }).press('Enter');
      expect(data.sent).toHaveLength(0);
      await page.getByRole('button', { name: 'Nachricht senden', exact: true }).click();
      await expect(page.getByRole('log')).toContainText('Ja, der Schal ist noch verfügbar.');
      expect(data.sent).toHaveLength(1);
      await verifyLayout(page);
      await screenshot(page, `ebay-conversation-${width}-${theme}.png`);
      if (width < 768) await page.getByRole('button', { name: 'Zurück', exact: true }).click();
      await select(page, 'Nachrichten anzeigen', 'Von eBay');
      await page.getByRole('button', { name: /eBay.*Information von eBay/ }).click();
      await expect(
        page.getByText('Auf eBay-Systemnachrichten kannst Du hier nicht antworten.'),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Nachricht senden', exact: true })).toHaveCount(
        0,
      );
    });
    test('Festpreisinserat prüfen und genau einmal nach Bestätigung veröffentlichen', async ({
      page,
    }) => {
      const data = await fixture(page);
      await page.goto('/marketplaces/ebay/listings/new');
      await expect(
        page.getByRole('heading', { name: 'eBay-Inserat erstellen', exact: true }),
      ).toBeVisible();
      if (theme === 'dark')
        await page.getByRole('button', { name: 'Dunkles Design aktivieren', exact: true }).click();
      await page.getByRole('textbox', { name: 'Titel', exact: true }).fill('Vintage Wollschal');
      await page.getByLabel('Preis', { exact: true }).fill('29');
      await page
        .getByRole('textbox', { name: 'Beschreibung', exact: true })
        .fill('Gepflegter Schal aus Wolle, ohne Schäden.');
      await page.getByLabel('Kategorie suchen', { exact: true }).fill('Schal');
      await page.getByRole('button', { name: 'Suchen', exact: true }).click();
      await select(page, 'eBay-Kategorie', 'Accessoires › Schals');
      await select(page, 'Zustand', 'Gebraucht');
      await page.getByRole('textbox', { name: 'Marke', exact: true }).fill('Testmarke');
      await page.getByRole('textbox', { name: 'Postleitzahl', exact: true }).fill('12345');
      await page.getByRole('textbox', { name: 'Ort', exact: true }).fill('Testort');
      await select(page, 'Zahlungsrichtlinie', 'Zahlung Standard');
      await select(page, 'Versandrichtlinie', 'DHL Paket');
      await select(page, 'Rückgaberichtlinie', 'Rückgabe Standard');
      await page.locator('app-product-media-editor input[type="file"]').setInputFiles({
        name: 'schal.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
          'base64',
        ),
      });
      await page.getByRole('button', { name: 'Bei eBay prüfen', exact: true }).click();
      await expect(page.getByText('Bereit zur Veröffentlichung', { exact: true })).toBeVisible();
      expect(data.published).toHaveLength(0);
      await verifyLayout(page);
      await screenshot(page, `ebay-create-review-${width}-${theme}.png`);
      await page.getByRole('button', { name: 'Bei eBay veröffentlichen', exact: true }).click();
      await page.getByRole('button', { name: 'Zurück', exact: true }).last().click();
      expect(data.published).toHaveLength(0);
      await page.getByRole('button', { name: 'Bei eBay veröffentlichen', exact: true }).click();
      await page.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }).click();
      await expect(page.getByText('Inserat veröffentlicht', { exact: true })).toBeVisible();
      expect(data.published).toHaveLength(1);
      await expect(page.getByRole('link', { name: 'Inserat bei eBay ansehen' })).toHaveAttribute(
        'href',
        'https://www.ebay.de/itm/123',
      );
    });
  });
}
test('Unklarer Nachrichtenversand bleibt nach Neuladen gesperrt', async ({ page }) => {
  const data = await fixture(page);
  data.failNextSend();
  await page.goto('/marketplaces/ebay/messages');
  await page.getByRole('button', { name: /buyer.*Vintage Wollschal/ }).click();
  await page.getByLabel('Deine Antwort', { exact: true }).fill('Hallo');
  await page.getByRole('button', { name: 'Nachricht senden', exact: true }).click();
  await expect(page.getByText('Der letzte Versand ist unklar.', { exact: false })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: /buyer.*Vintage Wollschal/ }).click();
  await expect(page.getByRole('button', { name: 'Nachricht senden', exact: true })).toBeDisabled();
  expect(data.sent).toHaveLength(1);
  await page.getByRole('button', { name: 'Verlauf geprüft', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Verlauf geprüft', exact: true })
    .click();
  await page.getByLabel('Deine Antwort', { exact: true }).fill('Eine neue, andere Antwort');
  await expect(page.getByRole('button', { name: 'Nachricht senden', exact: true })).toBeEnabled();
  expect(data.sent).toHaveLength(1);
});
