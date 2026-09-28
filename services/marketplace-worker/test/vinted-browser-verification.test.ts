import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { submitVintedVerificationCode } from '../src/vinted-browser-verification.ts';

function fixture(url = 'https://www.vinted.de/member/login/2fa', fields = 1) {
  const actions: string[] = [];
  const page = {
    url: () => url,
    locator: () => ({
      count: async () => fields,
      nth: (index: number) => ({
        isVisible: async () => true,
        fill: async (value: string) => actions.push(`fill:${index}:${value}`),
      }),
    }),
    getByRole: () => ({
      count: async () => 1,
      isVisible: async () => true,
      click: async () => actions.push('submit'),
    }),
  } as unknown as Page;
  return { page, actions };
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
  const { page, actions } = fixture();
  page.getByRole = (() => ({
    count: async () => 1,
    isVisible: async () => true,
    click: async () => {
      actions.push('submit');
      throw new Error('synthetic-secret');
    },
  })) as unknown as Page['getByRole'];
  assert.equal(
    await submitVintedVerificationCode(page, '123456', async () => undefined),
    'submission_unconfirmed',
  );
  assert.equal(actions.filter((action) => action === 'submit').length, 1);
});
