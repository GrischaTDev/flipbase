import { expect, test } from './support/fixtures';
import { createFinalizedPurchase } from './support/sample-data';

async function installExtensionProtocolStub(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const publishedPayloads: unknown[] = [];
    Object.assign(window, { __flipbasePublishedPayloads: publishedPayloads });
    window.addEventListener('message', (event) => {
      if (!event.data || typeof event.data !== 'object') return;
      const message = event.data as { type?: unknown; requestId?: unknown; payload?: unknown };
      if (message.type === 'FLIPBASE_CHECK_EXTENSION') {
        window.postMessage({ type: 'FLIPBASE_EXTENSION_READY' }, '*');
      }
      if (message.type === 'FLIPBASE_PUBLISH_KLEINANZEIGEN') {
        publishedPayloads.push(message.payload);
        window.postMessage(
          {
            type: 'FLIPBASE_PUBLISH_KLEINANZEIGEN_RESULT',
            requestId: message.requestId,
            success: true,
          },
          '*',
        );
      }
    });
  });
}

test('creates, publishes and completes the listing lifecycle on mobile @pr-smoke', async ({
  page,
  workspace,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { items } = await createFinalizedPurchase(workspace, {
    title: 'Inserate E2E Einkauf',
    purchaseDate: '2026-09-20',
    items: [{ title: 'E2E Kamera', price: 35 }],
  });
  const item = items[0]!;
  await installExtensionProtocolStub(page);

  await page.goto('/listings/new');
  const itemSelect = page.getByRole('combobox', { name: 'Bestandsartikel' });
  await expect(itemSelect).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset['flipbaseExtensionInstalled'] = 'true';
    window.dispatchEvent(new Event('flipbase:extension-ready'));
  });
  await itemSelect.click();
  await page.getByRole('option', { name: 'E2E Kamera' }).click();
  await page.getByRole('textbox', { name: 'Titel', exact: true }).fill('E2E Kamera Inserat');
  await page.getByRole('spinbutton', { name: 'Preis', exact: true }).fill('79.90');
  await page.getByRole('button', { name: 'Vorbereiten und öffnen', exact: true }).click();

  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByText('E2E Kamera Inserat', { exact: true }).last()).toBeVisible();
  await expect(page.locator('table')).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __flipbasePublishedPayloads: unknown[] })
            .__flipbasePublishedPayloads.length,
      ),
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Inserat bei Kleinanzeigen öffnen' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __flipbasePublishedPayloads: unknown[] })
            .__flipbasePublishedPayloads.length,
      ),
    )
    .toBe(2);
  const firstPublishedPayload = await page.evaluate(() => {
    const payloads = (window as Window & { __flipbasePublishedPayloads: unknown[] })
      .__flipbasePublishedPayloads;
    return payloads[0];
  });
  expect(firstPublishedPayload).toMatchObject({
    itemId: item.id,
    title: 'E2E Kamera Inserat',
    price: 79.9,
  });

  await page.getByRole('button', { name: 'Inserat online setzen' }).click();
  await expect
    .poll(async () => {
      const { data } = await workspace.client
        .from('listings')
        .select('status')
        .eq('workspace_id', workspace.id)
        .eq('inventory_item_id', item.id)
        .single();
      return data?.status;
    })
    .toBe('online');

  await page.getByRole('button', { name: 'Inserat beenden' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Inserat beenden' }).click();
  await expect
    .poll(async () => {
      const { data } = await workspace.client
        .from('listings')
        .select('status, end_reason')
        .eq('workspace_id', workspace.id)
        .eq('inventory_item_id', item.id)
        .single();
      return `${data?.status}/${data?.end_reason}`;
    })
    .toBe('ended/manual');

  await page.getByRole('button', { name: 'Beendet', exact: true }).click();
  await expect(page.getByText('E2E Kamera Inserat', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Inserat erneut einstellen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Erneut einstellen' }).click();
  await expect
    .poll(async () => {
      const { data } = await workspace.client
        .from('listings')
        .select('status, listed_count')
        .eq('workspace_id', workspace.id)
        .eq('inventory_item_id', item.id)
        .single();
      return `${data?.status}/${data?.listed_count}`;
    })
    .toBe('prepared/2');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __flipbasePublishedPayloads: unknown[] })
            .__flipbasePublishedPayloads.length,
      ),
    )
    .toBe(3);
});

test('keeps a prepared listing and explains setup when the extension is missing', async ({
  page,
  workspace,
}) => {
  const { items } = await createFinalizedPurchase(workspace, {
    title: 'Inserate ohne Erweiterung',
    purchaseDate: '2026-09-20',
    items: [{ title: 'E2E Radio', price: 18 }],
  });
  const item = items[0]!;

  await page.goto('/listings/new');
  await page.getByRole('combobox', { name: 'Bestandsartikel' }).click();
  await page.getByRole('option', { name: 'E2E Radio' }).click();
  await page.getByRole('textbox', { name: 'Titel', exact: true }).fill('E2E Radio Inserat');
  await page.getByRole('spinbutton', { name: 'Preis', exact: true }).fill('39');
  await page.getByRole('button', { name: 'Vorbereiten und öffnen', exact: true }).click();

  await expect(
    page.getByRole('dialog', { name: 'Kleinanzeigen-Erweiterung verbinden' }),
  ).toBeVisible();
  const { data, error } = await workspace.client
    .from('listings')
    .select('status')
    .eq('workspace_id', workspace.id)
    .eq('inventory_item_id', item.id)
    .single();
  expect(error).toBeNull();
  expect(data?.status).toBe('prepared');
});
