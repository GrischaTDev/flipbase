import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  mockMarketplace,
  workspaceId,
  accountIds,
  emptyPage,
} from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
const connectionId = accountIds[0];
const conversationId = '25000000-0000-4000-8000-000000000051';
const secondConversationId = '25000000-0000-4000-8000-000000000052';
const scope = { workspaceId, connectionId };
const imageUrl = 'https://images.example.test/jacket.svg';
const expiresAt = '2099-10-05T12:00:00Z';

async function inboxFixture(page: Page, longHistory = false) {
  await mockMarketplace(page, false, false, false, false, []);
  const now = new Date().toISOString();
  const account = {
    ...scope,
    marketplace: 'vinted',
    executionMode: 'local',
    displayName: 'Lokales Testkonto',
    externalAccountId: '123',
    status: 'connected',
    capabilities: { 'conversations.read': 'verified' },
    allowedActions: [],
    lastSyncedAt: now,
  };
  const conversations = [
    {
      ...scope,
      id: conversationId,
      externalId: '51',
      title: 'Anna',
      text: 'Ist die Jacke noch da?',
      occurredAt: now,
      unread: true,
      imageUrl,
      itemId: '456',
      itemTitle: 'Vintage Lederjacke',
      itemImageUrl: imageUrl,
      itemPrice: 58,
      itemCurrency: 'EUR',
      partnerId: '991',
      lastActiveAt: now,
      transactionStatus: 'Offen',
    },
    {
      ...scope,
      id: secondConversationId,
      externalId: '52',
      title: 'Ben',
      text: 'Danke für die Maße.',
      occurredAt: '2026-10-01T10:00:00Z',
      unread: false,
      itemTitle: 'Blauer Schal',
      itemImageUrl: imageUrl,
      itemPrice: 12,
      itemCurrency: 'EUR',
    },
  ];
  const queue: Record<string, unknown>[] = [];
  const enqueues: Record<string, unknown>[] = [];
  const bridgeCalls: string[] = [];
  let providerRequests = 0;
  let pendingDetail: Promise<void> | null = null;
  let finishDetail: (() => void) | undefined;
  let pendingStoredMessages: Promise<void> | null = null;
  let finishStoredMessages: (() => void) | undefined;
  await page.route('https://www.vinted.de/**', (route) => {
    providerRequests++;
    return route.abort();
  });
  await page.exposeFunction('inboxBridgeObserved', async (type: string) => {
    bridgeCalls.push(type);
    if (type === 'FLIPBASE_VINTED_LOCAL_INBOX_DETAIL' && pendingDetail) await pendingDetail;
    account.lastSyncedAt = new Date().toISOString();
  });
  await page.addInitScript(
    ({ scope, expiresAt, observedAt }) => {
      window.addEventListener('message', async (event) => {
        if (event.source !== window || !event.data?.type?.startsWith('FLIPBASE_VINTED_LOCAL_'))
          return;
        if (event.data.type === 'FLIPBASE_VINTED_LOCAL_RESULT') return;
        await (
          window as unknown as { inboxBridgeObserved(type: string): Promise<void> }
        ).inboxBridgeObserved(event.data.type);
        window.postMessage(
          {
            type: 'FLIPBASE_VINTED_LOCAL_RESULT',
            requestId: event.data.requestId,
            success: true,
            result: {
              ...scope,
              externalAccountId: '123',
              expiresAt,
              observedAt,
              counts: { conversation: 2, message: 3 },
              nextPage: 1,
              conversationsComplete: false,
            },
          },
          location.origin,
        );
      });
    },
    { scope, expiresAt, observedAt: now },
  );
  await page.route('https://images.example.test/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="140"><rect width="120" height="140" fill="#ccd7d2"/><path d="M40 20l-20 25 15 20 8-8v65h34V57l8 8 15-20-20-25-20 8z" fill="#435c51"/></svg>',
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_list_connections', (route) =>
    route.fulfill({ json: { canManage: true, connections: [account] } }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_local_extension', (route) =>
    route.fulfill({
      json: {
        binding: {
          externalAccountId: '123',
          expiresAt,
          revoked: false,
          lastSeenAt: now,
          inboxSyncedAt: now,
          messagesRead: true,
          messagesSend: true,
        },
      },
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_snapshot', (route) =>
    route.fulfill({
      json: {
        ...scope,
        profile: {
          ...scope,
          displayName: 'Lokales Testkonto',
          username: 'synthetic-test',
          location: 'Deutschland',
          bio: null,
          imageUrl,
        },
        publications: emptyPage(),
        conversations: { items: conversations, total: 2, nextCursor: null },
        sales: emptyPage(),
        activity: emptyPage(),
      },
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_page', async (route) => {
    const body = route.request().postDataJSON();
    if (body['p_kind'] !== 'message') return route.fallback();
    if (pendingStoredMessages) await pendingStoredMessages;
    if (body['p_parent_id'] === secondConversationId) return route.fulfill({ json: emptyPage() });
    return route.fulfill({
      json: {
        items: [
          ...(longHistory
            ? Array.from({ length: 24 }, (_, index) => ({
                ...scope,
                id: `25000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
                conversationId: body['p_parent_id'],
                title: 'Nachricht',
                text: `Ältere Nachricht ${index + 1}: Vielen Dank für Deine Rückmeldung zur Jacke.`,
                direction: index % 2 ? 'outbound' : 'inbound',
                occurredAt: now,
                messageType: 'text_message',
              }))
            : []),
          {
            ...scope,
            id: '25000000-0000-4000-8000-000000000061',
            conversationId: body['p_parent_id'],
            title: 'Nachricht',
            text: 'Ist die Jacke noch da?',
            direction: 'inbound',
            occurredAt: now,
            messageType: 'text_message',
          },
          {
            ...scope,
            id: '25000000-0000-4000-8000-000000000062',
            conversationId: body['p_parent_id'],
            title: 'Nachricht',
            text: 'Ja, sie ist verfügbar.',
            direction: 'outbound',
            occurredAt: now,
            messageType: 'text_message',
          },
          {
            ...scope,
            id: '25000000-0000-4000-8000-000000000063',
            conversationId: body['p_parent_id'],
            title: 'Preisangebot',
            text: 'Ein neues Angebot',
            direction: 'inbound',
            occurredAt: now,
            messageType: 'offer_request_message',
            offerStatus: 'rejected',
            priceLabel: '50,00 € statt 58,00 €',
            imageUrls: [imageUrl],
          },
          {
            ...scope,
            id: '25000000-0000-4000-8000-000000000064',
            conversationId: body['p_parent_id'],
            title: 'Verkauft',
            text: 'Verkauft',
            direction: 'unknown',
            occurredAt: now,
            messageType: 'status_message',
          },
        ].reverse(),
        total: longHistory ? 28 : 4,
        nextCursor: null,
      },
    });
  });
  await page.route('**/rest/v1/rpc/marketplace_read_local_messages', (route) =>
    route.fulfill({
      json: {
        ok: true,
        ...scope,
        messages: queue.filter(
          (message) =>
            message['conversationId'] === route.request().postDataJSON()['p_conversation_id'],
        ),
      },
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_enqueue_local_message', (route) => {
    const body = route.request().postDataJSON();
    enqueues.push(body);
    const message = {
      id: '25000000-0000-4000-8000-000000000071',
      requestId: body['p_request_id'],
      conversationId: body['p_conversation_id'],
      text: body['p_text'],
      state: 'queued',
      createdAt: now,
      updatedAt: now,
      externalMessageId: null,
      errorCode: null,
      attachment: null,
    };
    queue.push(message);
    return route.fulfill({ json: { ok: true, ...scope, message } });
  });
  return {
    enqueues,
    bridgeCalls,
    pauseStoredMessages() {
      pendingStoredMessages = new Promise<void>((resolve) => {
        finishStoredMessages = resolve;
      });
    },
    resumeStoredMessages() {
      finishStoredMessages?.();
      pendingStoredMessages = null;
    },
    pauseDetails() {
      pendingDetail = new Promise<void>((resolve) => {
        finishDetail = resolve;
      });
    },
    resumeDetails() {
      finishDetail?.();
      pendingDetail = null;
    },
    get providerRequests() {
      return providerRequests;
    },
  };
}

async function checkAxe(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(
    async () =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run(
          document.querySelector('app-vinted-messages') as Element,
        )
      ).violations,
  );
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('zeigt einen bekannten Chat sofort auch während Datenbank und Vinted noch aktualisieren @core-smoke', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const fixture = await inboxFixture(page);
  await page.goto('/marketplaces/vinted/messages');
  const rows = page.locator('[data-conversation-row]');
  await expect(rows).toHaveCount(2);
  const conversation = page.getByRole('region', { name: 'Gespräch', exact: true });
  await rows.nth(0).getByRole('button').click();
  await expect(conversation.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
  const firstMessageBounds = await conversation
    .locator('[data-message-kind]')
    .first()
    .boundingBox();
  fixture.pauseStoredMessages();
  fixture.pauseDetails();
  await rows.nth(1).getByRole('button').click();
  await expect(conversation.getByRole('heading', { name: 'Ben', exact: true })).toBeVisible();
  await expect(conversation.getByText('Blauer Schal', { exact: true })).toBeVisible();
  await expect(conversation.locator('[data-message-composer]')).toBeVisible();
  await expect(conversation.locator('[data-conversation-loading]')).toHaveCount(0);
  await expect(conversation.locator('[data-message-kind]')).toHaveCount(0);
  await expect(conversation.locator('[data-conversation-sync]')).toContainText('Wird aktualisiert');
  await expect(conversation.getByText('Nachrichten werden geladen', { exact: false })).toHaveCount(
    0,
  );
  fixture.resumeStoredMessages();
  await expect
    .poll(
      () =>
        fixture.bridgeCalls.filter((type) => type === 'FLIPBASE_VINTED_LOCAL_INBOX_DETAIL').length,
    )
    .toBe(2);
  await expect(conversation.locator('[data-conversation-loading]')).toHaveCount(0);
  await expect(conversation.locator('[data-message-kind]')).toHaveCount(0);
  await checkAxe(page);
  const screenshotDirectory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: join(screenshotDirectory, 'vinted-empty-chat-refreshing.png'),
      fullPage: true,
    });
  }
  fixture.resumeDetails();
  await expect(conversation.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
  fixture.pauseStoredMessages();
  fixture.pauseDetails();
  await rows.nth(0).getByRole('button').click();
  await expect(conversation.getByRole('heading', { name: 'Anna', exact: true })).toBeVisible();
  await expect(conversation.getByText('Vintage Lederjacke', { exact: true })).toBeVisible();
  await expect(conversation.getByRole('log')).toContainText('Abgelehnt');
  await expect(conversation.locator('[data-conversation-loading]')).toHaveCount(0);
  await expect(conversation.locator('[data-conversation-sync]')).toContainText('Wird aktualisiert');
  await expect(conversation.getByText('Nachrichten werden geladen', { exact: false })).toHaveCount(
    0,
  );
  expect((await conversation.locator('[data-message-kind]').first().boundingBox())?.y).toBe(
    firstMessageBounds?.y,
  );
  fixture.resumeStoredMessages();
  await expect
    .poll(
      () =>
        fixture.bridgeCalls.filter((type) => type === 'FLIPBASE_VINTED_LOCAL_INBOX_DETAIL').length,
    )
    .toBe(3);
  await expect(conversation.locator('[data-conversation-sync]')).toContainText('Wird aktualisiert');
  fixture.resumeDetails();
  await expect(conversation.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
  await checkAxe(page);
});

for (const { width, theme } of [
  { width: 1440, theme: 'light' },
  { width: 390, theme: 'light' },
  { width: 1440, theme: 'dark' },
  { width: 390, theme: 'dark' },
]) {
  test(`lokales Postfach mit Artikel, Suche, Filter und Versandwarteschlange ${width}px ${theme} @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const fixture = await inboxFixture(page, theme === 'dark');
    await page.goto('/marketplaces/vinted/messages');
    await expect(page.getByRole('heading', { name: 'Gespräche', exact: true })).toBeVisible({
      timeout: 15000,
    });
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Zu dunklem Design wechseln', exact: true }).click();
    const rows = page.locator('[data-conversation-row]');
    await expect(rows).toHaveCount(2);
    await checkAxe(page);
    const screenshotDirectory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      await page.screenshot({
        path: join(screenshotDirectory, `vinted-inbox-list-${width}-${theme}.png`),
        fullPage: true,
      });
    }
    await page.getByRole('button', { name: 'Nachrichten aktualisieren', exact: true }).click();
    await expect
      .poll(() => fixture.bridgeCalls.includes('FLIPBASE_VINTED_LOCAL_INBOX_SYNC'))
      .toBe(true);
    await expect(
      page.getByRole('button', { name: 'Nachrichten aktualisieren', exact: true }),
    ).toBeEnabled();
    const search = page.getByRole('searchbox', { name: 'Gespräche suchen' });
    await search.fill('Lederjacke');
    await expect(rows).toHaveCount(1);
    await search.fill('');
    await page.getByRole('combobox', { name: 'Gespräche filtern' }).click();
    await expect(
      page.getByRole('option', { name: 'Systemnachrichten (0)', exact: true }),
    ).toBeVisible();
    await page.getByRole('option', { name: 'Ungelesen (1)', exact: true }).click();
    await expect(rows).toHaveCount(1);
    fixture.pauseDetails();
    fixture.pauseStoredMessages();
    await rows.first().getByRole('button').click();
    const conversation = page.getByRole('region', { name: 'Gespräch', exact: true });
    await expect(conversation.locator('[data-conversation-loading]')).toHaveCount(0);
    await expect(conversation.getByRole('heading', { name: 'Anna', exact: true })).toBeVisible();
    await expect(conversation.locator('[data-conversation-item]')).toBeVisible();
    await expect(conversation.getByRole('log')).toBeVisible();
    await expect(conversation.locator('[data-message-composer]')).toBeVisible();
    await expect(conversation.locator('[data-conversation-sync]')).toContainText(
      'Wird aktualisiert',
    );
    await expect(
      conversation.getByText('Nachrichten werden geladen', { exact: false }),
    ).toHaveCount(0);
    if (screenshotDirectory)
      await page.screenshot({
        path: join(screenshotDirectory, `vinted-inbox-loading-${width}-${theme}.png`),
        fullPage: true,
      });
    fixture.resumeStoredMessages();
    await expect(conversation.getByRole('heading', { name: 'Anna', exact: true })).toBeVisible();
    await expect(conversation.locator('[data-conversation-loading]')).toHaveCount(0);
    await expect(conversation.getByRole('log')).toBeVisible();
    await expect(conversation.locator('[data-message-composer]')).toBeVisible();
    await expect(conversation.locator('[data-conversation-sync]')).toContainText(
      'Wird aktualisiert',
    );
    await checkAxe(page);
    if (screenshotDirectory)
      await page.screenshot({
        path: join(screenshotDirectory, `vinted-inbox-refreshing-${width}-${theme}.png`),
        fullPage: true,
      });
    fixture.resumeDetails();
    await expect(conversation.getByRole('heading', { name: 'Anna', exact: true })).toBeVisible();
    await expect(conversation.locator('[data-conversation-loading]')).toHaveCount(0);
    await expect(conversation.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
    await expect(conversation.getByText('Vintage Lederjacke', { exact: true })).toBeVisible();
    await expect(
      conversation.locator('[data-conversation-item]').getByText('58,00 €', { exact: true }),
    ).toBeVisible();
    await expect(conversation.getByRole('img', { name: 'Vintage Lederjacke' })).toBeVisible();
    await expect(conversation.getByText('Zuletzt aktiv', { exact: false })).toBeVisible();
    await expect(page.getByRole('log')).toContainText('50,00 €');
    await expect(page.getByRole('log').locator('del')).toHaveText('58,00 €');
    await expect(page.getByRole('log')).toContainText('Abgelehnt');
    await expect(page.locator('[data-message-kind="system"]')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(page.locator('[data-message-kind="system"]')).toHaveCSS('text-align', 'center');
    await expect(page.locator('[data-message-day]')).toHaveCount(1);
    await expect(page.locator('[data-message-day]')).toHaveText('Heute');
    const productImage = rows.first().locator('img');
    if (width >= 1024) await expect(productImage).toHaveCSS('object-fit', 'cover');
    const composer = conversation.locator('form');
    const composerBounds = await composer.boundingBox();
    const cardBounds = await conversation.locator('app-card').boundingBox();
    expect(composerBounds).not.toBeNull();
    expect(cardBounds).not.toBeNull();
    expect(
      (cardBounds?.y ?? 0) +
        (cardBounds?.height ?? 0) -
        ((composerBounds?.y ?? 0) + (composerBounds?.height ?? 0)),
    ).toBeLessThan(20);
    await expect(conversation.getByRole('textbox', { name: 'Deine Nachricht' })).toHaveAttribute(
      'rows',
      '1',
    );
    await expect(conversation.getByRole('textbox', { name: 'Deine Nachricht' })).toHaveCSS(
      'border-radius',
      '16px',
    );
    if (theme === 'dark') {
      const log = page.getByRole('log');
      expect(await log.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
        true,
      );
      const footerBeforeScroll = await composer.boundingBox();
      await log.evaluate((element) => {
        element.scrollTop = 0;
      });
      expect((await composer.boundingBox())?.y).toBe(footerBeforeScroll?.y);
    }
    await expect
      .poll(() => fixture.bridgeCalls.includes('FLIPBASE_VINTED_LOCAL_INBOX_DETAIL'))
      .toBe(true);
    await conversation
      .getByRole('textbox', { name: 'Deine Nachricht' })
      .fill('Testantwort\nmit zweiter Zeile');
    await conversation.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(page.locator('[data-queue-state="queued"]')).toContainText('Testantwort');
    expect(fixture.enqueues).toHaveLength(1);
    expect(fixture.enqueues[0]['p_text']).toBe('Testantwort\nmit zweiter Zeile');
    await expect
      .poll(() => fixture.bridgeCalls.includes('FLIPBASE_VINTED_LOCAL_MESSAGES_SEND'))
      .toBe(true);
    await expect(conversation.getByRole('textbox', { name: 'Deine Nachricht' })).toBeEmpty();
    if (width < 1024) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const sendButton = await conversation
        .getByRole('button', { name: 'Senden', exact: true })
        .boundingBox();
      const navigation = await page.locator('[data-shell-bottom-nav] nav').boundingBox();
      expect(sendButton).not.toBeNull();
      expect(navigation).not.toBeNull();
      expect((sendButton?.y ?? 0) + (sendButton?.height ?? 0)).toBeLessThanOrEqual(
        navigation?.y ?? 0,
      );
    }
    await checkAxe(page);
    const directory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
    if (directory) {
      await page.getByRole('log').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await mkdir(directory, { recursive: true });
      await page.screenshot({
        path: join(directory, `vinted-inbox-conversation-${width}-${theme}.png`),
        fullPage: true,
      });
    }
    if (width < 1024) {
      await page.getByRole('button', { name: 'Zur Gesprächsliste' }).click();
      await expect(page.getByRole('heading', { name: 'Gespräche', exact: true })).toBeVisible();
      await expect(page.getByRole('searchbox', { name: 'Gespräche suchen' })).toBeVisible();
    }
    expect(fixture.providerRequests).toBe(0);
    expect(errors).toEqual([]);
  });
}
