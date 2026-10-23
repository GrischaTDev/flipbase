import { randomUUID, createCipheriv, randomBytes, hkdfSync, createHmac } from 'node:crypto';
import axe from 'axe-core';
import { test, expect, openDashboard, type TestWorkspace } from './support/fixtures';
import { createFinalizedPurchase } from './support/sample-data';
import { createLocalAdminClient } from './support/local-supabase';
import { readAccessToken } from './support/test-account';

async function createOrder(workspace: TestWorkspace, autoPrepare = false) {
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
  const accountId = `test-${connectionId}`;
  const orderId = `fixture-${connectionId}`;
  const scope = {
    workspace_id: workspace.id,
    environment: 'production',
    external_account_id: accountId,
  };
  const sourceKey = createHmac(
    'sha256',
    Buffer.from(
      hkdfSync('sha256', Buffer.alloc(32, 7), 'flipbase:ebay:source:v1', 'order-booking', 32),
    ),
  )
    .update(JSON.stringify([workspace.id, 'production', accountId, orderId]))
    .digest('hex');
  const source = {
    orderId,
    createdAt: '2026-09-30T22:30:00Z',
    lastModifiedAt: '2026-10-01T12:00:00Z',
    observedAt: new Date().toISOString(),
    paymentStatus: 'PAID',
    cancelStatus: 'NONE_REQUESTED',
    fulfillmentStatus: 'NOT_STARTED',
    currency: 'EUR',
    totalCents: 1400,
    shippingRevenueCents: 400,
    platformFeeCents: 0,
    blockers: [],
    lines: [
      {
        lineItemId: 'line-1',
        listingId: '123',
        variationId: null,
        sku: null,
        title: 'eBay-Testartikel',
        quantity: 1,
        goodsCents: 1000,
        hasRefund: false,
        variationAspects: [],
        imageUrl: 'https://i.ebayimg.com/flipbase-test.webp',
      },
    ],
  };
  const operations = await Promise.all([
    admin.from('ebay_cache_scans').insert(
      ['orders', 'listings'].map((kind) => ({
        ...scope,
        kind,
        completed_at: new Date().toISOString(),
        baseline_to: new Date().toISOString(),
        next_due_at: '2099-01-01T00:00:00Z',
      })),
    ),
    admin.from('ebay_cached_listings').insert({
      ...scope,
      listing_id: '123',
      seen_generation: randomUUID(),
      listing: {
        id: '123',
        title: 'eBay-Testartikel',
        price: 10,
        currency: 'EUR',
        quantity: 1,
        listingType: 'FixedPriceItem',
        url: 'https://www.ebay.de/itm/123',
        imageUrl: 'https://i.ebayimg.com/flipbase-test.webp',
      },
    }),
    admin.from('ebay_cached_orders').insert({
      ...scope,
      order_id: orderId,
      source_key: sourceKey,
      source,
      created_at: source.createdAt,
      modified_at: source.lastModifiedAt,
      auto_prepare: autoPrepare,
      last_scanned_payment_status: 'PAID',
    }),
  ]);
  for (const operation of operations) if (operation.error) throw operation.error;
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
  const admin = createLocalAdminClient();
  expect(
    (await admin.from('ebay_sale_drafts').select('id').eq('workspace_id', workspace.id)).data,
  ).toEqual([]);
  expect(
    (await admin.from('ebay_sale_notifications').select('id').eq('workspace_id', workspace.id))
      .data,
  ).toEqual([]);
  await page.route('https://i.ebayimg.com/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#fcc601"/></svg>',
    }),
  );
  await openDashboard(page);
  await page.goto('/marketplaces/ebay');
  await expect(page).toHaveURL(/\/marketplaces\/ebay\/listings$/);
  await page
    .getByRole('button', { name: 'Mit Bestand verknüpfen: eBay-Testartikel', exact: true })
    .click();
  const mapping = page.locator('app-ebay-article-mapping');
  await mapping.getByRole('button', { name: 'Mit Bestand verknüpfen', exact: true }).click();
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
  await page
    .locator('[data-ebay-navigation]')
    .getByRole('link', { name: 'Bestellungen', exact: true })
    .click();
  await expect(page).toHaveURL(/\/marketplaces\/ebay\/orders$/);
  await expect(
    page.getByRole('link', { name: `Bestellung prüfen: ${order.orderId}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Noch nicht gebucht', { exact: true })).toBeVisible();
  await expect(page.locator('app-ebay-account img[alt="eBay-Testartikel"]').first()).toBeVisible();
  let releaseOrders!: () => void;
  const pendingOrders = new Promise<void>((resolve) => {
    releaseOrders = resolve;
  });
  await page.route('**/functions/v1/ebay-account', async (route) => {
    if (route.request().postDataJSON()?.action === 'orders') await pendingOrders;
    await route.continue();
  });
  await page.locator('a[href="/dashboard"]').first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/marketplaces\/ebay\/orders$/);
  await expect(
    page.getByRole('link', { name: `Bestellung prüfen: ${order.orderId}`, exact: true }),
  ).toBeVisible();
  releaseOrders();
  await page.unroute('**/functions/v1/ebay-account');

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
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(page.getByText('Entwurf gespeichert.', { exact: false })).toBeVisible();
  const savedDraft = await admin
    .from('ebay_sale_drafts')
    .select('id,costs,state')
    .eq('workspace_id', workspace.id)
    .single();
  expect(savedDraft.data).toMatchObject({
    costs: { platformFeeCents: 0, shippingCostCents: 300 },
    state: 'ready_for_review',
  });
  expect((await admin.from('sales').select('id').eq('workspace_id', workspace.id)).data).toEqual(
    [],
  );
  expect(
    (await admin.from('inventory_items').select('status').eq('id', items[0].id).single()).data
      ?.status,
  ).toBe('reserved');
  await page.reload();
  await expect(
    page.getByRole('spinbutton', { name: 'Tatsächliche Versandkosten, erforderlich' }),
  ).toHaveValue('3');
  await expect(book).toBeEnabled();
  const { error: expiryError } = await createLocalAdminClient()
    .from('ebay_order_snapshots')
    .update({ created_at: '2019-12-31T23:59:50Z', expires_at: '2020-01-01T00:00:00Z' })
    .eq('workspace_id', workspace.id)
    .eq('connection_id', order.connectionId);
  if (expiryError) throw expiryError;
  await book.click();
  await expect(page.getByRole('alert').first()).toContainText('Prüfung ist abgelaufen');
  await page.getByRole('button', { name: 'Bestellung erneut prüfen', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'Plattformgebühr, erforderlich' })).toHaveValue(
    '0',
  );
  await expect(
    page.getByRole('spinbutton', { name: 'Tatsächliche Versandkosten, erforderlich' }),
  ).toHaveValue('3');
  await expect(page.locator('[data-sale-article-label]')).toContainText('eBay-Testartikel');
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
  let providerUnavailable = false;
  let providerReviews = 0;
  await page.route('**/functions/v1/ebay-account', async (route) => {
    const action = route.request().postDataJSON()?.action;
    if (action === 'order_review' && providerUnavailable) {
      providerReviews++;
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'provider_unavailable' }),
      });
    } else if (action === 'order_book') {
      bookingRequests++;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Status prüfen', exact: true })).toBeVisible();
  await expect(book).toBeDisabled();
  providerUnavailable = true;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Verkauf gebucht', exact: true })).toBeVisible();
  await expect(book).toHaveCount(0);
  expect(bookingRequests).toBe(1);
  expect(providerReviews).toBe(0);
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
    items: [
      { title: 'Manueller Testartikel', price: 2 },
      { title: 'Zuvor manuell verkauft', price: 2 },
    ],
  });
  const order = await createOrder(workspace);
  const { data: legacy, error: legacyError } = await workspace.client.rpc('record_sale', {
    p_workspace_id: workspace.id,
    p_sale: {
      platform: 'ebay',
      sale_date: '2026-10-01',
      external_order_id: order.orderId,
      platform_fee: 0,
      shipping_cost: 0,
      shipping_revenue: 4,
    },
    p_lines: [
      {
        inventory_item_id: items[1].id,
        title_snapshot: items[1].title,
        quantity: 1,
        unit_sale_price: 10,
      },
    ],
  });
  if (legacyError) throw legacyError;
  const legacySaleId = (legacy as { sale: { id: string } }).sale.id;
  await openDashboard(page);
  await page.goto(order.route);
  await page.getByRole('combobox', { name: 'Erfassung der Bestellung', exact: true }).click();
  await page.getByRole('option', { name: 'Bereits als Verkauf erfasst', exact: true }).click();
  await page.getByRole('combobox', { name: 'Vorhandener eBay-Verkauf', exact: true }).click();
  await page.getByRole('option', { name: /Zuvor manuell verkauft/ }).click();
  await page
    .getByRole('combobox', { name: 'Verkaufsposition für eBay-Testartikel', exact: true })
    .click();
  await page.getByRole('option', { name: /Zuvor manuell verkauft/ }).click();
  await page
    .getByRole('textbox', { name: 'Grund der nachträglichen Zuordnung', exact: true })
    .fill('Bereits in meinen Verkäufen erfasst');
  await page
    .getByRole('checkbox', {
      name: 'Ich habe alle Positionen, Mengen und den vollständigen Verkauf geprüft.',
    })
    .click();
  await page.getByRole('button', { name: 'Bestehenden Verkauf verknüpfen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bereits erfasst', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bereits erfasst', exact: true })).toBeVisible();
  const { data: sales } = await workspace.client
    .from('sales')
    .select('id')
    .eq('workspace_id', workspace.id);
  expect(sales).toEqual([{ id: legacySaleId }]);
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
  await expect(page.getByRole('heading', { name: 'Bereits erfasst', exact: true })).toHaveCount(0);
});

test('prepares a new linked eBay sale with owned reservation and personal bell @core-smoke', async ({
  page,
  workspace,
}) => {
  const { items } = await createFinalizedPurchase(workspace, {
    title: 'Automatische eBay-Vorbereitung',
    purchaseDate: '2026-09-01',
    items: [{ title: 'eBay-Testartikel', price: 2 }],
  });
  const order = await createOrder(workspace, true);
  const { error } = await workspace.client.rpc('ebay_set_article_mapping', {
    p_workspace_id: workspace.id,
    p_connection_id: order.connectionId,
    p_listing_id: '123',
    p_variation_id: null as unknown as string,
    p_target: { inventoryItemId: items[0].id },
  });
  if (error) throw error;
  const admin = createLocalAdminClient();
  expect(
    (
      await admin
        .from('ebay_sale_drafts')
        .select('state,costs')
        .eq('workspace_id', workspace.id)
        .single()
    ).data,
  ).toMatchObject({
    state: 'needs_costs',
    costs: { platformFeeCents: 0, shippingCostCents: null },
  });
  expect(
    (await admin.from('inventory_items').select('status').eq('id', items[0].id).single()).data
      ?.status,
  ).toBe('reserved');
  expect((await admin.from('sales').select('id').eq('workspace_id', workspace.id)).data).toEqual(
    [],
  );
  await openDashboard(page);
  await page.goto('/sales');
  const drafts = page.getByRole('region', { name: 'eBay-Entwürfe', exact: true });
  await expect(drafts.getByText('Kosten ergänzen', { exact: true })).toBeVisible();
  await expect(page.getByTestId('sales-result-kpi')).toContainText('0,00');
  await page.getByRole('button', { name: /Benachrichtigungen/ }).click();
  await expect(page.locator('#header-notification-menu img[alt="eBay"]')).toBeVisible();
  const notification = page
    .locator('#header-notification-menu')
    .getByRole('link', { name: /eBay-Verkauf prüfen/ });
  await expect(notification).toHaveAttribute('href', order.route);
  await notification.click();
  await expect(
    page.getByText('Der Bestand ist für diesen Entwurf reserviert', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('[data-sale-article-label]')).toContainText('eBay-Testartikel');
  await expect(page.getByRole('spinbutton', { name: 'Plattformgebühr, erforderlich' })).toHaveValue(
    '0',
  );
  await expect(
    page.getByRole('spinbutton', { name: 'Tatsächliche Versandkosten, erforderlich' }),
  ).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Verkauf buchen', exact: true })).toBeDisabled();
  await page
    .getByRole('spinbutton', { name: 'Tatsächliche Versandkosten, erforderlich' })
    .fill('0');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(page.getByText('Entwurf gespeichert.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Verkauf buchen', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /Benachrichtigungen/ }).click();
  await page.getByRole('button', { name: 'Als ungelesen markieren', exact: true }).click();
  const event = await admin
    .from('ebay_sale_notifications')
    .select('id')
    .eq('workspace_id', workspace.id)
    .single();
  await expect
    .poll(
      async () =>
        (
          await admin
            .from('ebay_sale_notification_receipts')
            .select('read_at')
            .eq('event_id', event.data!.id)
            .single()
        ).data?.read_at,
    )
    .toBeNull();
  await page.getByRole('button', { name: 'Gelesen', exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await admin
            .from('ebay_sale_notification_receipts')
            .select('read_at')
            .eq('event_id', event.data!.id)
            .single()
        ).data?.read_at,
    )
    .not.toBeNull();
  await page.getByRole('button', { name: 'Benachrichtigungsverlauf leeren', exact: true }).click();
  await expect(
    page.locator('#header-notification-menu').getByRole('link', { name: /eBay-Verkauf prüfen/ }),
  ).toHaveCount(0);
  expect(
    (await admin.from('ebay_sale_drafts').select('id').eq('workspace_id', workspace.id)).data,
  ).toHaveLength(1);
  expect(
    (await admin.from('inventory_items').select('status').eq('id', items[0].id).single()).data
      ?.status,
  ).toBe('reserved');
  await page.goto('/marketplaces/ebay/connection');
  await page.getByRole('button', { name: 'Testkonto einstellen', exact: true }).click();
  await page.getByRole('button', { name: 'Verbindung trennen', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'eBay-Verbindung verwalten' })
      .getByText('Getrennt', { exact: true }),
  ).toBeVisible();
  await page.goto('/sales');
  await expect(
    page.getByRole('heading', { name: 'Reservierter eBay-Bestand', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(order.orderId, { exact: false })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'eBay-Entwürfe', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reservierung klären', exact: true }).click();
  const clarification = page.getByRole('dialog', { name: 'Reservierung bewusst freigeben' });
  await clarification
    .getByRole('textbox', { name: /Grund der Klärung/ })
    .fill('Ware liegt wieder geprüft im Bestand');
  await clarification
    .getByRole('checkbox', {
      name: 'Ich habe den tatsächlichen Bestand geprüft und möchte diese Reservierung freigeben.',
    })
    .click();
  await clarification.getByRole('button', { name: 'Reservierung freigeben', exact: true }).click();
  await expect(clarification).toHaveCount(0);
  expect(
    (await admin.from('inventory_items').select('status').eq('id', items[0].id).single()).data
      ?.status,
  ).toBe('ready');
});
