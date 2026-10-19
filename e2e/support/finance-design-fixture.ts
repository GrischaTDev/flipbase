import type { Page } from '@playwright/test';
import { mockArticleArea, itemId } from './article-design-fixture';
import { workspaceId } from './marketplace-account-fixture';

export async function mockFinanceArea(page: Page) {
  const article = await mockArticleArea(page);
  const today = new Date().toISOString().slice(0, 10);
  const categories = [
    {
      id: 'finance-category',
      workspace_id: workspaceId,
      name: 'Verpackung',
      is_default: true,
      is_archived: false,
      created_at: today,
    },
  ];
  const expenses = [
    {
      id: 'finance-expense',
      workspace_id: workspaceId,
      deleted_at: null,
      title: 'Versandkartons',
      vendor_name: 'Papier & Paket',
      category_id: 'finance-category',
      quantity: 20,
      gross_amount: 47.6,
      vat_rate: 19,
      expense_date: today,
      due_date: today,
      payment_date: today,
      status: 'paid',
      recurring_rule_id: null,
      notes: '',
      created_at: today,
      updated_at: today,
    },
  ];
  const rules = [
    {
      id: 'finance-rule',
      workspace_id: workspaceId,
      title: 'Shop-Abonnement',
      vendor_name: 'Shopanbieter',
      category_id: 'finance-category',
      quantity: 1,
      gross_amount: 29.9,
      vat_rate: 19,
      frequency: 'monthly',
      start_date: today,
      end_date: null,
      is_active: true,
      notes: '',
      created_at: today,
      updated_at: today,
    },
  ];
  const sales = [
    {
      id: 'finance-sale',
      workspace_id: workspaceId,
      inventory_item_id: itemId,
      platform: 'vinted',
      sale_price: 80,
      sale_date: today,
      platform_fee: 0,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
      net_profit: 30,
      roi: 60,
      holding_duration_days: 4,
      cost_basis_status: 'known',
      cost_basis_amount: 50,
      inventory_item: {
        ...article.item,
        title: 'Leinenhemd · Salbeigrün',
        allocated_purchase_cost: 50,
        tax_purchase_cost: 50,
        purchase: {
          id: 'finance-purchase',
          workspace_id: workspaceId,
          entry_status: 'finalized',
          purchase_price: 50,
        },
      },
      sale_lines: [],
      returned_at: null,
      voided_at: null,
      created_at: today,
    },
  ];
  const bankTransactions = [80, -47.6].map((amount, index) => ({
    id: '45000000-0000-4000-8000-00000000000' + (index + 1),
    workspace_id: workspaceId,
    booking_date: today,
    value_date: today,
    counterparty_name: index === 0 ? 'Vinted Auszahlung' : 'Papier & Paket',
    counterparty_iban: null,
    purpose: index === 0 ? 'Verkauf Leinenhemd' : 'Versandkartons',
    amount,
    currency: 'EUR',
    source_format: 'csv',
    status: 'pending',
    match_json: null,
    booked_at: null,
  }));
  for (const [table, rows] of Object.entries({
    expenses,
    expense_categories: categories,
    expense_recurring_rules: rules,
    sales,
    bank_transactions: bankTransactions,
  })) {
    await page.route('**/rest/v1/' + table + '?**', async (route) => {
      // Auch die automatische Wiederholungsfälligkeit bleibt vollständig simuliert.
      // Kein Request dieser Tabellen erreicht einen echten Server.
      await route.fulfill({ json: rows });
    });
  }
  return { expenses, rules, sales };
}
