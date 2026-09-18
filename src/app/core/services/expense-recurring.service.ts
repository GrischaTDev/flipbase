import { inject, Injectable, signal } from '@angular/core';
import { ExpenseRecurringRule, ExpenseRecurringRuleInput } from '../models/expense.models';
import { nextOccurrence } from '../utils/expense-recurrence';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const DEMO_ERROR = 'Im Demo-Modus werden keine wiederkehrenden Ausgaben dauerhaft gespeichert.';

@Injectable({ providedIn: 'root' })
export class ExpenseRecurringService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly auth = inject(AuthService);

  readonly rules = signal<readonly ExpenseRecurringRule[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);

  async loadCurrentWorkspace(): Promise<void> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) {
      this.rules.set([]);
      return;
    }
    if (this.mockStore.isDemoMode()) {
      this.rules.set([]);
      return;
    }

    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const { data, error } = await this.supabase.client
        .from('expense_recurring_rules')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('start_date', { ascending: true });
      if (error) {
        this.loadError.set(
          this.syncStatus.melde('Laden der wiederkehrenden Ausgaben', error).message,
        );
        return;
      }
      this.rules.set((data ?? []) as ExpenseRecurringRule[]);
    } catch (cause: unknown) {
      this.loadError.set(
        this.syncStatus.melde('Laden der wiederkehrenden Ausgaben', cause).message,
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async create(
    input: ExpenseRecurringRuleInput,
  ): Promise<{ data: ExpenseRecurringRule | null; error: Error | null }> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace.') };
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_ERROR) };

    try {
      const { data, error } = await this.supabase.client
        .from('expense_recurring_rules')
        .insert({
          ...this.payload(input),
          workspace_id: workspace.id,
          created_by: this.auth.currentUser()?.id ?? null,
        })
        .select()
        .single();
      if (error || !data) {
        return {
          data: null,
          error: this.syncStatus.melde(
            'Anlegen der wiederkehrenden Ausgabe',
            error ?? new Error('Regel wurde nicht zurückgegeben.'),
          ),
        };
      }
      const rule = data as ExpenseRecurringRule;
      this.rules.update((current) => [...current, rule]);
      return { data: rule, error: null };
    } catch (cause: unknown) {
      return {
        data: null,
        error: this.syncStatus.melde('Anlegen der wiederkehrenden Ausgabe', cause),
      };
    }
  }

  async update(
    id: string,
    input: ExpenseRecurringRuleInput,
  ): Promise<{ data: ExpenseRecurringRule | null; error: Error | null }> {
    return this.updateRule(id, this.payload(input), 'Ändern der wiederkehrenden Ausgabe');
  }

  async setActive(
    id: string,
    active: boolean,
  ): Promise<{ data: ExpenseRecurringRule | null; error: Error | null }> {
    return this.updateRule(
      id,
      { is_active: active },
      active ? 'Aktivieren der wiederkehrenden Ausgabe' : 'Deaktivieren der wiederkehrenden Ausgabe',
    );
  }

  nextDue(rule: ExpenseRecurringRule, afterDate: string): string | null {
    return nextOccurrence(rule, afterDate);
  }

  private payload(input: ExpenseRecurringRuleInput) {
    return {
      category_id: input.category_id,
      title: input.title.trim(),
      gross_amount: input.gross_amount,
      vat_rate: input.vat_rate,
      frequency: input.frequency,
      start_date: input.start_date,
      end_date: input.end_date,
      is_active: input.is_active,
      notes: input.notes?.trim() || null,
    };
  }

  private async updateRule(
    id: string,
    values: Partial<ExpenseRecurringRuleInput>,
    operation: string,
  ): Promise<{ data: ExpenseRecurringRule | null; error: Error | null }> {
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_ERROR) };
    try {
      const { data, error } = await this.supabase.client
        .from('expense_recurring_rules')
        .update(values)
        .eq('id', id)
        .select()
        .single();
      if (error || !data) {
        return {
          data: null,
          error: this.syncStatus.melde(
            operation,
            error ?? new Error('Regel wurde nicht zurückgegeben.'),
          ),
        };
      }
      const rule = data as ExpenseRecurringRule;
      this.rules.update((current) =>
        current.map((entry) => (entry.id === rule.id ? rule : entry)),
      );
      return { data: rule, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde(operation, cause) };
    }
  }
}
