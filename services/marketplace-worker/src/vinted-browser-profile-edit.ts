import type { Page } from 'playwright';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import type { VintedEditResult } from './vinted-browser-listing-edit.ts';
import { confirmVintedEdit } from './vinted-edit-confirmation.ts';

const url = 'https://www.vinted.de/settings/profile';

async function openProfile(page: Page, accountId: string): Promise<void> {
  const identity = await readVintedAccountIdentity(page);
  if (!identity || identity.id !== accountId) throw new Error('Vinted-Konto stimmt nicht überein');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  if (
    new URL(page.url()).origin !== 'https://www.vinted.de' ||
    new URL(page.url()).pathname !== '/settings/profile'
  )
    throw new Error('Profilformular nicht verfügbar');
  await page.locator('textarea[name="about"]').waitFor({ state: 'visible', timeout: 15_000 });
}

export async function readVintedProfileAbout(page: Page, accountId: string): Promise<string> {
  await openProfile(page, accountId);
  return page.locator('textarea[name="about"]').inputValue();
}

export async function updateVintedProfileAbout(
  page: Page,
  accountId: string,
  about: string,
  authorize: () => Promise<void>,
  expectedAbout?: string,
): Promise<VintedEditResult> {
  await openProfile(page, accountId);
  if (
    expectedAbout !== undefined &&
    (await page.locator('textarea[name="about"]').inputValue()) !== expectedAbout
  )
    return 'conflict';
  await page.locator('textarea[name="about"]').fill(about);
  const save = page.getByRole('button', { name: 'Profil aktualisieren', exact: true });
  if (!(await save.isVisible()) || !(await save.isEnabled()))
    throw new Error('Profilspeichern nicht verfügbar');
  await authorize();
  try {
    await save.click({ timeout: 10_000 });
  } catch {
    // Auch bei Klick-Timeout kann die Änderung bereits gesendet worden sein.
    return 'unconfirmed';
  }
  return confirmVintedEdit(
    () => readVintedProfileAbout(page, accountId),
    (saved) => saved === about,
  );
}
