import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import axe from 'axe-core';
import { expect, test } from './support/fixtures';
import { CLOTHING_SIZE_TABLES } from '../src/app/features/brand-labels/models/clothing-size-catalog';

async function choose(page: Page, name: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function capture(page: Page, filename: string): Promise<void> {
  const directory = process.env['CLOTHING_SIZE_SCREENSHOT_DIR'];
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, filename), fullPage: true });
}

async function checkAccessibility(page: Page): Promise<void> {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const runtime = window as Window & { axe: typeof axe };
    const result = await runtime.axe.run('app-clothing-size-guide', {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target),
    }));
  });
  expect(violations).toEqual([]);
}

test('zeigt gefüllte Größentabellen und grenzt Kleidungsmaße ohne Körpermaßtreffer ein @core-smoke', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/tools/brand-labels/sizes');
  await expect(
    page.getByRole('heading', { name: 'Größen nachschlagen', exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-size-table]')).toHaveCount(CLOTHING_SIZE_TABLES.length);
  await expect(
    page.getByRole('heading', { name: 'Maße der fertigen Kleidung', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Labelgrößen vergleichen', exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-size-match]')).toHaveCount(0);
  await checkAccessibility(page);
  await capture(page, 'size-guide-desktop.png');

  const garmentTable = CLOTHING_SIZE_TABLES.find(
    (table) => table.kind === 'garment' && table.category === 'trousers',
  );
  const garmentRow = garmentTable?.rows.find((row) => row.measurements?.waistFlat);
  const waist = garmentRow?.measurements?.waistFlat;
  if (!garmentTable || !garmentRow || !waist)
    throw new Error('Belegte Hosenmaße fehlen im Größenkatalog.');
  await choose(page, 'Nach Kleidungsart filtern', 'Hosen & Jeans');
  await choose(page, 'Nach Marke oder Größensystem filtern', garmentTable.brand);
  await page
    .getByRole('spinbutton', { name: 'Bundweite, flach in Zentimetern', exact: true })
    .fill(String((waist.min + waist.max) / 2));
  await page
    .getByRole('spinbutton', { name: 'Suchspielraum in Zentimetern', exact: true })
    .fill('0');
  const target = page.locator(`[data-size-table="${garmentTable.id}"]`);
  await expect(target.locator(`[data-size-match="${garmentRow.id}"]`)).toBeVisible();
  await expect(target.getByText('Treffer', { exact: true }).first()).toBeVisible();
  await choose(page, 'Nach Marke oder Größensystem filtern', 'Alle Marken / Systeme');
  await expect(page.locator('[data-size-table="next-women-trousers"]')).toBeVisible();
  await expect(page.locator('[data-size-table="silver-women"]')).toBeVisible();
  await expect(page.locator('[data-size-table="silver-women"] [data-size-match]')).toHaveCount(0);
  for (const table of CLOTHING_SIZE_TABLES.filter((table) => table.kind !== 'garment')) {
    await expect(page.locator(`[data-size-table="${table.id}"] [data-size-match]`)).toHaveCount(0);
  }
  await checkAccessibility(page);
  await capture(page, 'size-guide-measurement-match.png');

  await page.getByRole('button', { name: 'Alle Größenfilter zurücksetzen', exact: true }).click();
  await expect(page.locator('[data-size-table]')).toHaveCount(CLOTHING_SIZE_TABLES.length);
  await page
    .getByRole('searchbox', { name: 'Labelgröße oder Stichwort suchen', exact: true })
    .fill('W29/L35');
  await expect(
    page.getByRole('heading', { name: 'Jeanslabel in Inch', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Alle Größenfilter zurücksetzen', exact: true }).click();

  const labelSearch = page.getByRole('searchbox', {
    name: 'Labelgröße oder Stichwort suchen',
    exact: true,
  });
  await labelSearch.fill('S');
  await expect(page.locator('[data-size-table="next-women-trousers"] tbody tr')).toHaveCount(2);
  await labelSearch.fill('EU36');
  await expect(page.locator('[data-size-table="next-women-trousers"] tbody tr')).toHaveCount(1);
  await expect(page.locator('[data-size-table="next-women-trousers"] tbody th')).toHaveText('36');
  await labelSearch.fill('W34/L32');
  await expect(page.locator('[data-size-table="nominal-waist"] tbody th')).toHaveText('W34');
  await expect(page.locator('[data-size-table="nominal-length"] tbody th')).toHaveText('L32');
  await labelSearch.fill('W22');
  await expect(page.locator('[data-size-table="nominal-waist"] tbody th')).toHaveText('W22');
  await labelSearch.fill('L24');
  await expect(page.locator('[data-size-table="nominal-length"] tbody th')).toHaveText('L24');
  await page.getByRole('button', { name: 'Alle Größenfilter zurücksetzen', exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-size-table]')).toHaveCount(CLOTHING_SIZE_TABLES.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await checkAccessibility(page);
  await capture(page, 'size-guide-mobile.png');
  expect(pageErrors).toEqual([]);
});

test('erhält die Größenübersicht bei einem Ausfall der zusätzlichen Referenzen @core-smoke', async ({
  page,
}) => {
  await page.route('**/rest/v1/rpc/list_size_references', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST000', message: 'Synthetischer lokaler Ausfall' }),
    }),
  );
  await page.goto('/tools/brand-labels/sizes');
  await expect(page.locator('[data-size-table]')).toHaveCount(CLOTHING_SIZE_TABLES.length);
  await expect(
    page.getByText(
      'Zusätzliche veröffentlichte Tabellen konnten nicht geladen werden. Die recherchierte Größenübersicht bleibt verfügbar.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Zusätzliche Tabellen erneut laden', exact: true }),
  ).toBeVisible();
});
