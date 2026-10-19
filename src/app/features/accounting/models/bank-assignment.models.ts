import type { Purchase, Sale } from '../../../core/models/flipbase.models';
import type { Expense } from '../../../core/models/expense.models';
import type { StoreOrder } from '../../../core/models/store.models';
import type {
  BankTransaction,
  BankReconciliationMatch,
} from '../../../core/models/bank-reconciliation.models';

export type BankAssignmentType = Exclude<BankReconciliationMatch['targetType'], 'unknown'>;
export interface BankAssignmentTarget {
  readonly key: string;
  readonly type: BankAssignmentType;
  readonly id: string;
  readonly title: string;
  readonly reference: string;
  readonly name: string;
  readonly date: string;
  readonly amount: number;
}
export interface BankAssignmentData {
  readonly sales: readonly Sale[];
  readonly purchases: readonly Purchase[];
  readonly expenses: readonly Expense[];
  readonly orders: readonly StoreOrder[];
  readonly storeWorkspaceId: string | null;
  readonly storeCurrency: string;
}
export function bankAssignmentDifference(bankAmount: number, targetAmount: number): number {
  return (Math.round(Math.abs(bankAmount) * 100) - Math.round(targetAmount * 100)) / 100;
}
export function buildBankAssignmentTargets(
  tx: BankTransaction,
  workspaceId: string,
  data: BankAssignmentData,
): BankAssignmentTarget[] {
  if (tx.currency !== 'EUR' || !Number.isFinite(tx.amount) || tx.amount === 0) return [];
  const targets: BankAssignmentTarget[] = [];
  const add = (target: Omit<BankAssignmentTarget, 'key'>) => {
    if (target.id && Number.isFinite(target.amount) && target.amount > 0)
      targets.push({ ...target, key: target.type + ':' + target.id });
  };
  if (tx.amount > 0) {
    for (const sale of data.sales) {
      if (sale.workspace_id !== workspaceId || sale.voided_at || sale.returned_at) continue;
      add({
        type: 'sale',
        id: sale.id,
        title:
          sale.lines
            ?.map((line) => line.title_snapshot)
            .filter(Boolean)
            .join(', ') ||
          sale.inventory_item?.title ||
          sale.record_number ||
          'Verkauf',
        reference:
          sale.record_number ||
          sale.inventory_item?.title ||
          sale.lines?.map((line) => line.title_snapshot).join(', ') ||
          'Verkauf',
        name: sale.platform,
        date: sale.sale_date,
        amount: sale.sale_price,
      });
    }
    if (data.storeWorkspaceId === workspaceId && data.storeCurrency === 'EUR')
      for (const order of data.orders) {
        if (order.paymentStatus !== 'pending') continue;
        add({
          type: 'store_order',
          id: order.id,
          title: order.orderNumber,
          reference: order.orderNumber,
          name: [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' '),
          date: order.createdAt.slice(0, 10),
          amount: order.total,
        });
      }
  } else {
    for (const purchase of data.purchases) {
      if (
        purchase.workspace_id !== workspaceId ||
        purchase.entry_status === 'draft' ||
        purchase.purchase_price === null
      )
        continue;
      add({
        type: 'purchase',
        id: purchase.id,
        title: purchase.title,
        reference: purchase.record_number || purchase.title,
        name: purchase.seller_name || purchase.supplier?.name || '',
        date: purchase.purchase_date,
        amount: purchase.purchase_price,
      });
    }
    for (const expense of data.expenses) {
      if (expense.workspace_id !== workspaceId || expense.deleted_at) continue;
      add({
        type: 'operating_expense',
        id: expense.id,
        title: expense.title,
        reference: expense.title,
        name: expense.vendor_name || '',
        date: expense.expense_date,
        amount: expense.gross_amount,
      });
    }
  }
  return targets.sort(
    (a, b) =>
      Number(bankAssignmentDifference(tx.amount, b.amount) === 0) -
        Number(bankAssignmentDifference(tx.amount, a.amount) === 0) ||
      b.date.localeCompare(a.date) ||
      a.title.localeCompare(b.title, 'de'),
  );
}
