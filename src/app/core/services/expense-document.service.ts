import { effect, inject, Injectable, signal } from '@angular/core';
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
  private workspaceContextId: string | null = null;
  private documentRequestSequence = 0;
  private summaryRequestSequence = 0;

  private readonly documentsRaw = signal<readonly ExpenseDocument[]>([]);
  private readonly documentCounts = signal<ReadonlyMap<string, number>>(new Map());
  readonly documents = this.documentsRaw.asReadonly();
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);

  constructor() {
    try {
      effect(() => {
        this.resetWorkspaceContext(this.workspaceService.currentWorkspace()?.id ?? null);
      });
    } catch {
      // Einige fokussierte Service-Tests haben keinen Angular-Scheduler.
    }
  }

  hasDocuments(expenseId: string): boolean {
    return (this.documentCounts().get(expenseId) ?? 0) > 0;
  }

  async loadSummaryForExpenses(expenseIds: readonly string[]): Promise<boolean> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId) return false;

    const uniqueIds = [...new Set(expenseIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      this.documentCounts.set(new Map());
      return true;
    }

    if (this.mockStore.isDemoMode()) {
      if (this.isCurrentWorkspace(workspaceId)) this.documentCounts.set(new Map());
      return this.isCurrentWorkspace(workspaceId);
    }

    const requestId = ++this.summaryRequestSequence;

    try {
      const counts = new Map<string, number>();
      const batchSize = 100;
      const pageSize = 1000;
      for (let batchStart = 0; batchStart < uniqueIds.length; batchStart += batchSize) {
        const expenseIdBatch = uniqueIds.slice(batchStart, batchStart + batchSize);
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await this.supabase.client
            .from('expense_documents')
            .select('expense_id')
            .eq('workspace_id', workspaceId)
            .in('expense_id', expenseIdBatch)
            .order('expense_id', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);
          if (!this.isLatestSummaryRequest(workspaceId, requestId)) return false;
          if (error) throw error;

          const page = data ?? [];
          for (const row of page) {
            counts.set(row.expense_id, (counts.get(row.expense_id) ?? 0) + 1);
          }
          if (page.length < pageSize) break;
        }
      }

      this.documentCounts.update((current) => {
        const next = new Map(current);
        uniqueIds.forEach((id) => next.set(id, counts.get(id) ?? 0));
        return next;
      });
      return true;
    } catch (cause: unknown) {
      if (!this.isLatestSummaryRequest(workspaceId, requestId)) return false;
      this.syncStatus.melde('Laden des Ausgabenbelegstatus', cause);
      this.documentCounts.update((current) => {
        const next = new Map(current);
        uniqueIds.forEach((id) => next.delete(id));
        return next;
      });
      return false;
    }
  }

  async loadForExpense(expenseId: string): Promise<boolean> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId) return false;

    this.loadError.set(null);
    if (this.mockStore.isDemoMode()) {
      if (this.isCurrentWorkspace(workspaceId)) this.documentsRaw.set([]);
      return this.isCurrentWorkspace(workspaceId);
    }

    const requestId = ++this.documentRequestSequence;
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('expense_documents')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('expense_id', expenseId)
        .order('created_at', { ascending: true });
      if (!this.isLatestDocumentRequest(workspaceId, requestId)) return false;
      if (error) {
        this.loadError.set(this.syncStatus.melde('Laden der Ausgabenbelege', error).message);
        return false;
      }
      const documents = (data ?? []) as ExpenseDocument[];
      this.documentsRaw.set(documents);
      this.documentCounts.update((current) => {
        const next = new Map(current);
        next.set(expenseId, documents.length);
        return next;
      });
      return true;
    } catch (cause: unknown) {
      if (!this.isLatestDocumentRequest(workspaceId, requestId)) return false;
      this.loadError.set(this.syncStatus.melde('Laden der Ausgabenbelege', cause).message);
      return false;
    } finally {
      if (this.isLatestDocumentRequest(workspaceId, requestId)) {
        this.isLoading.set(false);
      }
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
    this.resetWorkspaceContext(workspace?.id ?? null);
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
      if (this.isCurrentWorkspace(workspace.id)) {
        this.documentsRaw.update((current) => [...current, document]);
        this.documentCounts.update((current) => {
          const next = new Map(current);
          next.set(expenseId, (next.get(expenseId) ?? 0) + 1);
          return next;
        });
      }
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
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId || document.workspace_id !== workspaceId) {
      return { data: null, error: new Error('Der Beleg gehört nicht zum aktiven Workspace.') };
    }
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
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    this.resetWorkspaceContext(workspaceId ?? null);
    if (!workspaceId || document.workspace_id !== workspaceId) {
      return { error: new Error('Der Beleg gehört nicht zum aktiven Workspace.') };
    }
    try {
      const { data, error } = await this.supabase.client
        .from('expense_documents')
        .delete()
        .eq('workspace_id', workspaceId)
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
      if (this.isCurrentWorkspace(workspaceId)) {
        this.documentsRaw.update((current) => current.filter((entry) => entry.id !== document.id));
        this.documentCounts.update((current) => {
          const next = new Map(current);
          const count = Math.max(0, (next.get(document.expense_id) ?? 1) - 1);
          next.set(document.expense_id, count);
          return next;
        });
      }
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

  private resetWorkspaceContext(workspaceId: string | null): boolean {
    if (this.workspaceContextId === workspaceId) return false;
    this.workspaceContextId = workspaceId;
    this.documentRequestSequence += 1;
    this.summaryRequestSequence += 1;
    this.documentsRaw.set([]);
    this.documentCounts.set(new Map());
    this.loadError.set(null);
    this.isLoading.set(false);
    return true;
  }

  private isCurrentWorkspace(workspaceId: string): boolean {
    return (
      this.workspaceContextId === workspaceId &&
      this.workspaceService.currentWorkspace()?.id === workspaceId
    );
  }

  private isLatestDocumentRequest(workspaceId: string, requestId: number): boolean {
    return this.isCurrentWorkspace(workspaceId) && this.documentRequestSequence === requestId;
  }

  private isLatestSummaryRequest(workspaceId: string, requestId: number): boolean {
    return this.isCurrentWorkspace(workspaceId) && this.summaryRequestSequence === requestId;
  }
}
