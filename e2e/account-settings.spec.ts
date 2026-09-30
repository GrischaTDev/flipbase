import { type Page } from '@playwright/test';
import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';

const horizontalOverflow = () =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth;

async function openAccountSettings(page: Page): Promise<void> {
  await openDashboard(page);
  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { name: 'Konto', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sicherheit', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sitzungen', exact: true })).toBeVisible();
}

test('account settings stay usable on desktop and mobile @pr-smoke', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await openAccountSettings(page);

    await expect
      .poll(() => page.evaluate(horizontalOverflow), {
        message: `Kontoeinstellungen dürfen bei ${viewport.width}px nicht horizontal überlaufen`,
      })
      .toBe(0);

    await page.getByRole('button', { name: 'Passwort ändern', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Passwort ändern' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Aktuelles Passwort')).toBeVisible();
    await expect(page.getByLabel('Neues Passwort', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Neues Passwort wiederholen')).toBeVisible();

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(viewport.height);

    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test('account settings remain visible in light and dark themes', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.addInitScript((value) => localStorage.setItem('flipbase_theme', value), theme);
    await openAccountSettings(page);

    await expect(page.getByText('Dieser Browser', { exact: true })).toBeVisible();
    await expect(page.getByText('Noch nicht eingerichtet', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Passwort ändern', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Passwort ändern' })).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  }
});

test('account settings have no automated WCAG AA violations @pr-smoke', async ({ page }) => {
  await openAccountSettings(page);
  await page.addScriptTag({ content: axe.source });

  let accessibility = await page.evaluate(async () =>
    (window as Window & { axe: typeof axe }).axe.run(document.body, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    }),
  );
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('button', { name: 'Passwort ändern', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Passwort ändern' })).toBeVisible();

  accessibility = await page.evaluate(async () =>
    (window as Window & { axe: typeof axe }).axe.run(document.body, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    }),
  );
  expect(accessibility.violations).toEqual([]);
});
