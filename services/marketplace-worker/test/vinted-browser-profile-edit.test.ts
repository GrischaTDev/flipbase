import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { updateVintedProfileAbout } from '../src/vinted-browser-profile-edit.ts';

test('veralteter Profiltext wird vor dem Speicherklick abgewiesen', async () => {
  let clicks = 0;
  let authorizations = 0;
  let currentUrl = 'https://www.vinted.de/';
  const page = {
    url: () => currentUrl,
    evaluate: async () => ({ user: { id: 123, login: 'testkonto' } }),
    goto: async (url: string) => {
      currentUrl = url;
    },
    locator: () => ({
      waitFor: async () => undefined,
      inputValue: async () => 'Aktueller Text',
      fill: async () => {
        throw new Error('Darf nicht ausfüllen');
      },
    }),
    getByRole: () => ({
      isVisible: async () => true,
      isEnabled: async () => true,
      click: async () => {
        clicks += 1;
      },
    }),
  } as unknown as Page;
  const result = await updateVintedProfileAbout(
    page,
    '123',
    'Neuer Text',
    async () => {
      authorizations += 1;
    },
    'Alter Text',
  );
  assert.equal(result, 'conflict');
  assert.equal(clicks, 0);
  assert.equal(authorizations, 0);
});
