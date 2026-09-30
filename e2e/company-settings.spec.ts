import { type Page } from '@playwright/test';
import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';

const horizontalOverflow = () =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth;

async function openCompanySettings(page: Page): Promise<void> {
  await openDashboard(page);
  await page.goto('/settings/company');
  await expect(page.getByRole('heading', { name: 'Unternehmen', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Unternehmensprofil', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Geschäftsanschrift', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Steuerdaten', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bankverbindung', exact: true })).toBeVisible();
}

test('company settings stay usable on desktop and mobile @pr-smoke', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await openCompanySettings(page);

    await expect
      .poll(() => page.evaluate(horizontalOverflow), {
        message: `Unternehmenseinstellungen dürfen bei ${viewport.width}px nicht horizontal überlaufen`,
      })
      .toBe(0);

    await expect(page.getByText('Rechnungsdaten unvollständig', { exact: true })).toBeVisible();

    const mailing = page.getByRole('checkbox', {
      name: 'Abweichende Postanschrift verwenden',
      exact: true,
    });
    await mailing.click();
    await expect(page.getByLabel('Postanschrift Straße', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Postanschrift Ort', { exact: true })).toBeVisible();
  }
});

test('company settings block workspace switching only while dirty', async ({ page }) => {
  await openCompanySettings(page);

  const workspaceSelector = page.locator('button[aria-controls="header-workspace-menu"]');
  await expect(workspaceSelector).toBeEnabled();

  await page.getByLabel('Unternehmensname', { exact: true }).fill('E2E Unternehmen');
  await expect(
    page.getByRole('button', { name: 'Änderungen speichern', exact: true }),
  ).toBeEnabled();
  await expect(workspaceSelector).toBeDisabled();

  await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(workspaceSelector).toBeEnabled();
  await expect(page.getByLabel('Unternehmensname', { exact: true })).toHaveValue('');
});

test('company settings remain visible in light and dark themes', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.addInitScript((value) => localStorage.setItem('flipbase_theme', value), theme);
    await openCompanySettings(page);

    await expect(page.getByText('Unternehmenslogo', { exact: true })).toBeVisible();
    await expect(
      page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]'),
    ).toHaveCount(1);
  }
});

test('company settings have no automated WCAG AA violations @pr-smoke', async ({ page }) => {
  await openCompanySettings(page);
  await page.addScriptTag({ content: axe.source });

  const accessibility = await page.evaluate(async () =>
    (window as Window & { axe: typeof axe }).axe.run(document.body, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    }),
  );

  expect(accessibility.violations).toEqual([]);
});
