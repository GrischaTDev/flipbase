import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { readVintedAccountImport } from '../../src/vinted-account-import.ts';

test('beendet das Postfach nach 80 Gesprächen trotz fortlaufend wachsender Seitenangabe', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const inboxPages: number[] = [];
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== 'https://www.vinted.de') throw new Error('Unerwartetes Testziel');
      if (url.pathname === '/')
        return route.fulfill({ contentType: 'text/html', body: '<body>Testkonto</body>' });
      if (url.pathname === '/api/v2/users/current')
        return route.fulfill({ json: { user: { id: 123, login: 'testkonto' } } });
      if (url.pathname === '/api/v2/inbox') {
        const pageNumber = Number(url.searchParams.get('page'));
        inboxPages.push(pageNumber);
        return route.fulfill({
          json: {
            conversations: Array.from({ length: pageNumber <= 4 ? 20 : 0 }, (_, index) => ({
              id: (pageNumber - 1) * 20 + index + 1,
              unread: true,
            })),
            pagination: {
              page: pageNumber,
              current_page: pageNumber,
              per_page: 20,
              total_entries: (pageNumber + 1) * 20,
              total_pages: pageNumber + 1,
            },
          },
        });
      }
      if (url.pathname === '/api/v2/wardrobe/123/items')
        return route.fulfill({ json: { items: [], pagination: { total_pages: 1 } } });
      if (url.pathname === '/api/v2/feedbacks')
        return route.fulfill({ json: { user_feedbacks: [], pagination: { total_pages: 1 } } });
      throw new Error('Unerwartete Testanfrage');
    });
    await page.goto('https://www.vinted.de/');
    const snapshot = await readVintedAccountImport(page, async () => undefined);
    assert.deepEqual(snapshot.areas.conversations, { status: 'complete' });
    assert.deepEqual(inboxPages, [1, 2, 3, 4, 5]);
    assert.equal(snapshot.entries.filter((entry) => entry.kind === 'conversation').length, 80);
    assert.equal(snapshot.areas.messages.failure, undefined);
    assert.equal(snapshot.areas.sales.failure, undefined);
  } finally {
    await browser.close();
  }
});
