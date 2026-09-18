import { effect, inject, Injectable, signal } from '@angular/core';
import {
  OperatingExpense,
  OperatingExpenseCategory,
  OperatingExpenseCreateInput,
  RecurringOperatingExpense,
  RecurringOperatingExpenseCreateInput,
} from '../models/operating-expense.models';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

@Injectable({ providedIn: 'root' })
export class OperatingExpenseService {
  private readonly supabase = inject(SupabaseService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly auth = inject(AuthService, { optional: true });

  private readonly categoriesRaw = signal<readonly OperatingExpenseCategory[]>([]);
  private readonly expensesRaw = signal<readonly OperatingExpense[]>([]);
  private readonly recurringRulesRaw = signal<readonly RecurringOperatingExpense[]>([]);

  readonly categories = this.categoriesRaw.asReadonly();
  readonly expenses = this.expensesRaw.asReadonly();
  readonly recurringRules = this.recurringRulesRaw.asReadonly();
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);

  private currentRequestId = 0;

  constructor() {
    try {
      effect(() => {
        const workspace = this.workspaceService.currentWorkspace();
        if (workspace) {
          void this.loadWorkspace(workspace.id);
        } else {
          this.currentRequestId += 1;
          this.categoriesRaw.set([]);
          this.expensesRaw.set([]);
          this.recurringRulesRaw.set([]);
        }
      });
    } catch {
      // Tests, die den Dienst ohne Angular-Scheduler erzeugen, laden explizit.
    }
  }

  async loadWorkspace(workspaceId: string, throughDate = this.today()): Promise<void> {
    const requestId = ++this.currentRequestId;
    this.loadError.set(null);

    if (this.mockStore.isDemoMode()) {
      this.categoriesRaw.set([]);
      this.expensesRaw.set([]);
      this.recurringRulesRaw.set([]);
      return;
    }

    this.isLoading.set(true);
    try {
      const materialized = await this.supabase.client.rpc('materialize_due_operating_expenses', {
        p_workspace_id: workspaceId,
        p_through_date: throughDate,
      });
      if (materialized.error) throw materialized.error;

      const [categories, recurringRules, expenses] = await Promise.all([
        this.supabase.client
          .from('operating_expense_categories')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('name', { ascending: true }),
        this.supabase.client
          .from('recurring_operating_expenses')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('next_due_date', { ascending: true }),
        this.supabase.client
          .from('operating_expenses')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('expense_date', { ascending: false }),
      ]);

      if (categories.error) throw categories.error;
      if (recurringRules.error) throw recurringRules.error;
      if (expenses.error) throw expenses.error;
      if (requestId !== this.currentRequestId) return;

      this.categoriesRaw.set((categories.data ?? []) as OperatingExpenseCategory[]);
      this.recurringRulesRaw.set((recurringRules.data ?? []) as RecurringOperatingExpense[]);
      this.expensesRaw.set((expenses.data ?? []) as OperatingExpense[]);
    } catch (cause: unknown) {
      if (requestId !== this.currentRequestId) return;
      this.loadError.set(this.syncStatus.melde('Laden der Ausgaben', cause).message);
    } finally {
      if (requestId === this.currentRequestId) this.isLoading.set(false);
    }
  }

  async loadCurrentWorkspace(throughDate = this.today()): Promise<void> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) {
      this.categoriesRaw.set([]);
      this.expensesRaw.set([]);
      this.recurringRulesRaw.set([]);
      return;
    }
    await this.loadWorkspace(workspace.id, throughDate);
  }

  async createCategory(
    name: string,
  ): Promise<{ data: OperatingExpenseCategory | null; error: Error | null }> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace') };
    const normalized = name.trim();
    if (!normalized) return { data: null, error: new Error('Bitte einen Kategorienamen eingeben.') };
    if (this.mockStore.isDemoMode()) {
      return { data: null, error: new Error('Im Demo-Modus werden Kategorien nicht gespeichert.') };
    }

    try {
      const { data, error } = await this.supabase.client
        .from('operating_expense_categories')
        .insert({
          workspace_id: workspace.id,
          name: normalized,
          default_key: null,
          created_by: this.auth?.currentUser()?.id ?? null,
        })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Die Kategorie wurde nicht zurückgegeben.');
      const category = data as OperatingExpenseCategory;
      this.categoriesRaw.update((current) =>
        [...current.filter((entry) => entry.id !== category.id), category].sort((a, b) =>
          a.name.localeCompare(b.name, 'de'),
        ),
      );
      return { data: category, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Speichern der Kategorie', cause) };
    }
  }

  async renameCategory(
    categoryId: string,
    name: string,
  ): Promise<{ data: OperatingExpenseCategory | null; error: Error | null }> {
    return this.updateCategory(categoryId, { name: name.trim() });
  }

  async archiveCategory(
    categoryId: string,
  ): Promise<{ data: OperatingExpenseCategory | null; error: Error | null }> {
    return this.updateCategory(categoryId, { archived_at: new Date().toISOString() });
  }

  async restoreCategory(
    categoryId: string,
  ): Promise<{ data: OperatingExpenseCategory | null; error: Error | null }> {
    return this.updateCategory(categoryId, { archived_at: null });
  }

  private async updateCategory(
    categoryId: string,
    patch: Record<string, unknown>,
  ): Promise<{ data: OperatingExpenseCategory | null; error: Error | null }> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace') };
    try {
      const { data, error } = await this.supabase.client
        .from('operating_expense_categories')
        .update(patch)
        .eq('id', categoryId)
        .eq('workspace_id', workspace.id)
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Die Kategorie wurde nicht zurückgegeben.');
      const category = data as OperatingExpenseCategory;
      this.categoriesRaw.update((current) =>
        current.map((entry) => (entry.id === category.id ? category : entry)),
      );
      return { data: category, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Aktualisieren der Kategorie', cause) };
    }
  }

  async createRecurringRule(
    input: RecurringOperatingExpenseCreateInput,
    throughDate = this.today(),
  ): Promise<{ data: RecurringOperatingExpense | null; error: Error | null }> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace') };
    if (this.mockStore.isDemoMode()) {
      return { data: null, error: new Error('Im Demo-Modus werden Fixkosten nicht gespeichert.') };
    }

    try {
      const { data, error } = await this.supabase.client
        .from('recurring_operating_expenses')
        .insert({
          workspace_id: workspace.id,
          category_id: input.categoryId,
          title: input.title.trim(),
          gross_amount: input.grossAmount,
          vat_rate: input.vatRate,
          interval: input.interval,
          start_date: input.startDate,
          end_date: input.endDate,
          next_due_date: input.startDate,
          created_by: this.auth?.currentUser()?.id ?? null,
        })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Die Fixkostenregel wurde nicht zurückgegeben.');
      const rule = data as RecurringOperatingExpense;
      this.recurringRulesRaw.update((current) => [...current, rule]);
      await this.loadWorkspace(workspace.id, throughDate);
      return { data: rule, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Speichern der Fixkosten', cause) };
    }
  }

  async archiveRecurringRule(
    ruleId: string,
  ): Promise<{ data: RecurringOperatingExpense | null; error: Error | null }> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace') };
    try {
      const { data, error } = await this.supabase.client
        .from('recurring_operating_expenses')
        .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', ruleId)
        .eq('workspace_id', workspace.id)
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Die Fixkostenregel wurde nicht zurückgegeben.');
      const rule = data as RecurringOperatingExpense;
      this.recurringRulesRaw.update((current) =>
        current.map((entry) => (entry.id === rule.id ? rule : entry)),
      );
      return { data: rule, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Archivieren der Fixkosten', cause) };
    }
  }

  async createExpense(
    input: OperatingExpenseCreateInput,
  ): Promise<{ data: OperatingExpense | null; error: Error | null }> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace') };
    if (this.mockStore.isDemoMode()) {
      return { data: null, error: new Error('Im Demo-Modus werden Ausgaben nicht gespeichert.') };
    }

    if (input.status === 'paid' && !input.paidAt) {
      return { data: null, error: new Error('Für eine bezahlte Ausgabe fehlt das Zahlungsdatum.') };
    }
    if (input.status === 'open' && input.paidAt) {
      return { data: null, error: new Error('Eine offene Ausgabe darf kein Zahlungsdatum haben.') };
    }

    try {
      const { data, error } = await this.supabase.client
        .from('operating_expenses')
        .insert({
          workspace_id: workspace.id,
          category_id: input.categoryId,
          recurring_rule_id: null,
          recurrence_date: null,
          title: input.title.trim(),
          gross_amount: input.grossAmount,
          vat_rate: input.vatRate,
          expense_date: input.expenseDate,
          status: input.status,
          due_date: input.status === 'open' ? input.dueDate : null,
          paid_at: input.status === 'paid' ? input.paidAt : null,
          created_by: this.auth?.currentUser()?.id ?? null,
        })
        .select()
        .single();

      if (error || !data) throw error ?? new Error('Die Ausgabe wurde nicht zurückgegeben.');
      const expense = data as OperatingExpense;
      this.expensesRaw.update((current) =>
        [expense, ...current.filter((entry) => entry.id !== expense.id)].sort((a, b) =>
          b.expense_date.localeCompare(a.expense_date),
        ),
      );
      return { data: expense, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Speichern der Ausgabe', cause) };
    }
  }

  async markPaid(
    expense: OperatingExpense,
    paidAt: string,
  ): Promise<{ data: OperatingExpense | null; error: Error | null }> {
    return this.updateExpense(expense.id, { status: 'paid', paid_at: paidAt, due_date: expense.due_date });
  }

  async markOpen(
    expense: OperatingExpense,
  ): Promise<{ data: OperatingExpense | null; error: Error | null }> {
    return this.updateExpense(expense.id, { status: 'open', paid_at: null });
  }

  private async updateExpense(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<{ data: OperatingExpense | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabase.client
        .from('operating_expenses')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Die Ausgabe wurde nicht zurückgegeben.');
      const expense = data as OperatingExpense;
      this.expensesRaw.update((current) =>
        current.map((entry) => (entry.id === expense.id ? expense : entry)),
      );
      return { data: expense, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Aktualisieren der Ausgabe', cause) };
    }
  }

  private today(): string {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${today.getFullYear()}-${month}-${day}`;
  }
}
