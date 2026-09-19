import { ExpenseVatRate } from '../models/expense.models';

export interface ExpenseTaxBreakdown {
  readonly gross: number;
  readonly net: number | null;
  readonly tax: number | null;
}

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

export function calculateExpenseTax(
  grossAmount: number,
  vatRate: ExpenseVatRate,
): ExpenseTaxBreakdown {
  const grossCents = cents(grossAmount);
  const gross = grossCents / 100;

  if (vatRate === null) {
    return { gross, net: null, tax: null };
  }

  if (vatRate === 0) {
    return { gross, net: gross, tax: 0 };
  }

  const netCents = Math.round(grossCents / (1 + vatRate / 100));
  return {
    gross,
    net: netCents / 100,
    tax: (grossCents - netCents) / 100,
  };
}

export function calculateExpenseUnitPrice(grossAmount: number, quantity: number): number | null {
  if (!Number.isFinite(grossAmount) || !Number.isInteger(quantity) || quantity <= 0) return null;
  return cents(grossAmount / quantity) / 100;
}
