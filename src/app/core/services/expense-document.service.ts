import { inject, Injectable, signal } from '@angular/core';
import {
  EXPENSE_DOCUMENT_BUCKET,
  ExpenseDocument,
  ExpenseDocumentType,
  expenseDocumentExtension,
  expenseDocumentPath,
  validateExpenseDocumentFile,
} from '../models/expense-document.models';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const DEMO_MESSAGE =
  'Im Demo-Modus werden keine Ausgabenbelege gespeichert. Melde dich an, um Originaldateien abzulegen.';

@Injectable({ providedIn: 'root' })
export class ExpenseDocumentService {
  private readonly supabase = inject(SupabaseService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly auth = inject(AuthService, { optional: true });

  private readonly documentsRaw = signal<readonly ExpenseDocument[]>([]);
  readonly documents = this.documentsRaw.asReadonly();
  private readonly documentCountsRaw = signal<ReadonlyMap<string, number>>(new Map());
  readonly documentCountsByExpense = this.documentCountsRaw.asReadonly();
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);

  hasDocuments(expenseId: string): boolean {
    return (this.documentCountsRaw().get(expenseId) ?? 0) > 0;
  }

  async loadSummaryForExpenses(expenseIds: readonly string[]): Promise<void> {
    const uniqueExpenseIds = [...new Set(expenseIds.filter(Boolean))];
    if (uniqueExpenseIds.length === 0 || this.mockStore.isDemoMode()) {
      this.documentCountsRaw.set(new Map());
      return;
    }

    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) {
      this.documentCountsRaw.set(new Map());
      return;
    }

    try {
      const { data, error } = await this.supabase.client
        .from('expense_documents')
        .select('expense_id')
        .eq('workspace_id', workspace.id)
        .in('expense_id', uniqueExpenseIds);
      if (error) throw error;

      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        counts.set(row.expense_id, (counts.get(row.expense_id) ?? 0) + 1);
      }
      this.documentCountsRaw.set(counts);
    } catch (cause: unknown) {
      this.documentCountsRaw.set(new Map());
      this.syncStatus.melde('Laden der Ausgabenbelegübersicht', cause);
    }
  }

  async loadForExpense(expenseId: string): Promise<void> {
    this.loadError.set(null);
    if (this.mockStore.isDemoMode()) {
      this.documentsRaw.set([]);
      return;
    }

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('expense_documents')
        .select('*')
        .eq('expense_id', expenseId)
        .order('created_at', { ascending: true });
      if (error) {
        this.loadError.set(this.syncStatus.melde('Laden der Ausgabenbelege', error).message);
        return;
      }
      const documents = (data ?? []) as ExpenseDocument[];
      this.documentsRaw.set(documents);
      this.setDocumentCount(expenseId, documents.length);
    } catch (cause: unknown) {
      this.loadError.set(this.syncStatus.melde('Laden der Ausgabenbelege', cause).message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async upload(
    expenseId: string,
    file: File,
    documentType: ExpenseDocumentType,
  ): Promise<{ data: ExpenseDocument | null; error: Error | null }> {
    const invalid = validateExpenseDocumentFile(file);
    if (invalid) return { data: null, error: invalid };
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_MESSAGE) };

    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace') };

    const extension = expenseDocumentExtension(file);
    if (!extension) return { data: null, error: new Error('Die Dateiendung passt nicht zum Typ.') };

    const id = crypto.randomUUID();
    const path = expenseDocumentPath(workspace.id, expenseId, id, extension);
    let uploadedPath: string | null = null;

    try {
      const { error: uploadError } = await this.supabase.client.storage
        .from(EXPENSE_DOCUMENT_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPath = path;

      const { data, error } = await this.supabase.client
        .from('expense_documents')
        .insert({
          id,
          workspace_id: workspace.id,
          expense_id: expenseId,
          document_type: documentType,
          original_file_name: file.name,
          storage_path: path,
          mime_type: file.type,
          file_size: file.size,
          created_by: this.auth?.currentUser()?.id ?? null,
        })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Der Belegeintrag wurde nicht zurückgegeben.');

      uploadedPath = null;
      const document = data as ExpenseDocument;
      this.documentsRaw.update((current) => [...current, document]);
      this.setDocumentCount(expenseId, (this.documentCountsRaw().get(expenseId) ?? 0) + 1);
      return { data: document, error: null };
    } catch (cause: unknown) {
      const failure = this.syncStatus.melde('Speichern des Ausgabenbelegs', cause);
      if (uploadedPath) {
        const cleanup = await this.supabase.client.storage
          .from(EXPENSE_DOCUMENT_BUCKET)
          .remove([uploadedPath]);
        if (cleanup.error) {
          return {
            data: null,
            error: new Error(`${failure.message} Nicht entfernt: ${uploadedPath}.`),
          };
        }
      }
      return { data: null, error: failure };
    }
  }

  async download(document: ExpenseDocument): Promise<{ data: Blob | null; error: Error | null }> {
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_MESSAGE) };
    try {
      const { data, error } = await this.supabase.client.storage
        .from(EXPENSE_DOCUMENT_BUCKET)
        .download(document.storage_path);
      if (error || !data) throw error ?? new Error('Die Datei wurde nicht zurückgegeben.');
      return { data, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Öffnen des Ausgabenbelegs', cause) };
    }
  }

  async remove(document: ExpenseDocument): Promise<{ error: Error | null }> {
    if (this.mockStore.isDemoMode()) return { error: new Error(DEMO_MESSAGE) };
    try {
      const { data, error } = await this.supabase.client
        .from('expense_documents')
        .delete()
        .eq('id', document.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        return {
          error: new Error('Der Beleg wurde nicht gefunden oder darf nicht entfernt werden.'),
        };
      }

      const cleanup = await this.supabase.client.storage
        .from(EXPENSE_DOCUMENT_BUCKET)
        .remove([document.storage_path]);
      this.documentsRaw.update((current) => current.filter((entry) => entry.id !== document.id));
      this.setDocumentCount(
        document.expense_id,
        Math.max(0, (this.documentCountsRaw().get(document.expense_id) ?? 1) - 1),
      );
      if (cleanup.error) {
        return {
          error: this.syncStatus.melde(
            'Entfernen der Ausgabenbelegdatei',
            new Error(`Der Eintrag ist entfernt, die Datei nicht: ${document.storage_path}.`),
          ),
        };
      }
      return { error: null };
    } catch (cause: unknown) {
      return { error: this.syncStatus.melde('Entfernen des Ausgabenbelegs', cause) };
    }
  }

  private setDocumentCount(expenseId: string, count: number): void {
    this.documentCountsRaw.update((current) => {
      const next = new Map(current);
      if (count > 0) next.set(expenseId, count);
      else next.delete(expenseId);
      return next;
    });
  }
}
