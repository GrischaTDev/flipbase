import { inject, Injectable, signal } from '@angular/core';
import { Expense, ExpenseInput } from '../models/expense.models';
import { dueOccurrences } from '../utils/expense-recurrence';
import { AuthService } from './auth.service';
import { ExpenseRecurringService } from './expense-recurring.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const DEMO_ERROR = 'Im Demo-Modus werden keine Betriebsausgaben dauerhaft gespeichert.';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly auth = inject(AuthService);
  private readonly recurringService = inject(ExpenseRecurringService);

  readonly expenses = signal<readonly Expense[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);

  async loadCurrentWorkspace(): Promise<void> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) {
      this.expenses.set([]);
      return;
    }
    if (this.mockStore.isDemoMode()) {
      this.expenses.set([]);
      return;
    }

    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const { data, error } = await this.supabase.client
        .from('expenses')
        .select('*')
        .eq('workspace_id', workspace.id)
        .is('deleted_at', null)
        .order('expense_date', { ascending: false });
      if (error) {
        this.loadError.set(this.syncStatus.melde('Laden der Ausgaben', error).message);
        return;
      }
      this.expenses.set((data ?? []) as Expense[]);
    } catch (cause: unknown) {
      this.loadError.set(this.syncStatus.melde('Laden der Ausgaben', cause).message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async create(input: ExpenseInput): Promise<{ data: Expense | null; error: Error | null }> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace.') };
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_ERROR) };

    try {
      const { data, error } = await this.supabase.client
        .from('expenses')
        .insert({
          ...this.payload(input),
          workspace_id: workspace.id,
          recurring_rule_id: null,
          occurrence_date: null,
          created_by: this.auth.currentUser()?.id ?? null,
        })
        .select()
        .single();
      if (error || !data) {
        return {
          data: null,
          error: this.syncStatus.melde(
            'Anlegen der Ausgabe',
            error ?? new Error('Ausgabe wurde nicht zurückgegeben.'),
          ),
        };
      }
      const expense = data as Expense;
      this.expenses.update((current) => [expense, ...current]);
      return { data: expense, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Anlegen der Ausgabe', cause) };
    }
  }

  async update(
    id: string,
    input: ExpenseInput,
  ): Promise<{ data: Expense | null; error: Error | null }> {
    return this.updateExpense(id, this.payload(input), 'Ändern der Ausgabe');
  }

  async markPaid(
    id: string,
    paymentDate: string,
  ): Promise<{ data: Expense | null; error: Error | null }> {
    return this.updateExpense(
      id,
      { status: 'paid', payment_date: paymentDate },
      'Als bezahlt markieren',
    );
  }

  async softDelete(id: string): Promise<{ error: Error | null }> {
    if (this.mockStore.isDemoMode()) return { error: new Error(DEMO_ERROR) };

    try {
      const deletedAt = new Date().toISOString();
      const { error } = await this.supabase.client
        .from('expenses')
        .update({ deleted_at: deletedAt })
        .eq('id', id)
        .select();
      if (error) return { error: this.syncStatus.melde('Entfernen der Ausgabe', error) };

      this.expenses.update((current) => current.filter((entry) => entry.id !== id));
      return { error: null };
    } catch (cause: unknown) {
      return { error: this.syncStatus.melde('Entfernen der Ausgabe', cause) };
    }
  }

  async materializeDue(throughDate = this.localDateKey(new Date())): Promise<void> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace || this.mockStore.isDemoMode()) return;

    const createdBy = this.auth.currentUser()?.id ?? null;
    const candidates = this.recurringService
      .rules()
      .flatMap((rule) =>
        dueOccurrences(rule, throughDate).map((occurrenceDate) => ({
          id: crypto.randomUUID(),
          workspace_id: workspace.id,
          category_id: rule.category_id,
          recurring_rule_id: rule.id,
          occurrence_date: occurrenceDate,
          title: rule.title,
          gross_amount: rule.gross_amount,
          vat_rate: rule.vat_rate,
          expense_date: occurrenceDate,
          due_date: occurrenceDate,
          status: 'open' as const,
          payment_date: null,
          notes: rule.notes,
          created_by: createdBy,
        })),
      );

    if (candidates.length === 0) return;

    try {
      const { error } = await this.supabase.client.from('expenses').upsert(candidates, {
        onConflict: 'workspace_id,recurring_rule_id,occurrence_date',
        ignoreDuplicates: true,
      });
      if (error) throw error;
    } catch (cause: unknown) {
      throw this.syncStatus.melde('Erzeugen fälliger Ausgaben', cause);
    }
  }

  private payload(input: ExpenseInput) {
    return {
      category_id: input.category_id,
      title: input.title.trim(),
      gross_amount: input.gross_amount,
      vat_rate: input.vat_rate,
      expense_date: input.expense_date,
      due_date: input.status === 'open' ? input.due_date : null,
      status: input.status,
      payment_date: input.status === 'paid' ? input.payment_date : null,
      notes: input.notes?.trim() || null,
    };
  }

  private async updateExpense(
    id: string,
    values: Partial<ExpenseInput>,
    operation: string,
  ): Promise<{ data: Expense | null; error: Error | null }> {
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_ERROR) };

    try {
      const { data, error } = await this.supabase.client
        .from('expenses')
        .update(values)
        .eq('id', id)
        .select();
      if (error || !data?.[0]) {
        return {
          data: null,
          error: this.syncStatus.melde(
            operation,
            error ?? new Error('Ausgabe wurde nicht zurückgegeben.'),
          ),
        };
      }

      const expense = data[0] as Expense;
      this.expenses.update((current) =>
        current.map((entry) => (entry.id === expense.id ? expense : entry)),
      );
      return { data: expense, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde(operation, cause) };
    }
  }

  private localDateKey(value: Date): string {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
}
