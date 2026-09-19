import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Expense, ExpenseCreateInput, ExpenseUpdateInput } from '../models/expense.models';
import { AuthService } from './auth.service';
import { ExpenseRecurringService } from './expense-recurring.service';
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
  private readonly syncStatus = inject(SyncStatusService);
  private readonly auth = inject(AuthService);
  private readonly recurring = inject(ExpenseRecurringService, { optional: true });

  private workspaceContextId: string | null = null;
  private lastSyncedContext: string | null = null;
  private readonly syncPromises = new Map<string, Promise<void>>();
  private loadRequestSequence = 0;

  private readonly expensesRaw = signal<readonly Expense[]>([]);
  readonly expenses = computed(() =>
    this.expensesRaw()
      .filter((expense) => expense.deleted_at === null)
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.id.localeCompare(a.id)),
  );
  readonly isLoading = signal(false);
  readonly loadError = signal<Error | null>(null);

  constructor() {
    try {
      effect(() => {
        const workspaceId = this.workspace.currentWorkspace()?.id ?? null;
        const changed = this.resetWorkspaceContext(workspaceId);
        if (workspaceId && changed) void this.ensureCurrentWorkspaceLoaded();
      });
    } catch {
      // Einige fokussierte Service-Tests haben keinen Angular-Scheduler.
    }
  }

  async ensureCurrentWorkspaceLoaded(): Promise<void> {
    const workspaceId = this.workspace.currentWorkspace()?.id ?? null;
    this.resetWorkspaceContext(workspaceId);
    if (!workspaceId) {
      return;
    }
    const dateKey = this.localDateKey();
    const syncContext = this.syncContext(workspaceId, dateKey);
    if (this.lastSyncedContext === syncContext) return;
    const existingSync = this.syncPromises.get(syncContext);
    if (existingSync) return existingSync;

    const syncPromise = this.syncWorkspace(workspaceId, dateKey, syncContext);
    this.syncPromises.set(syncContext, syncPromise);

    try {
      await syncPromise;
    } finally {
      if (this.syncPromises.get(syncContext) === syncPromise) {
        this.syncPromises.delete(syncContext);
      }
    }
  }

  async load(): Promise<boolean> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId) {
      return false;
    }
    return this.loadWorkspace(workspaceId);
  }

  async create(
    input: ExpenseCreateInput,
  ): Promise<{ readonly data: Expense | null; readonly error: Error | null }> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId) return { data: null, error: new Error('Kein aktiver Workspace.') };

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
      if (this.isCurrentWorkspace(workspaceId)) {
        this.expensesRaw.update((current) => [...current, expense]);
      }
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

  markOpen(id: string): Promise<{ readonly data: Expense | null; readonly error: Error | null }> {
    return this.persistUpdate(id, { status: 'open', payment_date: null });
  }

  async remove(id: string): Promise<{ readonly error: Error | null }> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    const result = await this.persistUpdate(id, { deleted_at: new Date().toISOString() });
    if (!result.error && workspaceId && this.isCurrentWorkspace(workspaceId)) {
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

  private async syncWorkspace(
    workspaceId: string,
    dateKey: string,
    syncContext: string,
  ): Promise<void> {
    let materializationError: Error | null = null;
    if (this.recurring) {
      const rulesLoaded = await this.recurring.load();
      if (!this.isCurrentWorkspace(workspaceId)) return;
      if (!rulesLoaded) {
        const error = this.recurring.loadError();
        if (error) this.loadError.set(error);
        return;
      }

      const materialized = await this.recurring.materializeDue(dateKey);
      if (!this.isCurrentWorkspace(workspaceId)) return;
      materializationError = materialized.error;
    }

    const expensesLoaded = await this.loadWorkspace(workspaceId);
    if (!this.isCurrentWorkspace(workspaceId)) return;
    if (materializationError) {
      this.loadError.set(materializationError);
      return;
    }
    if (expensesLoaded) this.lastSyncedContext = syncContext;
  }

  private async loadWorkspace(workspaceId: string): Promise<boolean> {
    const requestId = ++this.loadRequestSequence;

    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const expenses: Expense[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await this.supabase.client
          .from('expenses')
          .select('*')
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null)
          .order('expense_date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + pageSize - 1);
        if (!this.isLatestRequest(workspaceId, requestId)) return false;
        if (error) throw error;

        const page = (data ?? []) as unknown as Expense[];
        expenses.push(...page);
        if (page.length < pageSize) break;
      }

      if (!this.isLatestRequest(workspaceId, requestId)) return false;
      this.expensesRaw.set(expenses);
      return true;
    } catch (cause: unknown) {
      if (!this.isLatestRequest(workspaceId, requestId)) return false;
      const error = this.syncStatus.melde('Laden der Ausgaben', cause);
      this.loadError.set(error);
      this.expensesRaw.set([]);
      return false;
    } finally {
      if (this.isLatestRequest(workspaceId, requestId)) {
        this.isLoading.set(false);
      }
    }
  }

  private localDateKey(date = new Date()): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  private async persistUpdate(
    id: string,
    changes: ExpenseUpdateInput | { readonly deleted_at: string },
  ): Promise<{ readonly data: Expense | null; readonly error: Error | null }> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId) return { data: null, error: new Error('Kein aktiver Workspace.') };
    const existing = this.expensesRaw().find((expense) => expense.id === id);

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
      if (this.isCurrentWorkspace(workspaceId)) {
        this.expensesRaw.update((current) =>
          current.map((expense) => (expense.id === id ? updated : expense)),
        );
      }
      return { data: updated, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Ändern der Ausgabe', cause) };
    }
  }

  private resetWorkspaceContext(workspaceId: string | null): boolean {
    if (this.workspaceContextId === workspaceId) return false;
    this.workspaceContextId = workspaceId;
    this.lastSyncedContext = null;
    this.syncPromises.clear();
    this.loadRequestSequence += 1;
    this.expensesRaw.set([]);
    this.loadError.set(null);
    this.isLoading.set(false);
    return true;
  }

  private isCurrentWorkspace(workspaceId: string): boolean {
    return (
      this.workspaceContextId === workspaceId &&
      this.workspace.currentWorkspace()?.id === workspaceId
    );
  }

  private isLatestRequest(workspaceId: string, requestId: number): boolean {
    return this.isCurrentWorkspace(workspaceId) && this.loadRequestSequence === requestId;
  }

  private syncContext(workspaceId: string, dateKey: string): string {
    return `${workspaceId}:${dateKey}`;
  }
}
