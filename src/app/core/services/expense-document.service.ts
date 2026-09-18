import { inject, Injectable, signal } from '@angular/core';
import {
  EXPENSE_DOCUMENT_BUCKET,
  ExpenseDocument,
  ExpenseDocumentType,
  expenseDocumentPath,
} from '../models/expense-document.models';
import {
  privateDocumentExtension,
  validatePrivateDocumentFile,
} from '../models/private-document.models';
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
  private readonly auth = inject(AuthService);

  readonly documents = signal<readonly ExpenseDocument[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);

  async loadForExpense(expenseId: string): Promise<void> {
    this.loadError.set(null);
    if (this.mockStore.isDemoMode()) {
      this.documents.set([]);
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
      this.documents.set((data ?? []) as ExpenseDocument[]);
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
    const invalid = validatePrivateDocumentFile(file);
    if (invalid) return { data: null, error: invalid };
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_MESSAGE) };

    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace.') };

    const extension = privateDocumentExtension(file);
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
          created_by: this.auth.currentUser()?.id ?? null,
        })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Der Belegeintrag wurde nicht zurückgegeben.');

      uploadedPath = null;
      const document = data as ExpenseDocument;
      this.documents.update((current) => [...current, document]);
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
      if (!data?.length) return { error: new Error('Der Ausgabenbeleg wurde nicht gefunden.') };

      const cleanup = await this.supabase.client.storage
        .from(EXPENSE_DOCUMENT_BUCKET)
        .remove([document.storage_path]);
      this.documents.update((current) => current.filter((entry) => entry.id !== document.id));
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
}
