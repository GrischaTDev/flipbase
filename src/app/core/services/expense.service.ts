import { computed, inject, Injectable, signal } from '@angular/core';
import {
  Expense,
  ExpenseCreateInput,
  ExpenseUpdateInput,
} from '../models/expense.models';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspace = inject(WorkspaceService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly auth = inject(AuthService);

  private readonly expensesRaw = signal<readonly Expense[]>([]);
  readonly expenses = computed(() =>
    this.expensesRaw()
      .filter((expense) => expense.deleted_at === null)
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.id.localeCompare(a.id)),
  );
  readonly isLoading = signal(false);
  readonly loadError = signal<Error | null>(null);

  async load(): Promise<void> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!workspaceId) {
      this.expensesRaw.set([]);
      return;
    }
    if (this.mockStore.isDemoMode()) return;

    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const { data, error } = await this.supabase.client
        .from('expenses')
        .select('*')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('expense_date', { ascending: false });
      if (error) throw error;
      this.expensesRaw.set((data ?? []) as unknown as Expense[]);
    } catch (cause: unknown) {
      const error = this.syncStatus.melde('Laden der Ausgaben', cause);
      this.loadError.set(error);
      this.expensesRaw.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async create(
    input: ExpenseCreateInput,
  ): Promise<{ readonly data: Expense | null; readonly error: Error | null }> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!workspaceId) return { data: null, error: new Error('Kein aktiver Workspace.') };

    if (this.mockStore.isDemoMode()) {
      const now = new Date().toISOString();
      const expense: Expense = {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        recurring_rule_id: null,
        occurrence_date: null,
        deleted_at: null,
        created_at: now,
        created_by: this.auth.currentUser()?.id ?? null,
        updated_at: now,
        ...input,
      };
      this.expensesRaw.update((current) => [...current, expense]);
      return { data: expense, error: null };
    }

    try {
      const { data, error } = await this.supabase.client
        .from('expenses')
        .insert({
          ...input,
          workspace_id: workspaceId,
          recurring_rule_id: null,
          occurrence_date: null,
          created_by: this.auth.currentUser()?.id ?? null,
        })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Die Ausgabe wurde nicht zurückgegeben.');
      const expense = data as unknown as Expense;
      this.expensesRaw.update((current) => [...current, expense]);
      return { data: expense, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Speichern der Ausgabe', cause) };
    }
  }

  update(
    id: string,
    input: ExpenseUpdateInput,
  ): Promise<{ readonly data: Expense | null; readonly error: Error | null }> {
    return this.persistUpdate(id, input);
  }

  markPaid(
    id: string,
    paymentDate: string,
  ): Promise<{ readonly data: Expense | null; readonly error: Error | null }> {
    return this.persistUpdate(id, { status: 'paid', payment_date: paymentDate });
  }

  markOpen(
    id: string,
  ): Promise<{ readonly data: Expense | null; readonly error: Error | null }> {
    return this.persistUpdate(id, { status: 'open', payment_date: null });
  }

  async remove(id: string): Promise<{ readonly error: Error | null }> {
    const result = await this.persistUpdate(id, { deleted_at: new Date().toISOString() } as never);
    if (!result.error) {
      this.expensesRaw.update((current) => current.filter((expense) => expense.id !== id));
    }
    return { error: result.error };
  }

  paidTotalBetween(startDate: string, endDate: string): number {
    return money(
      this.expensesRaw()
        .filter(
          (expense) =>
            expense.deleted_at === null &&
            expense.status === 'paid' &&
            expense.payment_date !== null &&
            expense.payment_date >= startDate &&
            expense.payment_date <= endDate,
        )
        .reduce((sum, expense) => sum + Number(expense.gross_amount), 0),
    );
  }

  private async persistUpdate(
    id: string,
    changes: ExpenseUpdateInput | { readonly deleted_at: string },
  ): Promise<{ readonly data: Expense | null; readonly error: Error | null }> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!workspaceId) return { data: null, error: new Error('Kein aktiver Workspace.') };
    const existing = this.expensesRaw().find((expense) => expense.id === id);

    if (this.mockStore.isDemoMode()) {
      if (!existing) return { data: null, error: new Error('Ausgabe nicht gefunden.') };
      const updated = {
        ...existing,
        ...changes,
        updated_at: new Date().toISOString(),
      } as Expense;
      this.expensesRaw.update((current) =>
        current.map((expense) => (expense.id === id ? updated : expense)),
      );
      return { data: updated, error: null };
    }

    try {
      const { data, error } = await this.supabase.client
        .from('expenses')
        .update(changes)
        .eq('workspace_id', workspaceId)
        .eq('id', id)
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Die Ausgabe wurde nicht zurückgegeben.');
      const returned = data as unknown as Expense;
      const updated = existing ? ({ ...existing, ...changes, ...returned } as Expense) : returned;
      this.expensesRaw.update((current) =>
        current.map((expense) => (expense.id === id ? updated : expense)),
      );
      return { data: updated, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Ändern der Ausgabe', cause) };
    }
  }
}
