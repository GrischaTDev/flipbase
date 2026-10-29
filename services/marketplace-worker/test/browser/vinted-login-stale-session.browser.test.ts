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
  // Playwright-Routen fangen HTTP-Weiterleitungen nicht erneut ab. CDP beantwortet
  // jeden Schritt; das abgeschaltete Netz verhindert echte Anbieteranfragen.
  await context.setOffline(true);
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await context.addCookies(
    ['access_token_web', 'refresh_token_web', 'anon_id'].map((name) => ({
      name,
      value: 'stale',
      domain: '.vinted.de',
      path: '/',
    })),
  );
  session.on('Fetch.requestPaused', async ({ requestId, request }) => {
    const url = new URL(request.url);
    const fulfill = (status: number, body: string, headers: Record<string, string> = {}) =>
      session.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: status,
        responseHeaders: Object.entries({
          'content-type': 'text/html; charset=utf-8',
          ...headers,
        }).map(([name, value]) => ({ name, value })),
        body: Buffer.from(body).toString('base64'),
      });
    if (url.origin !== 'https://www.vinted.de') return fulfill(404, '');
    if (url.pathname === '/session-refresh')
      return fulfill(200, '<div role="progressbar">Lädt</div>');
    if (url.pathname === '/fixture/login') {
      submissions++;
      return fulfill(200, '{"ok":true}', { 'content-type': 'application/json' });
    }
    if (url.pathname !== '/member/login/email') return fulfill(404, '');
    loginRequests++;
    // Der Netzwerkstack ergänzt Cookie-Header erst nach der Request-Interception.
    const cookies = await context.cookies(url.href);
    const stale =
      options.alwaysRefresh ||
      cookies.some(({ name }) => name === 'access_token_web' || name === 'refresh_token_web');
    const target = '/session-refresh?ref_url=%2Fmember%2Flogin%2Femail';
    if (stale && !options.clientRedirect) return fulfill(302, '', { location: target });
    return fulfill(
      200,
      stale
        ? `<script>setTimeout(() => { location.href = '${target}'; }, 50);</script>`
        : `<input name="username"><input name="password" type="password"><button type="button" onclick="fetch('/fixture/login',{method:'POST'})">Weiter</button>`,
    );
  });
  await session.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  return { page, submissions: () => submissions, loginRequests: () => loginRequests };
}

for (const clientRedirect of [false, true])
  test(`discards rejected Vinted tokens once and reaches the login form (${clientRedirect ? 'client' : 'server'} redirect)`, async () => {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext(),
        f = await fixture(context, { clientRedirect });
      const page = f.page;
      const loginResponse = page.waitForResponse('**/fixture/login');
      await Promise.all([
        submitVintedLogin(page, credentials).then((result) => assert.equal(result, 'submitted')),
        loginResponse,
      ]);
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
    const page = f.page;
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
    const page = f.page;
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
