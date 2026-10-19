import { describe, expect, it } from 'vitest';
import type { Sale, Purchase } from '../../../core/models/flipbase.models';
import type { Expense } from '../../../core/models/expense.models';
import type { StoreOrder } from '../../../core/models/store.models';
import type { BankTransaction } from '../../../core/models/bank-reconciliation.models';
import { buildBankAssignmentTargets, bankAssignmentDifference } from './bank-assignment.models';

const tx: BankTransaction = {
  id: 'tx',
  amount: 80,
  currency: 'EUR',
  bookingDate: '2026-10-19',
  counterpartyName: 'Käufer',
  purpose: 'Hemd',
  status: 'pending',
};
const sale = {
  id: 'sale',
  workspace_id: 'ws',
  sale_price: 80,
  sale_date: '2026-10-18',
  record_number: 'VK-42',
  inventory_item: { title: 'Leinenhemd' },
} as Sale;
const purchase = {
  id: 'purchase',
  workspace_id: 'ws',
  purchase_price: 30,
  purchase_date: '2026-10-17',
  title: 'Kleiderpaket',
  entry_status: 'finalized',
} as Purchase;
const expense = {
  id: 'expense',
  workspace_id: 'ws',
  title: 'Versandkartons',
  vendor_name: 'Papier & Paket',
  gross_amount: 47.6,
  quantity: 20,
  expense_date: '2026-10-18',
  deleted_at: null,
} as Expense;
const order = {
  id: 'order',
  orderNumber: 'ORD-12',
  createdAt: '2026-10-19',
  total: 80,
  paymentStatus: 'pending',
  customer: { firstName: 'Ada', lastName: 'Beispiel' },
} as StoreOrder;
const data = {
  sales: [sale],
  purchases: [purchase],
  expenses: [expense],
  orders: [order],
  storeCurrency: 'EUR',
  storeWorkspaceId: 'ws',
};

describe('Manuelle Bankzuordnung: verfügbare Ziele', () => {
  it('bietet für Einnahmen nur Verkäufe und Shopbestellungen an', () => {
    expect(
      buildBankAssignmentTargets(tx, 'ws', data)
        .map((x) => x.type)
        .sort(),
    ).toEqual(['sale', 'store_order']);
  });
  it('bietet Ausgaben als Gesamtbetrag und Einkäufe für Ausgänge an', () => {
    const targets = buildBankAssignmentTargets({ ...tx, amount: -47.6 }, 'ws', data);
    expect(targets.map((x) => x.type).sort()).toEqual(['operating_expense', 'purchase']);
    expect(targets.find((x) => x.type === 'operating_expense')?.amount).toBe(47.6);
  });
  it('schließt fremde Workspaces und nicht bestätigte Shopdaten aus', () => {
    expect(buildBankAssignmentTargets(tx, 'other', data)).toEqual([]);
  });
  it('schließt stornierte und retournierte Verkäufe aus', () => {
    const sales = [
      { ...sale, voided_at: '2026-10-18' },
      { ...sale, id: 'returned', returned_at: '2026-10-18' },
    ];
    expect(buildBankAssignmentTargets(tx, 'ws', { ...data, sales, orders: [] })).toEqual([]);
  });
  it('schließt Einkaufsentwürfe, unbekannte Beträge und gelöschte Ausgaben aus', () => {
    const targets = buildBankAssignmentTargets({ ...tx, amount: -30 }, 'ws', {
      ...data,
      purchases: [
        { ...purchase, entry_status: 'draft' },
        { ...purchase, id: 'unknown', purchase_price: null },
      ],
      expenses: [{ ...expense, deleted_at: '2026-10-18' }],
    });
    expect(targets).toEqual([]);
  });
  it('schließt bezahlte Shopbestellungen und ungültige Beträge aus', () => {
    expect(
      buildBankAssignmentTargets(tx, 'ws', {
        ...data,
        orders: [{ ...order, paymentStatus: 'paid' }],
        sales: [{ ...sale, sale_price: NaN }],
      }),
    ).toEqual([]);
  });
  it('erlaubt keine stillschweigende Fremdwährungszuordnung', () => {
    expect(buildBankAssignmentTargets({ ...tx, currency: 'USD' }, 'ws', data)).toEqual([]);
    expect(buildBankAssignmentTargets({ ...tx, amount: 0 }, 'ws', data)).toEqual([]);
  });
  it('stellt Titel und Belegnummer bereit und rechnet Differenzen in Cent', () => {
    const target = buildBankAssignmentTargets(tx, 'ws', data).find((x) => x.type === 'sale')!;
    expect(target.title).toBe('Leinenhemd');
    expect(target.reference).toBe('VK-42');
    expect(bankAssignmentDifference(0.1 + 0.2, 0.3)).toBe(0);
    expect(bankAssignmentDifference(-47.6, 50)).toBe(-2.4);
  });
  it('schließt Shopbestellungen in einer anderen Shopwährung aus', () => {
    const targets = buildBankAssignmentTargets(tx, 'ws', { ...data, storeCurrency: 'USD' });
    expect(targets.map((target) => target.type)).toEqual(['sale']);
  });
});
