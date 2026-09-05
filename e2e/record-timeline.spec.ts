import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

test('speichert Demo-Kommentare am richtigen Einkauf und zeigt Klartext nach Neuladen', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/purchases/pur-demo-2');
  const timeline = page.getByRole('region', { name: 'Chronik', exact: true });
  await expect(timeline.getByRole('heading', { name: 'Chronik', exact: true })).toBeVisible();
  const composer = timeline.getByLabel('Kommentar schreiben');
  await composer.fill(' \n\t');
  await expect(timeline.getByRole('button', { name: 'Posten', exact: true })).toBeDisabled();
  const body = 'Rückfrage: <img src=x onerror=alert(1)>\nVersand bestätigt.';
  await composer.fill(body);
  await timeline.getByRole('button', { name: 'Posten', exact: true }).click();
  await expect(composer).toHaveValue('');
  await expect(timeline.locator('[data-timeline-kind="comment"]')).toHaveCount(1);
  await expect(timeline.locator('article')).toContainText(body);
  await expect(timeline.locator('article img')).toHaveCount(0);
  await page.reload();
  await expect(timeline.locator('article')).toContainText(body);
  await page.goto('/purchases/pur-demo-1');
  await expect(timeline.getByRole('heading', { name: 'Chronik', exact: true })).toBeVisible();
  await expect(timeline.locator('[data-timeline-kind="comment"]')).toHaveCount(0);
});

test('lädt gleiche Zeitstempel ohne Duplikate nach und erhält neue Kommentare', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.evaluate(() => {
    const comments = Array.from({ length: 25 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      workspace_id: 'ws-1',
      entityType: 'purchase',
      entityId: 'pur-demo-2',
      actorName: 'Demo-Mitglied',
      body: `Kommentar ${index}`,
      createdAt: '2026-09-01T10:00:00.000Z',
    }));
    localStorage.setItem('flipbase_local_record_comments', JSON.stringify(comments));
  });
  await page.goto('/purchases/pur-demo-2');
  const timeline = page.getByRole('region', { name: 'Chronik', exact: true });
  await expect(timeline.locator('[data-timeline-id]')).toHaveCount(20);
  await timeline.getByLabel('Kommentar schreiben').fill('Neu während der Seitennavigation');
  await timeline.getByRole('button', { name: 'Posten', exact: true }).click();
  await expect(timeline.locator('[data-timeline-id]')).toHaveCount(21);
  await timeline.getByRole('button', { name: 'Weitere Einträge laden', exact: true }).click();
  await expect(timeline.locator('[data-timeline-id]')).toHaveCount(26);
  const ids = await timeline
    .locator('[data-timeline-id]')
    .evaluateAll((entries) => entries.map((entry) => entry.getAttribute('data-timeline-id')));
  expect(new Set(ids).size).toBe(26);
  await expect(timeline.locator('[data-timeline-id]').first()).toContainText(
    'Neu während der Seitennavigation',
  );
});
