import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from './support/fixtures';
import { createLocalAdminClient } from './support/local-supabase';
import { createFinalizedPurchase } from './support/sample-data';

const soldTitle = 'Vinted-Pullover';

for (const shopEnabled of [true, false]) {
  test.describe(shopEnabled ? 'Shop aktiv' : 'Shop aus', () => {
    test.use({
      shopEnabled,
      viewport: shopEnabled ? { width: 1440, height: 900 } : { width: 390, height: 844 },
      hasTouch: !shopEnabled,
    });

    test('öffnet einen automatisch importierten Vinted-Entwurf und bucht ihn genau einmal', async ({
      page,
      workspace,
      accountSession,
    }) => {
      const admin = createLocalAdminClient();
      const connectionId = randomUUID();
      const sellerId = String(randomInt(100_000_000_000, 999_999_999_999));
      const itemId = '7123';
      const transactionId = '7567';
      const connection = await admin.from('marketplace_connections').insert({
        id: connectionId,
        workspace_id: workspace.id,
        display_name: 'Vinted-Testkonto',
        external_account_id: sellerId,
        status: 'connected',
      });
      expect(connection.error).toBeNull();

      let inventoryItemId: string | null = null;
      if (shopEnabled) {
        await createFinalizedPurchase(workspace, {
          title: 'Vinted-Bestand',
          purchaseDate: '2026-10-01',
          items: [{ title: soldTitle, price: 10 }],
        });
        const inventory = await workspace.client
          .from('inventory_items')
          .select('id')
          .eq('workspace_id', workspace.id)
          .single();
        expect(inventory.error).toBeNull();
        inventoryItemId = inventory.data?.id ?? null;
        expect(inventoryItemId).toBeTruthy();
        const listingDraft = await admin
          .from('marketplace_listing_drafts')
          .insert({
            workspace_id: workspace.id,
            connection_id: connectionId,
            created_by: accountSession.user.id,
            inventory_item_id: inventoryItemId,
          })
          .select('id')
          .single();
        if (listingDraft.error) throw listingDraft.error;
        const publication = await admin.from('marketplace_listing_jobs').insert({
          workspace_id: workspace.id,
          connection_id: connectionId,
          draft_id: listingDraft.data.id,
          requested_by: accountSession.user.id,
          request_id: randomUUID(),
          request_hash: 'a'.repeat(64),
          draft_revision: 1,
          authorization_version: 1,
          external_account_id: sellerId,
          execution_mode: 'cloud',
          action: 'publish',
          snapshot: { inventoryItemId },
          state: 'confirmed',
          external_id: itemId,
          provider_state: 'active',
          verified_at: new Date().toISOString(),
        });
        expect(publication.error).toBeNull();
      }

      const saleEntry = {
        workspace_id: workspace.id,
        connection_id: connectionId,
        kind: 'sale',
        external_id: transactionId,
        body: {
          title: soldTitle,
          saleState: 'sold',
          sellerId,
          externalConversationId: '7134',
          itemIds: [itemId],
          itemCount: 1,
          price: 24.5,
          currency: 'EUR',
          currencyConfirmed: true,
          occurredAt: '2026-10-14T23:00:00Z',
          shippingLabelAction: 'order',
        },
      };
      const importSale = () =>
        admin.from('marketplace_account_entries').upsert(saleEntry, {
          onConflict: 'workspace_id,connection_id,kind,external_id',
        });
      const imports = await Promise.all([importSale(), importSale()]);
      for (const imported of imports) expect(imported.error).toBeNull();

      await page.goto('/sales');
      const draft = page.locator('[data-sale-draft]').filter({ hasText: soldTitle });
      await expect(draft).toHaveCount(1);
      await expect(draft).toContainText(/24,50\s*€/u);
      await draft.getByRole('link', { name: `${soldTitle} weiter bearbeiten` }).click();
      await expect(page).toHaveURL(/\/sales\/new\?draft=/u);
      await expect(page.getByRole('heading', { name: 'Verkauf erfassen' })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Verkaufsplattform' })).toContainText(
        'Vinted',
      );
      await expect(page.getByRole('textbox', { name: 'Referenznummer' })).toHaveValue(
        transactionId,
      );
      await expect(page.getByRole('spinbutton', { name: 'Preis je Stück (€)' })).toHaveValue(
        /24[,.]5(?:0)?/u,
      );
      if (shopEnabled) {
        await expect(
          page.getByRole('button', { name: `${soldTitle} – Artikel ändern` }),
        ).toBeVisible();
      } else {
        await expect(page.getByRole('textbox', { name: 'Artikelname' })).toHaveValue(soldTitle);
      }

      await page.getByRole('button', { name: 'Verkauf abschließen', exact: true }).click();
      await expect(page).toHaveURL(/\/sales$/u);
      await expect(draft).toHaveCount(0);
      const sale = await workspace.client
        .from('sales')
        .select(
          'platform,sale_date,sale_price,external_order_id,sale_lines!sale_lines_workspace_sale_fkey(position_kind,inventory_item_id,title_snapshot)',
        )
        .eq('workspace_id', workspace.id)
        .single();
      expect(sale.error).toBeNull();
      expect(sale.data).toMatchObject({
        platform: 'vinted',
        sale_date: '2026-10-15',
        sale_price: 24.5,
        external_order_id: transactionId,
        sale_lines: [
          {
            position_kind: shopEnabled ? 'stock' : 'free',
            inventory_item_id: inventoryItemId,
            title_snapshot: shopEnabled ? `${soldTitle} · Gebraucht` : soldTitle,
          },
        ],
      });
      const repeated = await importSale();
      expect(repeated.error).toBeNull();
      const remainingDrafts = await workspace.client
        .from('sale_drafts')
        .select('id')
        .eq('workspace_id', workspace.id);
      expect(remainingDrafts.error).toBeNull();
      expect(remainingDrafts.data).toEqual([]);
      await page.reload();
      await expect(draft).toHaveCount(0);
      const inventory = await workspace.client
        .from('inventory_items')
        .select('status')
        .eq('workspace_id', workspace.id);
      expect(inventory.error).toBeNull();
      expect(inventory.data).toEqual(shopEnabled ? [{ status: 'sold' }] : []);
    });
  });
}
