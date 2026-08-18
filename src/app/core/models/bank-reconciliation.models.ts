import { StoreOrder } from './store.models';
import { Purchase, Sale } from './reflip.models';

export type BankFormatType =
  | 'csv_auto'
  | 'csv_sparkasse'
  | 'csv_dkb'
  | 'csv_n26'
  | 'csv_commerzbank'
  | 'csv_paypal'
  | 'mt940'
  | 'camt053';

export type BankTransactionStatus = 'pending' | 'matched' | 'booked' | 'ignored';

export type MatchTargetType =
  | 'store_order'
  | 'sale'
  | 'purchase'
  | 'operating_expense'
  | 'unknown';

export interface BankReconciliationMatch {
  targetType: MatchTargetType;
  targetId: string;
  targetReference: string; // e.g. "ORD-83921", "RE-2026-4192", "Konvolut Sony Kameras"
  targetName?: string;
  targetAmount: number;
  confidence: number; // 0 to 100
  confidenceLabel: 'exact' | 'high' | 'probable' | 'manual';
  reason: string;
  order?: StoreOrder;
  sale?: Sale;
  purchase?: Purchase;
}

export interface BankTransaction {
  id: string;
  bookingDate: string; // YYYY-MM-DD
  valueDate?: string; // YYYY-MM-DD
  counterpartyName: string;
  counterpartyIban?: string;
  purpose: string;
  amount: number; // positive = income, negative = expense
  currency: string;
  sourceFormat?: BankFormatType;
  status: BankTransactionStatus;
  match?: BankReconciliationMatch;
  bookedAt?: string;
  notes?: string;
}

export interface BankReconciliationSummary {
  totalCount: number;
  totalIncome: number;
  totalExpense: number;
  matchedCount: number;
  bookedCount: number;
  openCount: number;
  autoMatchRate: number; // percentage
}

export interface BankStatementImportResult {
  success: boolean;
  formatDetected: BankFormatType;
  fileName: string;
  transactionCount: number;
  totalIncome: number;
  totalExpense: number;
  matchedCount: number;
  message: string;
}
