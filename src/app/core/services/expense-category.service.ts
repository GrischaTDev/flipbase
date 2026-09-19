import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { ExpenseCategory } from '../models/expense.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

function sortCategories(categories: readonly ExpenseCategory[]): ExpenseCategory[] {
  return [...categories].sort(
    (left, right) =>
      left.sort_order - right.sort_order || left.name.localeCompare(right.name, 'de-DE'),
  );
}

@Injectable({ providedIn: 'root' })
export class ExpenseCategoryService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspace = inject(WorkspaceService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly auth = inject(AuthService);
  private workspaceContextId: string | null = null;
  private loadRequestSequence = 0;

  private readonly categoriesRaw = signal<readonly ExpenseCategory[]>([]);
  readonly categories = computed(() =>
    sortCategories(this.categoriesRaw().filter((category) => !category.is_archived)),
  );
  readonly allCategories = computed(() => sortCategories(this.categoriesRaw()));
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

    const requestId = ++this.loadRequestSequence;
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const { data, error } = await this.supabase.client
        .from('expense_categories')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('sort_order', { ascending: true });
      if (!this.isLatestRequest(workspaceId, requestId)) return false;
      if (error) throw error;
      this.categoriesRaw.set((data ?? []) as ExpenseCategory[]);
      return true;
    } catch (cause: unknown) {
      if (!this.isLatestRequest(workspaceId, requestId)) return false;
      const error = this.syncStatus.melde('Laden der Ausgabenkategorien', cause);
      this.loadError.set(error);
      this.categoriesRaw.set([]);
      return false;
    } finally {
      if (this.isLatestRequest(workspaceId, requestId)) {
        this.isLoading.set(false);
      }
    }
  }

  async create(
    name: string,
  ): Promise<{ readonly data: ExpenseCategory | null; readonly error: Error | null }> {
    const trimmed = name.trim();
    if (!trimmed) return { data: null, error: new Error('Bitte einen Kategorienamen eingeben.') };
    if (trimmed.length > 80)
      return { data: null, error: new Error('Der Kategoriename darf höchstens 80 Zeichen haben.') };

    const workspaceId = this.workspace.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId) return { data: null, error: new Error('Kein aktiver Workspace.') };

    try {
      const { data, error } = await this.supabase.client
        .from('expense_categories')
        .insert({
          workspace_id: workspaceId,
          name: trimmed,
          sort_order: Math.max(0, ...this.categoriesRaw().map((entry) => entry.sort_order)) + 10,
          is_default: false,
          is_archived: false,
          created_by: this.auth.currentUser()?.id ?? null,
        })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Die Kategorie wurde nicht zurückgegeben.');
      const category = data as ExpenseCategory;
      if (this.isCurrentWorkspace(workspaceId)) {
        this.categoriesRaw.update((current) => [...current, category]);
      }
      return { data: category, error: null };
    } catch (cause: unknown) {
      return {
        data: null,
        error: this.syncStatus.melde('Speichern der Ausgabenkategorie', cause),
      };
    }
  }

  rename(
    id: string,
    name: string,
  ): Promise<{ readonly data: ExpenseCategory | null; readonly error: Error | null }> {
    return this.updateCategory(id, { name: name.trim() });
  }

  async archive(id: string): Promise<{ readonly error: Error | null }> {
    const result = await this.updateCategory(id, { is_archived: true });
    return { error: result.error };
  }

  async restore(id: string): Promise<{ readonly error: Error | null }> {
    const result = await this.updateCategory(id, { is_archived: false });
    return { error: result.error };
  }

  private async updateCategory(
    id: string,
    changes: { readonly name?: string; readonly is_archived?: boolean },
  ): Promise<{ readonly data: ExpenseCategory | null; readonly error: Error | null }> {
    if (changes.name !== undefined && !changes.name)
      return { data: null, error: new Error('Bitte einen Kategorienamen eingeben.') };

    const workspaceId = this.workspace.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId) return { data: null, error: new Error('Kein aktiver Workspace.') };

    try {
      const { data, error } = await this.supabase.client
        .from('expense_categories')
        .update(changes)
        .eq('workspace_id', workspaceId)
        .eq('id', id)
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Die Kategorie wurde nicht zurückgegeben.');
      const updated = data as ExpenseCategory;
      if (this.isCurrentWorkspace(workspaceId)) {
        this.categoriesRaw.update((categories) =>
          categories.map((category) => (category.id === id ? updated : category)),
        );
      }
      return { data: updated, error: null };
    } catch (cause: unknown) {
      return {
        data: null,
        error: this.syncStatus.melde('Ändern der Ausgabenkategorie', cause),
      };
    }
  }

  private resetWorkspaceContext(workspaceId: string | null): boolean {
    if (this.workspaceContextId === workspaceId) return false;
    this.workspaceContextId = workspaceId;
    this.loadRequestSequence += 1;
    this.categoriesRaw.set([]);
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
