import type { Page } from '@playwright/test';
import { mockFinanceArea } from './finance-design-fixture';
import { workspaceId } from './marketplace-account-fixture';

export async function mockBankAssignment(page: Page) {
  await mockFinanceArea(page);
  const today = new Date().toISOString().slice(0, 10);
  const transactions = [80, -47.6].map((amount, i) => ({
    id: '45000000-0000-4000-8000-00000000000' + (i + 1),
    workspace_id: workspaceId,
    booking_date: today,
    value_date: today,
    counterparty_name: i ? 'Papier & Paket' : 'Vinted Auszahlung',
    purpose: i ? 'Versandkartons' : 'Verkauf Leinenhemd',
    amount,
    currency: 'EUR',
    source_format: 'csv',
    status: 'pending',
    match_json: null as Record<string, unknown> | null,
    booked_at: null as string | null,
  }));
  const writes: Record<string, unknown>[] = [];
  const state = { failNextSave: false, failSalesLoad: false, emptySales: false, bookingCalls: 0 };
  await page.route('**/rest/v1/sales?**', (route) =>
    state.failSalesLoad
      ? route.fulfill({ status: 503, json: { message: 'Laden nicht erreichbar' } })
      : state.emptySales
        ? route.fulfill({ json: [] })
        : route.fallback(),
  );
  await page.route('**/rest/v1/bank_transactions?**', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fulfill({ json: transactions });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const id = new URL(route.request().url()).searchParams.get('id')?.replace(/^eq\./, '');
    writes.push({ ...body, id });
    if (state.failNextSave) {
      state.failNextSave = false;
      return route.fulfill({
        status: 503,
        json: { message: 'Speichern derzeit nicht erreichbar', code: '503' },
      });
    }
    const tx = transactions.find(
      (tx) => tx.id === id && ['pending', 'matched'].includes(tx.status),
    );
    if (!tx) return route.fulfill({ json: [] });
    tx.status = String(body['status']);
    tx.match_json = body['match_json'] as Record<string, unknown>;
    return route.fulfill({ json: [{ id: tx.id }] });
  });
  await page.route('**/rest/v1/purchases?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'manual-purchase',
          workspace_id: workspaceId,
          title: 'Kleiderpaket',
          purchase_price: 50,
          purchase_date: today,
          type: 'single',
          cost_allocation_mode: 'even',
          entry_status: 'finalized',
          items: [],
          costs: [],
          purchase_lines: [],
        },
      ],
    }),
  );
  await page.route('**/rest/v1/store_settings?**', (route) => route.fulfill({ json: null }));
  await page.route('**/rest/v1/store_orders?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'manual-order',
          workspace_id: workspaceId,
          order_number: 'ORD-42',
          created_at: today,
          total: 80,
          subtotal: 80,
          shipping_cost: 0,
          customer: { firstName: 'Ada', lastName: 'Beispiel' },
          payment_status: 'pending',
          payment_method: 'bank_transfer',
          status: 'pending',
          items: [],
        },
      ],
    }),
  );
  await page.route('**/rest/v1/rpc/book_bank_transaction', (route) => {
    state.bookingCalls++;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const tx = transactions.find((tx) => tx.id === body['p_transaction_id'])!;
    tx.status = 'booked';
    tx.booked_at = String(body['p_booked_at']);
    return route.fulfill({ json: tx });
  });
  return { transactions, writes, state };
}
