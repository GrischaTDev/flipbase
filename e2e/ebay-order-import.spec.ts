import { randomUUID, createCipheriv, randomBytes } from 'node:crypto';
import axe from 'axe-core';
import { test, expect, openDashboard, type TestWorkspace } from './support/fixtures';
import { createFinalizedPurchase } from './support/sample-data';
import { createLocalAdminClient } from './support/local-supabase';
import { readAccessToken } from './support/test-account';

async function createOrder(workspace: TestWorkspace) {
  const admin = createLocalAdminClient();
  const { data: identity, error: identityError } = await admin.auth.getUser(readAccessToken());
  if (identityError || !identity.user) throw new Error('Die bestätigte Testidentität fehlt.');
  const connectionId = randomUUID();
  const tokens = {
    accessToken: `fixture-${connectionId}`,
    refreshToken: 'fixture-refresh',
    expiresAt: Date.now() + 3600_000,
    refreshExpiresAt: Date.now() + 86400_000,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 7), iv);
  cipher.setAAD(Buffer.from(connectionId));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(tokens)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const { error } = await admin.from('ebay_connections').insert({
    id: connectionId,
    user_id: identity.user.id,
    workspace_id: workspace.id,
    environment: 'production',
    status: 'connected',
    external_account_id: `test-${connectionId}`,
    username: 'Testkonto',
    authorization_version: 1,
  });
  if (error) throw error;
  const { error: credentialsError } = await admin.from('ebay_credentials').insert({
    id: connectionId,
    encrypted_tokens: `v1.${iv.toString('base64')}.${encrypted.toString('base64')}`,
  });
  if (credentialsError) throw credentialsError;
  return {
    connectionId,
    orderId: `fixture-${connectionId}`,
    route: `/sales/ebay/${connectionId}/fixture-${connectionId}`,
  };
}

test('imports an eBay order exactly once @core-smoke', async ({ page, workspace }) => {
  const { items } = await createFinalizedPurchase(workspace, {
    title: 'eBay-Testbestand',
    purchaseDate: '2026-09-01',
    items: [{ title: 'eBay-Testartikel', price: 2 }],
  });
  const order = await createOrder(workspace);
  await openDashboard(page);
  await page.goto('/marketplaces/ebay');
  await page
    .getByRole('button', { name: 'Artikel zuordnen: eBay-Testartikel', exact: true })
    .click();
  const mapping = page.locator('app-ebay-article-mapping');
  await mapping.getByRole('button', { name: 'Artikel zuordnen', exact: true }).click();
  await page
    .locator('app-article-picker [data-product-group]')
    .filter({ hasText: 'eBay-Testartikel' })
    .click();
  await page.locator('app-article-picker [data-product-option]').click();
  await page
    .locator('app-article-picker')
    .getByRole('button', { name: 'Hinzufügen (1)', exact: true })
    .click();
  await expect(
    mapping.getByRole('button', { name: 'Zuordnung ändern', exact: true }),
  ).toBeVisible();
  await mapping.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Bestellungen', exact: true }).click();
  await expect(
    page.getByRole('link', { name: `Bestellung prüfen: ${order.orderId}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Noch nicht gebucht', { exact: true })).toBeVisible();
  await page.goto(order.route);
  await expect(
    page.getByRole('heading', { name: 'eBay-Bestellung prüfen', exact: true }),
  ).toBeVisible();
  const book = page.getByRole('button', { name: 'Verkauf buchen', exact: true });
  await expect(book).toBeDisabled();
  await page.reload();
  await expect(book).toBeDisabled();
  await expect(page.locator('[data-sale-article-label]')).toContainText('eBay-Testartikel');
  await page.getByRole('spinbutton', { name: 'Plattformgebühr, erforderlich' }).fill('0');
  await expect(book).toBeDisabled();
  await page
    .getByRole('spinbutton', { name: 'Tatsächliche Versandkosten, erforderlich' })
    .fill('3');
  await expect(book).toBeEnabled();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector('app-ebay-sale-review')!,
            { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } },
          )
        ).violations,
    );
    expect(violations).toEqual([]);
  }
  await book.focus();
  let bookingRequests = 0;
  await page.route('**/functions/v1/ebay-account', async (route) => {
    if (route.request().postDataJSON()?.action === 'order_book') {
      bookingRequests++;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Status prüfen', exact: true })).toBeVisible();
  await expect(book).toBeDisabled();
  await page.getByRole('button', { name: 'Status prüfen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verkauf gebucht', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Verkauf gebucht', exact: true })).toBeVisible();
  await expect(book).toHaveCount(0);
  expect(bookingRequests).toBe(1);
  const { data: sales, error } = await workspace.client
    .from('sales')
    .select('id,sale_price,platform_fee,shipping_cost,sale_date')
    .eq('workspace_id', workspace.id)
    .eq('external_order_id', order.orderId);
  if (error) throw error;
  expect(sales).toHaveLength(1);
  expect(sales?.[0]).toMatchObject({
    sale_price: 14,
    platform_fee: 0,
    shipping_cost: 3,
    sale_date: '2026-10-01',
  });
  const { data: item } = await workspace.client
    .from('inventory_items')
    .select('status')
    .eq('id', items[0].id)
    .single();
  expect(item?.status).toBe('sold');
});

test('marks a manually recorded eBay order without changing stock @core-smoke', async ({
  page,
  workspace,
}) => {
  const { items } = await createFinalizedPurchase(workspace, {
    title: 'Manueller Testbestand',
    purchaseDate: '2026-09-01',
    items: [{ title: 'Manueller Testartikel', price: 2 }],
  });
  const order = await createOrder(workspace);
  await openDashboard(page);
  await page.goto(order.route);
  await page.getByRole('button', { name: 'Bereits manuell gebucht', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manuelle Buchung vermerken' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(
    async () =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run('app-modal-shell', {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        })
      ).violations,
  );
  expect(violations).toEqual([]);
  await expect(dialog.getByRole('button', { name: 'Markierung speichern' })).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Grund' }).fill('Bereits in meinen Verkäufen erfasst');
  await dialog
    .getByRole('checkbox', { name: 'Ich habe diese Bestellung bereits manuell erfasst.' })
    .click();
  await dialog.getByRole('button', { name: 'Markierung speichern' }).click();
  await expect(
    page.getByRole('heading', { name: 'Bereits manuell gebucht', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Bereits manuell gebucht', exact: true }),
  ).toBeVisible();
  const { data: sales } = await workspace.client
    .from('sales')
    .select('id')
    .eq('workspace_id', workspace.id);
  expect(sales).toEqual([]);
  const { data: item } = await workspace.client
    .from('inventory_items')
    .select('status')
    .eq('id', items[0].id)
    .single();
  expect(item?.status).toBe('ready');
  await page.getByRole('button', { name: 'Markierung zurücknehmen', exact: true }).click();
  const undo = page.getByRole('dialog', { name: 'Markierung zurücknehmen' });
  await undo.getByRole('checkbox', { name: 'Ich möchte die Markierung zurücknehmen.' }).click();
  await undo.getByRole('button', { name: 'Markierung zurücknehmen' }).click();
  await expect(
    page.getByRole('heading', { name: 'Bereits manuell gebucht', exact: true }),
  ).toHaveCount(0);
});
