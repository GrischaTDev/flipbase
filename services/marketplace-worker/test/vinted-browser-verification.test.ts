import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { submitVintedVerificationCode } from '../src/vinted-browser-verification.ts';

function fixture(url = 'https://www.vinted.de/member/login/2fa', fields = 1, submitButtons = 1) {
  const actions: string[] = [];
  const submit = {
    count: async () => submitButtons,
    isVisible: async () => true,
    isEnabled: async () => true,
    click: async () => actions.push('submit'),
  };
  const form = {
    count: async () => 1,
    locator: (selector: string) =>
      selector.startsWith('button[type="submit"]') ? submit : { count: async () => fields },
  };
  const page = {
    url: () => url,
    evaluate: async () => false,
    locator: () => ({
      count: async () => fields,
      first: () => ({ locator: () => form }),
      nth: (index: number) => ({
        isVisible: async () => true,
        fill: async (value: string) => actions.push(`fill:${index}:${value}`),
      }),
    }),
  } as unknown as Page;
  return { page, actions, submit };
}

test('sendet einen SMS-Code nur einmal auf der festen Vinted-Zweitfaktor-Seite', async () => {
  const { page, actions } = fixture();
  let checks = 0;
  assert.equal(
    await submitVintedVerificationCode(page, '123456', async () => {
      checks++;
    }),
    'submitted',
  );
  assert.deepEqual(actions, ['fill:0:123456', 'submit']);
  assert.equal(checks, 3);
});

test('does not send an SMS code while a visible human check blocks the page', async () => {
  const { page, actions } = fixture();
  page.evaluate = (async (callback: () => unknown) =>
    callback.name === 'detectVisibleVintedChallenge') as unknown as Page['evaluate'];
  assert.equal(
    await submitVintedVerificationCode(page, '123456', async () => undefined),
    'interaction_required',
  );
  assert.deepEqual(actions, []);
});

test('sendet keinen SMS-Code, wenn Vinted die Sitzung blockiert hat', async () => {
  const { page, actions } = fixture();
  page.evaluate = (async (callback: () => unknown) =>
    callback.name === 'detectVisibleVintedSessionBlock') as unknown as Page['evaluate'];
  assert.equal(
    await submitVintedVerificationCode(page, '123456', async () => undefined),
    'session_blocked',
  );
  assert.deepEqual(actions, []);
});

test('unterstützt sechs einzelne Codefelder ohne automatische Wiederholung', async () => {
  const { page, actions } = fixture(undefined, 6);
  assert.equal(
    await submitVintedVerificationCode(page, '123456', async () => undefined),
    'submitted',
  );
  assert.deepEqual(actions, [
    'fill:0:1',
    'fill:1:2',
    'fill:2:3',
    'fill:3:4',
    'fill:4:5',
    'fill:5:6',
    'submit',
  ]);
});

test('verweigert fremde Seiten und abgelaufene Berechtigungen vor der Eingabe', async () => {
  const other = fixture('https://vinted.de.attacker.test/member/login/2fa');
  assert.equal(
    await submitVintedVerificationCode(other.page, '123456', async () => undefined),
    'form_unavailable',
  );
  assert.deepEqual(other.actions, []);
  const expired = fixture();
  assert.equal(
    await submitVintedVerificationCode(expired.page, '123456', async () => {
      throw new Error('expired');
    }),
    'form_unavailable',
  );
  assert.deepEqual(expired.actions, []);
});

test('meldet unklaren Versand, ohne den Code erneut zu senden', async () => {
  const { page, actions, submit } = fixture();
  submit.click = async () => {
    actions.push('submit');
    throw new Error('synthetic-secret');
  };
  assert.equal(
    await submitVintedVerificationCode(page, '123456', async () => undefined),
    'submission_unconfirmed',
  );
  assert.equal(actions.filter((action) => action === 'submit').length, 1);
});

test('verweigert den Versand, wenn das Codeformular keinen eindeutigen Submit-Button hat', async () => {
  const { page, actions } = fixture(undefined, 1, 0);
  assert.equal(
    await submitVintedVerificationCode(page, '1234', async () => undefined),
    'form_unavailable',
  );
  assert.deepEqual(actions, []);
});
