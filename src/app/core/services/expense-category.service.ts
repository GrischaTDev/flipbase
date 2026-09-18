import { computed, inject, Injectable, signal } from '@angular/core';
import { ExpenseCategory } from '../models/expense.models';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const DEFAULT_CATEGORY_NAMES = [
  'Versandmaterial',
  'Technik & Geräte',
  'Bürobedarf',
  'Software & Abos',
  'Hosting & Server',
  'Miete & Räume',
  'Werbung',
  'Dienstleistungen',
  'Gebühren',
  'Fahrzeug & Fahrtkosten',
  'Versicherungen',
  'Steuer & Beratung',
  'Sonstiges',
] as const;

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
  private readonly mockStore = inject(MockDataStoreService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly auth = inject(AuthService);

  private readonly categoriesRaw = signal<readonly ExpenseCategory[]>([]);
  readonly categories = computed(() =>
    sortCategories(this.categoriesRaw().filter((category) => !category.is_archived)),
  );
  readonly allCategories = computed(() => sortCategories(this.categoriesRaw()));
  readonly isLoading = signal(false);
  readonly loadError = signal<Error | null>(null);

  async load(): Promise<void> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!workspaceId) {
      this.categoriesRaw.set([]);
      return;
    }

    if (this.mockStore.isDemoMode()) {
      const now = new Date().toISOString();
      this.categoriesRaw.set(
        DEFAULT_CATEGORY_NAMES.map((name, index) => ({
          id: `demo-expense-category-${index + 1}`,
          workspace_id: workspaceId,
          name,
          sort_order: (index + 1) * 10,
          is_default: true,
          is_archived: false,
          created_at: now,
          created_by: null,
          updated_at: now,
        })),
      );
      return;
    }

    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const { data, error } = await this.supabase.client
        .from('expense_categories')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      this.categoriesRaw.set((data ?? []) as ExpenseCategory[]);
    } catch (cause: unknown) {
      const error = this.syncStatus.melde('Laden der Ausgabenkategorien', cause);
      this.loadError.set(error);
      this.categoriesRaw.set([]);
    } finally {
      this.isLoading.set(false);
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
    if (!workspaceId) return { data: null, error: new Error('Kein aktiver Workspace.') };

    if (this.mockStore.isDemoMode()) {
      const now = new Date().toISOString();
      const category: ExpenseCategory = {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        name: trimmed,
        sort_order: Math.max(0, ...this.categoriesRaw().map((entry) => entry.sort_order)) + 10,
        is_default: false,
        is_archived: false,
        created_at: now,
        created_by: this.auth.currentUser()?.id ?? null,
        updated_at: now,
      };
      this.categoriesRaw.update((current) => [...current, category]);
      return { data: category, error: null };
    }

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
      this.categoriesRaw.update((current) => [...current, category]);
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
    if (!workspaceId) return { data: null, error: new Error('Kein aktiver Workspace.') };

    const current = this.categoriesRaw().find((category) => category.id === id);
    if (this.mockStore.isDemoMode()) {
      if (!current) return { data: null, error: new Error('Kategorie nicht gefunden.') };
      const updated: ExpenseCategory = {
        ...current,
        ...changes,
        updated_at: new Date().toISOString(),
      };
      this.categoriesRaw.update((categories) =>
        categories.map((category) => (category.id === id ? updated : category)),
      );
      return { data: updated, error: null };
    }

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
      this.categoriesRaw.update((categories) =>
        categories.map((category) => (category.id === id ? updated : category)),
      );
      return { data: updated, error: null };
    } catch (cause: unknown) {
      return {
        data: null,
        error: this.syncStatus.melde('Ändern der Ausgabenkategorie', cause),
      };
    }
  }
}
