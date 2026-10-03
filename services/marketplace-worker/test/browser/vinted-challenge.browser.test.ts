import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { hasVisibleVintedChallenge } from '../../src/vinted-browser-challenge.ts';
import { submitVintedLogin } from '../../src/vinted-browser-login.ts';
import { readVintedAccountIdentity } from '../../src/vinted-browser-reader.ts';
import { submitVintedVerificationCode } from '../../src/vinted-browser-verification.ts';

test('detects visible human-check frames and text while ignoring hidden widgets and scripts', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    for (const body of [
      '<script>const captcha = "datadome geetest challenge";</script><p>Challenge accepted</p>',
      '<iframe hidden src="https://geo.captcha-delivery.com/captcha/"></iframe>',
      '<section style="opacity:0"><p>Bist du ein Mensch?</p></section>',
      '<p hidden>Verify you are human</p>',
      '<iframe src="https://normal.example/challenge/"></iframe>',
    ]) {
      await page.setContent(body);
      assert.equal(await hasVisibleVintedChallenge(page), false);
    }
    for (const body of [
      '<iframe src="https://geo.captcha-delivery.com/captcha/"></iframe>',
      '<h1>Bist du ein Mensch?</h1>',
      '<p>Verify you are human</p>',
      '<div role="slider" aria-label="Slide to verify" style="width:200px;height:30px"></div>',
    ]) {
      await page.setContent(body);
      assert.equal(await hasVisibleVintedChallenge(page), true);
    }
  } finally {
    await browser.close();
  }
});

test('reports a human check before waiting for absent login controls or submitting credentials', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let posts = 0;
    await page.route('**/*', (route) => {
      if (route.request().method() === 'POST') posts++;
      return route.fulfill({ contentType: 'text/html', body: '<h1>Are you human?</h1>' });
    });
    assert.equal(
      await submitVintedLogin(page, { username: 'synthetic', password: 'synthetic' }),
      'interaction_required',
    );
    assert.equal(posts, 0);
  } finally {
    await browser.close();
  }
});

for (const step of ['login', 'sms'] as const) {
  test(`detects a delayed human check after one explicit ${step} submission without identity fetch or retry`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      let submissions = 0;
      let identityFetches = 0;
      const loginForm =
        '<input name="username"><input name="password" type="password"><button type="submit">Weiter</button>';
      const smsForm =
        '<input name="code" autocomplete="one-time-code"><button type="submit">Bestätigen</button>';
      await page.route('**/*', (route) => {
        if (new URL(route.request().url()).pathname === '/api/v2/users/current') {
          identityFetches++;
          return route.fulfill({ status: 401 });
        }
        return route.fulfill({
          contentType: 'text/html',
          body: `<meta charset="utf-8"><form>${step === 'login' ? loginForm : smsForm}</form><script>
            document.querySelector('form').onsubmit = (event) => {
              event.preventDefault(); window.submissions = (window.submissions || 0) + 1;
              setTimeout(() => { document.body.innerHTML = '<h1>Bist du ein Mensch?</h1>'; }, 300);
            };
          </script>`,
        });
      });
      if (step === 'login') {
        assert.equal(
          await submitVintedLogin(page, { username: 'synthetic', password: 'synthetic' }),
          'submitted',
        );
      } else {
        await page.goto('https://www.vinted.de/member/login/2fa');
        assert.equal(
          await submitVintedVerificationCode(page, '123456', async () => undefined),
          'submitted',
        );
      }
      await page.getByRole('heading', { name: 'Bist du ein Mensch?' }).waitFor();
      submissions = await page.evaluate(() => Reflect.get(window, 'submissions') as number);
      await assert.rejects(readVintedAccountIdentity(page), {
        name: 'VintedInteractionRequiredError',
      });
      assert.equal(submissions, 1);
      assert.equal(identityFetches, 0);
    } finally {
      await browser.close();
    }
  });
}
