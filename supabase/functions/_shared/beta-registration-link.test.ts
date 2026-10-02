import {
  createBetaRegistrationToken,
  hashBetaRegistrationToken,
  buildBetaRegistrationUrl,
} from './beta-registration-link.ts';
import {
  deepStrictEqual as assertEquals,
  notDeepStrictEqual as assertNotEquals,
  match as assertMatch,
} from 'node:assert';

Deno.test('Beta-Links sind zufällig und werden nur als Hash gespeichert', async () => {
  const first = createBetaRegistrationToken();
  assertMatch(first, /^[A-Za-z0-9_-]{43}$/u);
  assertNotEquals(first, createBetaRegistrationToken());
  assertEquals(
    await hashBetaRegistrationToken('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
Deno.test('Der Beta-Link hält das Geheimnis aus HTTP-URL und Suchparametern heraus', () => {
  const url = new URL(buildBetaRegistrationUrl('https://app.flipbase.de/', 'secret'));
  assertEquals(url.pathname, '/auth/set-password');
  assertEquals(url.search, '');
  assertEquals(url.hash, '#beta_token=secret');
});
