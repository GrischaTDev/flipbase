import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import {
  parseVintedAccountIdentity,
  readVintedAccountIdentity,
} from '../src/vinted-browser-reader.ts';

test('bestätigt nur eine numerische ID und einen gültigen Nutzernamen', () => {
  assert.deepEqual(parseVintedAccountIdentity({ user: { id: 12345, login: 'mein-konto' } }), {
    id: '12345',
    username: 'mein-konto',
  });
  assert.equal(parseVintedAccountIdentity({ user: { id: 0, login: 'mein-konto' } }), null);
  assert.equal(
    parseVintedAccountIdentity({ user: { id: Number.MAX_SAFE_INTEGER + 1, login: 'mein-konto' } }),
    null,
  );
  assert.equal(parseVintedAccountIdentity({ user: { id: 12345, login: ' ' } }), null);
  assert.equal(parseVintedAccountIdentity({ user: { id: 12345, login: 'a\n' } }), null);
  assert.equal(parseVintedAccountIdentity({ user: { id: 12345 } }), null);
});

test('liest Identität nur auf der festen Vinted-Domain und gibt keine Rohdaten weiter', async () => {
  let calls = 0;
  const page = {
    url: () => 'https://www.vinted.de/',
    evaluate: async () => {
      calls++;
      return { user: { id: 12345, login: 'mein-konto', email: 'secret@example.test' } };
    },
  } as unknown as Pick<Page, 'url' | 'evaluate'>;
  assert.deepEqual(await readVintedAccountIdentity(page), {
    id: '12345',
    username: 'mein-konto',
  });
  assert.equal(calls, 1);
  assert.equal(
    await readVintedAccountIdentity({ ...page, url: () => 'https://vinted.de.attacker.test/' }),
    null,
  );
  assert.equal(calls, 1);
});

test('meldet ein weiterhin sichtbares Vinted-Anmeldeformular als eigenen Prüfzustand', async () => {
  const page = {
    url: () => 'https://www.vinted.de/member/login/email',
    evaluate: async () => ({ loginPending: true }),
  } as unknown as Pick<Page, 'url' | 'evaluate'>;
  await assert.rejects(readVintedAccountIdentity(page), {
    name: 'VintedLoginPendingError',
  });
});

test('meldet die zweite Vinted-Anmeldestufe ohne Identitätsabruf als Codeanforderung', async () => {
  let fetched = false;
  const page = {
    url: () => 'https://www.vinted.de/member/login/2fa',
    evaluate: async () => {
      fetched = true;
      return null;
    },
  } as unknown as Pick<Page, 'url' | 'evaluate'>;
  await assert.rejects(readVintedAccountIdentity(page), {
    name: 'VintedVerificationRequiredError',
  });
  assert.equal(fetched, false);
});
