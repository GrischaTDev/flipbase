import { inject, Injectable, signal } from '@angular/core';
import {
  OperatingExpenseDocument,
  OperatingExpenseDocumentType,
  OPERATING_EXPENSE_DOCUMENT_BUCKET,
  operatingExpenseDocumentExtension,
  operatingExpenseDocumentPath,
  validateOperatingExpenseDocumentFile,
} from '../models/operating-expense.models';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const DEMO_MESSAGE =
  'Im Demo-Modus werden keine Ausgabenbelege gespeichert. Melde dich an, um Originaldateien abzulegen.';

@Injectable({ providedIn: 'root' })
export class OperatingExpenseDocumentService {
  private readonly supabase = inject(SupabaseService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly auth = inject(AuthService, { optional: true });

  private readonly documentsRaw = signal<readonly OperatingExpenseDocument[]>([]);
  readonly documents = this.documentsRaw.asReadonly();
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);

  async loadForExpense(expenseId: string): Promise<void> {
    this.loadError.set(null);
    if (this.mockStore.isDemoMode()) {
      this.documentsRaw.set([]);
      return;
    }
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('operating_expense_documents')
        .select('*')
        .eq('expense_id', expenseId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      this.documentsRaw.set((data ?? []) as OperatingExpenseDocument[]);
    } catch (cause: unknown) {
      this.loadError.set(this.syncStatus.melde('Laden der Ausgabenbelege', cause).message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async upload(
    expenseId: string,
    file: File,
    documentType: OperatingExpenseDocumentType,
  ): Promise<{ data: OperatingExpenseDocument | null; error: Error | null }> {
    const invalid = validateOperatingExpenseDocumentFile(file);
    if (invalid) return { data: null, error: invalid };
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_MESSAGE) };

    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace') };
    const extension = operatingExpenseDocumentExtension(file);
    if (!extension) return { data: null, error: new Error('Die Dateiendung passt nicht zum Typ.') };

    const id = crypto.randomUUID();
    const path = operatingExpenseDocumentPath(workspace.id, expenseId, id, extension);
    let uploadedPath: string | null = null;

    try {
      const { error: uploadError } = await this.supabase.client.storage
        .from(OPERATING_EXPENSE_DOCUMENT_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPath = path;

      const { data, error } = await this.supabase.client
        .from('operating_expense_documents')
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
      const document = data as OperatingExpenseDocument;
      this.documentsRaw.update((current) => [...current, document]);
      return { data: document, error: null };
    } catch (cause: unknown) {
      const failure = this.syncStatus.melde('Speichern des Ausgabenbelegs', cause);
      if (uploadedPath) {
        const cleanup = await this.supabase.client.storage
          .from(OPERATING_EXPENSE_DOCUMENT_BUCKET)
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

  async download(
    document: OperatingExpenseDocument,
  ): Promise<{ data: Blob | null; error: Error | null }> {
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_MESSAGE) };
    try {
      const { data, error } = await this.supabase.client.storage
        .from(OPERATING_EXPENSE_DOCUMENT_BUCKET)
        .download(document.storage_path);
      if (error || !data) throw error ?? new Error('Die Datei wurde nicht zurückgegeben.');
      return { data, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Öffnen des Ausgabenbelegs', cause) };
    }
  }

  async remove(document: OperatingExpenseDocument): Promise<{ error: Error | null }> {
    if (this.mockStore.isDemoMode()) return { error: new Error(DEMO_MESSAGE) };
    try {
      const { data, error } = await this.supabase.client
        .from('operating_expense_documents')
        .delete()
        .eq('id', document.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        return { error: new Error('Der Beleg wurde nicht gefunden oder konnte nicht entfernt werden.') };
      }

      const cleanup = await this.supabase.client.storage
        .from(OPERATING_EXPENSE_DOCUMENT_BUCKET)
        .remove([document.storage_path]);
      if (cleanup.error) throw cleanup.error;

      this.documentsRaw.update((current) => current.filter((entry) => entry.id !== document.id));
      return { error: null };
    } catch (cause: unknown) {
      return { error: this.syncStatus.melde('Entfernen des Ausgabenbelegs', cause) };
    }
  }

  async removeAllForExpense(expenseId: string): Promise<{ error: Error | null }> {
    if (this.mockStore.isDemoMode()) return { error: new Error(DEMO_MESSAGE) };
    try {
      const { data, error } = await this.supabase.client
        .from('operating_expense_documents')
        .delete()
        .eq('expense_id', expenseId)
        .select();
      if (error) throw error;

      const documents = (data ?? []) as OperatingExpenseDocument[];
      if (documents.length > 0) {
        const cleanup = await this.supabase.client.storage
          .from(OPERATING_EXPENSE_DOCUMENT_BUCKET)
          .remove(documents.map((document) => document.storage_path));
        if (cleanup.error) throw cleanup.error;
      }
      this.documentsRaw.update((current) => current.filter((item) => item.expense_id !== expenseId));
      return { error: null };
    } catch (cause: unknown) {
      return { error: this.syncStatus.melde('Entfernen der Ausgabenbelege', cause) };
    }
  }
}
