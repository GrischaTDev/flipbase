import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { vintedBrowserActions } from '../../src/vinted-browser-actions.ts';

test('the shared browser adapter drags a local range using only supplied coordinates', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.route('**/*', (route) => route.abort());
    await page.setContent(
      await readFile(new URL('../fixtures/browser-drag.html', import.meta.url), 'utf8'),
    );
    const actions = vintedBrowserActions(browser);
    assert.ok(actions.drag);
    await actions.drag([
      { x: 0.135, y: 0.2, elapsedMs: 0 },
      { x: 0.375, y: 0.2, elapsedMs: 50 },
      { x: 0.6, y: 0.2, elapsedMs: 100 },
    ]);
    assert.ok(Number(await page.getByRole('slider').inputValue()) > 80);
  } finally {
    await browser.close();
  }
});
