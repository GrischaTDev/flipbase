import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type BrowserContext } from 'playwright';
import { submitVintedLogin } from '../../src/vinted-browser-login.ts';

const credentials = { username: 'synthetic', password: 'synthetic' };

/** Vinted leitet mit abgelehnten Anmeldedaten auf eine Erneuerungsseite um, die nie fertig lädt. */
async function fixture(
  context: BrowserContext,
  options: { clientRedirect?: boolean; alwaysRefresh?: boolean } = {},
) {
  let submissions = 0,
    loginRequests = 0;
  await context.addCookies(
    ['access_token_web', 'refresh_token_web', 'anon_id'].map((name) => ({
      name,
      value: 'stale',
      domain: '.vinted.de',
      path: '/',
    })),
  );
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const cookies = (await route.request().headerValue('cookie')) ?? '';
    const stale = options.alwaysRefresh || /(?:access|refresh)_token_web=/.test(cookies);
    if (url.pathname === '/session-refresh')
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<div role="progressbar">Lädt</div>',
      });
    if (url.pathname === '/fixture/login') {
      submissions++;
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname !== '/member/login/email') return route.fulfill({ status: 404, body: '' });
    loginRequests++;
    const target = '/session-refresh?ref_url=%2Fmember%2Flogin%2Femail';
    if (stale && !options.clientRedirect)
      return route.fulfill({ status: 302, headers: { location: target } });
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: stale
        ? `<script>setTimeout(() => { location.href = '${target}'; }, 50);</script>`
        : `<input name="username"><input name="password" type="password"><button type="button" onclick="fetch('/fixture/login',{method:'POST'})">Weiter</button>`,
    });
  });
  return { submissions: () => submissions, loginRequests: () => loginRequests };
}

for (const clientRedirect of [false, true])
  test(`discards rejected Vinted tokens once and reaches the login form (${clientRedirect ? 'client' : 'server'} redirect)`, async () => {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext(),
        f = await fixture(context, { clientRedirect });
      const page = await context.newPage();
      assert.equal(await submitVintedLogin(page, credentials), 'submitted');
      await page.waitForResponse('**/fixture/login');
      assert.equal(f.submissions(), 1);
      assert.equal(f.loginRequests(), 2);
      const names = (await context.cookies('https://www.vinted.de')).map((cookie) => cookie.name);
      // Nur die abgelehnte Anmeldung wird verworfen; Geräte- und Schutzcookies bleiben.
      assert.equal(names.includes('anon_id'), true);
      assert.equal(
        names.some((name) => name.endsWith('_token_web')),
        false,
      );
    } finally {
      await browser.close();
    }
  });

test('stops after one retry when Vinted keeps redirecting and never submits credentials', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext(),
      f = await fixture(context, { alwaysRefresh: true });
    const page = await context.newPage();
    assert.equal(await submitVintedLogin(page, credentials), 'form_unavailable');
    assert.equal(f.loginRequests(), 2);
    assert.equal(f.submissions(), 0);
  } finally {
    await browser.close();
  }
});

test('does not discard tokens when authority was revoked', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext(),
      f = await fixture(context);
    const page = await context.newPage();
    let checks = 0;
    assert.equal(
      await submitVintedLogin(page, credentials, async () => {
        if (++checks > 2) throw new Error('revoked');
      }),
      'form_unavailable',
    );
    assert.equal(f.loginRequests(), 1);
    const names = (await context.cookies('https://www.vinted.de')).map((cookie) => cookie.name);
    assert.equal(names.includes('access_token_web') && names.includes('refresh_token_web'), true);
  } finally {
    await browser.close();
  }
});
