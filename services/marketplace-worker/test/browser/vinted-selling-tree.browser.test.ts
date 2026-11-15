import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import {
  readVintedSellingTree,
  readVintedSellingTreeFromCurrentPage,
} from '../../src/vinted-browser-selling-tree.ts';
for (const foreign of [false, true])
  test(`reads a native account tree without provider writes (foreign=${foreign})`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      let writes = 0;
      await page.route('**/*', (route) => {
        if (route.request().method() !== 'GET') writes++;
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/v2/users/current')
          return route.fulfill({
            json: { user: { id: foreign ? '456' : '123', login: 'fixture' } },
          });
        if (path === '/api/v2/item_upload/catalogs')
          return route.fulfill({
            json: {
              catalogs: [
                {
                  id: 5496,
                  title: 'Modeaccessoires',
                  catalogs: [{ id: 5555, title: 'Schals', catalogs: [] }],
                },
              ],
            },
          });
        if (path === '/items/new')
          return route.fulfill({
            contentType: 'text/html',
            body: '<main></main><script>fetch("/api/v2/item_upload/catalogs")</script>',
          });
        return route.abort();
      });
      const result = readVintedSellingTree(page, '123', async () => undefined);
      if (foreign) await assert.rejects(result, /Konto/);
      else
        assert.deepEqual(
          (await result).map((category) => category.id),
          [5496, 5555],
        );
      assert.equal(writes, 0);
      assert.equal(page.isClosed(), true);
    } finally {
      await browser.close();
    }
  });

for (const foreign of [false, true])
  test(`reads the selling tree directly on the open main page without opening /items/new (foreign=${foreign})`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      let writes = 0;
      let newItemPageLoads = 0;
      await page.route('**/*', (route) => {
        if (route.request().method() !== 'GET') writes++;
        const path = new URL(route.request().url()).pathname;
        if (path === '/')
          return route.fulfill({
            contentType: 'text/html',
            body: '<main></main>',
          });
        if (path === '/items/new') {
          newItemPageLoads++;
          return route.abort();
        }
        if (path === '/api/v2/users/current')
          return route.fulfill({
            json: { user: { id: foreign ? '456' : '123', login: 'fixture' } },
          });
        if (path === '/api/v2/item_upload/catalogs')
          return route.fulfill({
            json: {
              catalogs: [
                {
                  id: 5496,
                  title: 'Modeaccessoires',
                  catalogs: [{ id: 5555, title: 'Schals', catalogs: [] }],
                },
              ],
            },
          });
        return route.abort();
      });
      await page.goto('https://www.vinted.de/', { waitUntil: 'domcontentloaded' });
      const result = readVintedSellingTreeFromCurrentPage(page, '123', async () => undefined);
      if (foreign) await assert.rejects(result, /Konto/);
      else
        assert.deepEqual(
          (await result).map((category) => category.id),
          [5496, 5555],
        );
      assert.equal(writes, 0);
      assert.equal(newItemPageLoads, 0);
      assert.equal(page.isClosed(), false);
    } finally {
      await browser.close();
    }
  });
