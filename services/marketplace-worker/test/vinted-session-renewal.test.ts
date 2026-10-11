import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import type { BrowserConnection } from '../src/gologin-cloud-browser.ts';
import { vintedBrowserActions } from '../src/vinted-browser-actions.ts';
import { waitForVintedSessionRenewal } from '../src/vinted-session-renewal.ts';

const renewalUrl = 'https://www.vinted.de/session-refresh?ref_url=%2F';

function renewingPage(pollsUntilRenewed: number, events: string[]): Page {
  let polls = 0;
  return {
    url: () => (polls++ < pollsUntilRenewed ? renewalUrl : 'https://www.vinted.de/'),
    waitForLoadState: async () => {
      events.push('renewed');
    },
    goto: async () => {
      events.push('navigate');
      throw new Error('Ende des Tests');
    },
  } as unknown as Page;
}

test('Aktionen beginnen erst nach Vinteds Erneuerung der Anmeldung', async () => {
  const events: string[] = [];
  const page = renewingPage(3, events);
  const connection = {
    close: async () => undefined,
    version: () => 'test',
    contexts: () => [{ pages: () => [page] }],
  } as unknown as BrowserConnection;
  await assert.rejects(
    Promise.resolve(vintedBrowserActions(connection).readListingEdit?.('1', '2')),
  );
  // Die Aktion selbst scheitert an der Testseite; entscheidend ist, dass vorher gewartet wurde.
  assert.equal(events[0], 'renewed');
});

test('eine unfertige Erneuerung wird nach der Wartezeit gemeldet, ohne neu zu laden', async () => {
  const events: string[] = [];
  const page = renewingPage(Number.POSITIVE_INFINITY, events);
  assert.equal(await waitForVintedSessionRenewal(page, async () => undefined, 600), false);
  assert.deepEqual(events, []);
});

test('ohne Erneuerungsseite wird nicht gewartet', async () => {
  const events: string[] = [];
  const startedAt = Date.now();
  assert.equal(
    await waitForVintedSessionRenewal(renewingPage(0, events), async () => undefined),
    true,
  );
  assert.ok(Date.now() - startedAt < 200);
  assert.deepEqual(events, []);
});
