import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { submitVintedLogin } from '../../src/vinted-browser-login.ts';

test('real browser submits only to our intercepted fixture and keeps account contexts separate', async () => {
  const browser = await chromium.launch({ headless: true });
  const fixture = await readFile(new URL('../fixtures/vinted-login.html', import.meta.url), 'utf8');
  try {
    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    for (const [index, context] of contexts.entries()) {
      const submitted: string[] = [];
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== 'https://www.vinted.de') return route.abort();
        if (url.pathname === '/member/login/email')
          return route.fulfill({ contentType: 'text/html', body: fixture });
        if (url.pathname === '/synthetic-session') {
          submitted.push(request.postData() ?? '');
          return route.fulfill({
            contentType: 'text/html',
            body: '<h1>Eigene Testbestätigung</h1>',
            headers: { 'Set-Cookie': `synthetic_account=${index}; Path=/; Secure; HttpOnly` },
          });
        }
        return route.abort();
      });
      const page = await context.newPage();
      assert.equal(
        await submitVintedLogin(page, {
          username: `synthetic-${index}`,
          password: 'synthetic-only',
        }),
        'submitted',
      );
      await page.waitForURL('https://www.vinted.de/synthetic-session');
      assert.deepEqual(submitted, [`username=synthetic-${index}&password=synthetic-only`]);
      assert.equal(
        (await context.cookies()).find((cookie) => cookie.name === 'synthetic_account')?.value,
        String(index),
      );
    }
    assert.equal(
      (await contexts[0]!.cookies()).find((cookie) => cookie.name === 'synthetic_account')?.value,
      '0',
    );
  } finally {
    await browser.close();
  }
});

test('reports a visible rejected login without polling identity or retrying credentials', async () => {
  const { readVintedAccountIdentity } = await import('../../src/vinted-browser-reader.ts');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    let identityRequests = 0;
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).pathname === '/api/v2/users/current') {
        identityRequests++;
        return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
      }
      return route.fulfill({
        contentType: 'text/html',
        body: '<meta charset="utf-8"><main><h1>Log-in</h1><p>Ungültiger Mitgliedsname oder Passwort</p><input name="username"><input name="password" type="password"></main>',
      });
    });
    const page = await context.newPage();
    await page.goto('https://www.vinted.de/member/login/email');
    await assert.rejects(readVintedAccountIdentity(page), /Zugangsdaten/);
    assert.equal(identityRequests, 0);
  } finally {
    await browser.close();
  }
});
