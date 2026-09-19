export type ExpenseStatus = 'open' | 'paid';
export type ExpenseFrequency = 'monthly' | 'quarterly' | 'yearly';
export type ExpenseVatRate = 0 | 7 | 19 | null;

export interface ExpenseCategory {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly sort_order: number;
  readonly is_default: boolean;
  readonly is_archived: boolean;
  readonly created_at: string;
  readonly created_by: string | null;
  readonly updated_at: string;
}

export interface ExpenseRecurringRule {
  readonly id: string;
  readonly workspace_id: string;
  readonly category_id: string;
  readonly title: string;
  readonly vendor_name: string | null;
  readonly quantity: number;
  readonly gross_amount: number;
  readonly vat_rate: ExpenseVatRate;
  readonly frequency: ExpenseFrequency;
  readonly start_date: string;
  readonly end_date: string | null;
  readonly is_active: boolean;
  readonly notes: string | null;
  readonly created_at: string;
  readonly created_by: string | null;
  readonly updated_at: string;
}

export interface Expense {
  readonly id: string;
  readonly workspace_id: string;
  readonly category_id: string;
  readonly recurring_rule_id: string | null;
  readonly occurrence_date: string | null;
  readonly title: string;
  readonly vendor_name: string | null;
  readonly quantity: number;
  readonly gross_amount: number;
  readonly vat_rate: ExpenseVatRate;
  readonly expense_date: string;
  readonly due_date: string | null;
  readonly status: ExpenseStatus;
  readonly payment_date: string | null;
  readonly notes: string | null;
  readonly deleted_at: string | null;
  readonly created_at: string;
  readonly created_by: string | null;
  readonly updated_at: string;
}

export interface ExpenseCreateInput {
  readonly category_id: string;
  readonly title: string;
  readonly vendor_name: string | null;
  readonly quantity: number;
  readonly gross_amount: number;
  readonly vat_rate: ExpenseVatRate;
  readonly expense_date: string;
  readonly due_date: string | null;
  readonly status: ExpenseStatus;
  readonly payment_date: string | null;
  readonly notes: string | null;
}

export type ExpenseUpdateInput = Partial<ExpenseCreateInput>;

export interface ExpenseRecurringRuleInput {
  readonly category_id: string;
  readonly title: string;
  readonly vendor_name: string | null;
  readonly quantity: number;
  readonly gross_amount: number;
  readonly vat_rate: ExpenseVatRate;
  readonly frequency: ExpenseFrequency;
  readonly start_date: string;
  readonly end_date: string | null;
  readonly is_active: boolean;
  readonly notes: string | null;
}

export interface UpcomingExpense {
  readonly ruleId: string;
  readonly title: string;
  readonly categoryId: string;
  readonly grossAmount: number;
  readonly occurrenceDate: string;
}
