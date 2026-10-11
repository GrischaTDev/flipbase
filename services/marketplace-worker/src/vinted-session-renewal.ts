import { setTimeout as wait } from 'node:timers/promises';
import type { Page } from 'playwright';

/**
 * Vinted erneuert eine abgelaufene Anmeldung auf einer eigenen Zwischenseite und leitet danach
 * zurück. Meist dauert das eine Sekunde, am 11.10.2026 auf dem Server gemessen aber auch 61
 * Sekunden. Wer die Seite vorher verlässt, neu lädt oder den Browser schließt, bricht die
 * Erneuerung ab; das Konto wirkt dann abgemeldet, obwohl Vinted es nicht abgemeldet hat.
 */
export const vintedSessionRenewalWaitMs = 120_000;

export function isVintedSessionRenewal(page: Page): boolean {
  try {
    const address = new URL(page.url());
    return address.origin === 'https://www.vinted.de' && address.pathname === '/session-refresh';
  } catch {
    return false;
  }
}

/** Wartet auf das Ende der Erneuerung dieser Seite. `false`, wenn sie in der Zeit nicht endet. */
export async function waitForVintedSessionRenewal(
  page: Page,
  authorize: () => Promise<void>,
  maxWaitMs = vintedSessionRenewalWaitMs,
): Promise<boolean> {
  if (!isVintedSessionRenewal(page)) return true;
  const deadline = Date.now() + maxWaitMs;
  while (isVintedSessionRenewal(page)) {
    if (Date.now() >= deadline) return false;
    await wait(500);
    await authorize();
  }
  await page.waitForLoadState('load', { timeout: 20_000 });
  return true;
}

/**
 * Vor einer Aktion: Keine Seite des Browsers darf noch erneuern. Eine zweite Seite würde sonst
 * mit derselben abgelaufenen Anmeldung eine zweite Erneuerung auslösen.
 */
export async function waitForOpenVintedSessionRenewals(
  pages: () => Page[],
  maxWaitMs = vintedSessionRenewalWaitMs,
): Promise<void> {
  const renewing = pages().filter(isVintedSessionRenewal);
  if (!renewing.length) return;
  const deadline = Date.now() + maxWaitMs;
  while (renewing.some(isVintedSessionRenewal) && Date.now() < deadline) await wait(500);
  for (const page of renewing)
    if (!isVintedSessionRenewal(page))
      await page.waitForLoadState('load', { timeout: 20_000 }).catch(() => undefined);
}
