import { computed, inject, Injectable, signal } from '@angular/core';
import { ExpenseCategory } from '../models/expense.models';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const DEMO_ERROR = 'Im Demo-Modus werden keine Ausgabenkategorien dauerhaft gespeichert.';

@Injectable({ providedIn: 'root' })
export class ExpenseCategoryService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly auth = inject(AuthService);

  readonly categories = signal<readonly ExpenseCategory[]>([]);
  readonly activeCategories = computed(() =>
    this.categories().filter((category) => !category.is_archived),
  );
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);

  async loadCurrentWorkspace(): Promise<void> {
    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) {
      this.categories.set([]);
      return;
    }
    if (this.mockStore.isDemoMode()) {
      this.categories.set([]);
      return;
    }

    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const { data, error } = await this.supabase.client
        .from('expense_categories')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) {
        this.loadError.set(this.syncStatus.melde('Laden der Ausgabenkategorien', error).message);
        return;
      }
      this.categories.set((data ?? []) as ExpenseCategory[]);
    } catch (cause: unknown) {
      this.loadError.set(this.syncStatus.melde('Laden der Ausgabenkategorien', cause).message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async create(name: string): Promise<{ data: ExpenseCategory | null; error: Error | null }> {
    const workspace = this.workspaceService.currentWorkspace();
    const trimmed = name.trim();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace.') };
    if (!trimmed) return { data: null, error: new Error('Der Kategoriename darf nicht leer sein.') };
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_ERROR) };

    try {
      const nextSort =
        Math.max(0, ...this.categories().map((category) => category.sort_order)) + 10;
      const { data, error } = await this.supabase.client
        .from('expense_categories')
        .insert({
          workspace_id: workspace.id,
          name: trimmed,
          sort_order: nextSort,
          is_default: false,
          created_by: this.auth.currentUser()?.id ?? null,
        })
        .select()
        .single();
      if (error || !data) {
        return {
          data: null,
          error: this.syncStatus.melde(
            'Anlegen der Ausgabenkategorie',
            error ?? new Error('Kategorie wurde nicht zurückgegeben.'),
          ),
        };
      }

      const category = data as ExpenseCategory;
      this.categories.update((current) => [...current, category]);
      return { data: category, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Anlegen der Ausgabenkategorie', cause) };
    }
  }

  async rename(
    id: string,
    name: string,
  ): Promise<{ data: ExpenseCategory | null; error: Error | null }> {
    const trimmed = name.trim();
    if (!trimmed) return { data: null, error: new Error('Der Kategoriename darf nicht leer sein.') };
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_ERROR) };
    return this.updateCategory(id, { name: trimmed }, 'Umbenennen der Ausgabenkategorie');
  }

  async setArchived(
    id: string,
    archived: boolean,
  ): Promise<{ data: ExpenseCategory | null; error: Error | null }> {
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_ERROR) };
    return this.updateCategory(
      id,
      { is_archived: archived },
      archived ? 'Archivieren der Ausgabenkategorie' : 'Wiederherstellen der Ausgabenkategorie',
    );
  }

  private async updateCategory(
    id: string,
    values: Pick<Partial<ExpenseCategory>, 'name' | 'is_archived'>,
    operation: string,
  ): Promise<{ data: ExpenseCategory | null; error: Error | null }> {
    try {
      const { data, error } = await this.supabase.client
        .from('expense_categories')
        .update(values)
        .eq('id', id)
        .select();
      if (error || !data?.[0]) {
        return {
          data: null,
          error: this.syncStatus.melde(
            operation,
            error ?? new Error('Kategorie wurde nicht zurückgegeben.'),
          ),
        };
      }

      const category = data[0] as ExpenseCategory;
      this.categories.update((current) =>
        current.map((entry) => (entry.id === category.id ? category : entry)),
      );
      return { data: category, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde(operation, cause) };
    }
  }
}
