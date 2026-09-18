import { ExpenseVatRate } from '../models/expense.models';

export interface ExpenseTaxBreakdown {
  readonly gross: number;
  readonly net: number | null;
  readonly tax: number | null;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateExpenseTax(
  grossAmount: number,
  vatRate: ExpenseVatRate,
): ExpenseTaxBreakdown {
  const gross = money(grossAmount);
  if (vatRate === null) return { gross, net: null, tax: null };
  if (vatRate === 0) return { gross, net: gross, tax: 0 };

  const net = money(gross / (1 + vatRate / 100));
  return { gross, net, tax: money(gross - net) };
}
