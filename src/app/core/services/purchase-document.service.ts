import { inject, Injectable, signal } from '@angular/core';
import {
  PURCHASE_DOCUMENT_BUCKET,
  PurchaseDocument,
  PurchaseDocumentType,
  purchaseDocumentExtension,
  purchaseDocumentPath,
  validatePurchaseDocumentFile,
} from '../models/purchase-document.models';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const DEMO_MESSAGE =
  'Im Demo-Modus werden keine Belege gespeichert. Melde dich an, um Originaldateien abzulegen.';

/**
 * Originalbelege eines Einkaufs. Dateien liegen ausschließlich im privaten Bucket;
 * der Dienst erzeugt keine öffentlichen Adressen und verändert keine Originaldatei.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseDocumentService {
  private readonly supabase = inject(SupabaseService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);

  private readonly documentsRaw = signal<readonly PurchaseDocument[]>([]);
  readonly documents = this.documentsRaw.asReadonly();
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);

  async loadForPurchase(purchaseId: string): Promise<void> {
    this.loadError.set(null);
    if (this.mockStore.isDemoMode()) {
      this.documentsRaw.set([]);
      return;
    }
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('purchase_documents')
        .select('*')
        .eq('purchase_id', purchaseId)
        .order('created_at', { ascending: true });
      if (error) {
        this.loadError.set(this.syncStatus.melde('Laden der Belege', error).message);
        return;
      }
      this.documentsRaw.set((data ?? []) as PurchaseDocument[]);
    } catch (cause: unknown) {
      this.loadError.set(this.syncStatus.melde('Laden der Belege', cause).message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async upload(
    purchaseId: string,
    file: File,
    documentType: PurchaseDocumentType,
  ): Promise<{ data: PurchaseDocument | null; error: Error | null }> {
    const invalid = validatePurchaseDocumentFile(file);
    if (invalid) return { data: null, error: invalid };
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_MESSAGE) };

    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace') };
    const extension = purchaseDocumentExtension(file);
    if (!extension) return { data: null, error: new Error('Die Dateiendung passt nicht zum Typ.') };

    const id = crypto.randomUUID();
    const path = purchaseDocumentPath(workspace.id, purchaseId, id, extension);
    let uploadedPath: string | null = null;
    try {
      const { error: uploadError } = await this.supabase.client.storage
        .from(PURCHASE_DOCUMENT_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPath = path;

      const { data, error } = await this.supabase.client
        .from('purchase_documents')
        .insert({
          id,
          workspace_id: workspace.id,
          purchase_id: purchaseId,
          document_type: documentType,
          original_file_name: file.name,
          storage_path: path,
          mime_type: file.type,
          file_size: file.size,
          created_by: this.supabase.session()?.user.id ?? null,
        })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('Der Belegeintrag wurde nicht zurückgegeben.');

      uploadedPath = null;
      const document = data as PurchaseDocument;
      this.documentsRaw.update((current) => [...current, document]);
      return { data: document, error: null };
    } catch (cause: unknown) {
      const failure = this.syncStatus.melde('Speichern des Belegs', cause);
      // Ohne Metadaten ist die Datei unerreichbar; sie wird deshalb zurückgenommen.
      if (uploadedPath) {
        const cleanup = await this.supabase.client.storage
          .from(PURCHASE_DOCUMENT_BUCKET)
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

  async download(document: PurchaseDocument): Promise<{ data: Blob | null; error: Error | null }> {
    if (this.mockStore.isDemoMode()) return { data: null, error: new Error(DEMO_MESSAGE) };
    try {
      const { data, error } = await this.supabase.client.storage
        .from(PURCHASE_DOCUMENT_BUCKET)
        .download(document.storage_path);
      if (error || !data) throw error ?? new Error('Die Datei wurde nicht zurückgegeben.');
      return { data, error: null };
    } catch (cause: unknown) {
      return { data: null, error: this.syncStatus.melde('Öffnen des Belegs', cause) };
    }
  }

  /**
   * Zuerst der Eintrag: Die Regeln der Datenbank entscheiden, ob der Einkauf noch
   * offen ist. Erst danach verschwindet die Datei.
   */
  async remove(document: PurchaseDocument): Promise<{ error: Error | null }> {
    if (this.mockStore.isDemoMode()) return { error: new Error(DEMO_MESSAGE) };
    try {
      const { data, error } = await this.supabase.client
        .from('purchase_documents')
        .delete()
        .eq('id', document.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        return {
          error: new Error(
            'Der Einkauf ist abgeschlossen. Belege können dann nur noch ergänzt werden.',
          ),
        };
      }

      const cleanup = await this.supabase.client.storage
        .from(PURCHASE_DOCUMENT_BUCKET)
        .remove([document.storage_path]);
      this.documentsRaw.update((current) => current.filter((entry) => entry.id !== document.id));
      if (cleanup.error) {
        return {
          error: this.syncStatus.melde(
            'Entfernen der Belegdatei',
            new Error(`Der Eintrag ist entfernt, die Datei nicht: ${document.storage_path}.`),
          ),
        };
      }
      return { error: null };
    } catch (cause: unknown) {
      return { error: this.syncStatus.melde('Entfernen des Belegs', cause) };
    }
  }
}
