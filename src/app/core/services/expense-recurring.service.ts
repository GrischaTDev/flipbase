import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  ExpenseRecurringRule,
  ExpenseRecurringRuleInput,
  UpcomingExpense,
} from '../models/expense.models';
import { dueOccurrences, nextOccurrence } from '../utils/expense-recurrence';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

@Injectable({ providedIn: 'root' })
export class ExpenseRecurringService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspace = inject(WorkspaceService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly auth = inject(AuthService);
  private workspaceContextId: string | null = null;
  private loadRequestSequence = 0;

  private readonly rulesRaw = signal<readonly ExpenseRecurringRule[]>([]);
  readonly rules = computed(() =>
    [...this.rulesRaw()].sort((a, b) => a.title.localeCompare(b.title, 'de-DE')),
  );
  readonly isLoading = signal(false);
  readonly loadError = signal<Error | null>(null);

  constructor() {
    try {
      effect(() => {
        this.resetWorkspaceContext(this.workspace.currentWorkspace()?.id ?? null);
      });
    } catch {
      // Einige fokussierte Service-Tests haben keinen Angular-Scheduler.
    }
  }

  async load(): Promise<boolean> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId) {
      return false;
    }
    if (this.mockStore.isDemoMode()) {
      if (this.isCurrentWorkspace(workspaceId)) this.rulesRaw.set([]);
      return this.isCurrentWorkspace(workspaceId);
    }

    const requestId = ++this.loadRequestSequence;
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const { data, error } = await this.supabase.client
        .from('expense_recurring_rules')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('start_date', { ascending: true });
      if (!this.isLatestRequest(workspaceId, requestId)) return false;
      if (error) throw error;
      this.rulesRaw.set((data ?? []) as unknown as ExpenseRecurringRule[]);
      return true;
    } catch (cause: unknown) {
      if (!this.isLatestRequest(workspaceId, requestId)) return false;
      const error = this.syncStatus.melde('Laden der wiederkehrenden Ausgaben', cause);
      this.loadError.set(error);
      this.rulesRaw.set([]);
      return false;
    } finally {
      if (this.isLatestRequest(workspaceId, requestId)) {
        this.isLoading.set(false);
      }
    }
  }

  async create(
    input: ExpenseRecurringRuleInput,
  ): Promise<{ readonly data: ExpenseRecurringRule | null; readonly error: Error | null }> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId) return { data: null, error: new Error('Kein aktiver Workspace.') };
    if (this.mockStore.isDemoMode())
      return {
        data: null,
        error: new Error('Wiederkehrende Ausgaben werden im Demo-Modus nicht gespeichert.'),
      };

    try {
      const { data, error } = await this.supabase.client
        .from('expense_recurring_rules')
        .insert({
          ...input,
          workspace_id: workspaceId,
          created_by: this.auth.currentUser()?.id ?? null,
        })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Die Regel wurde nicht zurückgegeben.');
      const rule = data as unknown as ExpenseRecurringRule;
      if (this.isCurrentWorkspace(workspaceId)) {
        this.rulesRaw.update((current) => [...current, rule]);
      }
      return { data: rule, error: null };
    } catch (cause: unknown) {
      return {
        data: null,
        error: this.syncStatus.melde('Speichern der wiederkehrenden Ausgabe', cause),
      };
    }
  }

  async update(
    id: string,
    input: Partial<ExpenseRecurringRuleInput>,
  ): Promise<{ readonly data: ExpenseRecurringRule | null; readonly error: Error | null }> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId) return { data: null, error: new Error('Kein aktiver Workspace.') };
    if (this.mockStore.isDemoMode())
      return {
        data: null,
        error: new Error('Wiederkehrende Ausgaben werden im Demo-Modus nicht gespeichert.'),
      };

    try {
      const { data, error } = await this.supabase.client
        .from('expense_recurring_rules')
        .update(input)
        .eq('workspace_id', workspaceId)
        .eq('id', id)
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Die Regel wurde nicht zurückgegeben.');
      const updated = data as unknown as ExpenseRecurringRule;
      if (this.isCurrentWorkspace(workspaceId)) {
        this.rulesRaw.update((rules) => rules.map((rule) => (rule.id === id ? updated : rule)));
      }
      return { data: updated, error: null };
    } catch (cause: unknown) {
      return {
        data: null,
        error: this.syncStatus.melde('Ändern der wiederkehrenden Ausgabe', cause),
      };
    }
  }

  async setActive(id: string, isActive: boolean): Promise<{ readonly error: Error | null }> {
    const result = await this.update(id, { is_active: isActive });
    return { error: result.error };
  }

  async materializeDue(
    throughDate: string,
  ): Promise<{ readonly count: number; readonly error: Error | null }> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId) return { count: 0, error: new Error('Kein aktiver Workspace.') };
    if (this.mockStore.isDemoMode()) return { count: 0, error: null };

    const candidates = this.rulesRaw()
      .filter((rule) => rule.workspace_id === workspaceId && rule.is_active)
      .flatMap((rule) =>
        dueOccurrences(rule, throughDate).map((occurrenceDate) => ({
          id: crypto.randomUUID(),
          workspace_id: workspaceId,
          category_id: rule.category_id,
          recurring_rule_id: rule.id,
          occurrence_date: occurrenceDate,
          title: rule.title,
          vendor_name: rule.vendor_name,
          quantity: rule.quantity,
          gross_amount: rule.gross_amount,
          vat_rate: rule.vat_rate,
          expense_date: occurrenceDate,
          due_date: occurrenceDate,
          status: 'open',
          payment_date: null,
          notes: rule.notes,
          created_by: this.auth.currentUser()?.id ?? null,
        })),
      );

    if (candidates.length === 0) return { count: 0, error: null };

    try {
      const { error } = await this.supabase.client.from('expenses').upsert(candidates, {
        onConflict: 'workspace_id,recurring_rule_id,occurrence_date',
        ignoreDuplicates: true,
      });
      if (error) throw error;
      return { count: candidates.length, error: null };
    } catch (cause: unknown) {
      return {
        count: 0,
        error: this.syncStatus.melde('Erzeugen fälliger Ausgaben', cause),
      };
    }
  }

  upcoming(fromDate: string, days = 30): readonly UpcomingExpense[] {
    const through = addCalendarDays(fromDate, days);
    const upcoming: UpcomingExpense[] = [];
    for (const rule of this.rulesRaw().filter((entry) => entry.is_active)) {
      let cursor = fromDate;
      while (true) {
        const occurrence = nextOccurrence(rule, cursor);
        if (!occurrence || occurrence > through) break;
        upcoming.push({
          ruleId: rule.id,
          title: rule.title,
          categoryId: rule.category_id,
          vendorName: rule.vendor_name,
          quantity: rule.quantity,
          grossAmount: rule.gross_amount,
          occurrenceDate: occurrence,
        });
        cursor = occurrence;
      }
    }
    return upcoming.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
  }

  private resetWorkspaceContext(workspaceId: string | null): boolean {
    if (this.workspaceContextId === workspaceId) return false;
    this.workspaceContextId = workspaceId;
    this.loadRequestSequence += 1;
    this.rulesRaw.set([]);
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
}
