import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { submitVintedLogin } from '../src/vinted-browser-login.ts';

function pageFixture(origin = 'https://www.vinted.de', missingForm = false) {
  const actions: string[] = [];
  const page = {
    url: () => `${origin}/member/login/email`,
    evaluate: async () => false,
    goto: async (url: string) => {
      actions.push(url);
    },
    addLocatorHandler: async () => undefined,
    removeLocatorHandler: async () => undefined,
    locator: (selector: string) => ({
      count: async () => (missingForm ? 0 : 1),
      isVisible: async () => !missingForm && selector !== '#onetrust-reject-all-handler',
      waitFor: async () => {
        if (missingForm) throw new Error('timeout');
      },
      fill: async (value: string) => {
        actions.push(`${selector}:${value}`);
      },
    }),
    getByRole: () => ({
      count: async () => (missingForm ? 0 : 1),
      isVisible: async () => !missingForm,
      waitFor: async () => {
        if (missingForm) throw new Error('timeout');
      },
      click: async () => {
        actions.push('submit');
      },
    }),
  } as unknown as Page;
  return { page, actions };
}

test('submits credentials once to the fixed Vinted login form', async () => {
  const { page, actions } = pageFixture();
  assert.equal(
    await submitVintedLogin(page, { username: 'own-test', password: 'synthetic' }),
    'submitted',
  );
  assert.deepEqual(actions, [
    'https://www.vinted.de/member/login/email',
    'input[name="username"]:own-test',
    'input[name="password"][type="password"]:synthetic',
    'submit',
  ]);
});

test('detects a visible human check before entering or submitting credentials', async () => {
  const { page, actions } = pageFixture();
  page.evaluate = (async () => true) as unknown as Page['evaluate'];
  assert.equal(
    await submitVintedLogin(page, { username: 'synthetic', password: 'synthetic' }),
    'interaction_required',
  );
  assert.deepEqual(actions, ['https://www.vinted.de/member/login/email']);
});

test('never enters credentials after a redirect to another origin', async () => {
  const { page, actions } = pageFixture('https://untrusted.example');
  assert.equal(
    await submitVintedLogin(page, { username: 'own-test', password: 'synthetic' }),
    'form_unavailable',
  );
  assert.equal(actions.length, 1);
});

test('leaves an unexpected form or challenge for the user without entering credentials', async () => {
  const { page, actions } = pageFixture(undefined, true);
  assert.equal(
    await submitVintedLogin(page, { username: 'own-test', password: 'synthetic' }),
    'form_unavailable',
  );
  assert.equal(actions.length, 1);
});

test('does not repeat submission or expose credentials on an ambiguous error', async () => {
  const { page } = pageFixture();
  let submissions = 0;
  page.getByRole = (() => ({
    count: async () => 1,
    isVisible: async () => true,
    waitFor: async () => undefined,
    click: async () => {
      submissions++;
      throw new Error('synthetic-secret');
    },
  })) as unknown as Page['getByRole'];
  assert.equal(
    await submitVintedLogin(page, { username: 'own-test', password: 'synthetic-secret' }),
    'submission_unconfirmed',
  );
  assert.equal(submissions, 1);
});

test('rechecks permission after navigation before sending credentials', async () => {
  const { page, actions } = pageFixture();
  let checks = 0;
  const result = await submitVintedLogin(
    page,
    { username: 'synthetic', password: 'synthetic' },
    async () => {
      if (++checks > 1) throw new Error('expired');
    },
  );
  assert.equal(result, 'form_unavailable');
  assert.equal(actions.length, 1);
});
