import { inject, Injectable, signal } from '@angular/core';
import {
  PURCHASE_DOCUMENT_BUCKET,
  PurchaseDocument,
  PurchaseDocumentType,
  purchaseDocumentExtension,
  purchaseDocumentPath,
  validatePurchaseDocumentFile,
} from '../models/purchase-document.models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';
import { InvoiceParty } from '../models/invoice.models';
import { Json } from '../models/supabase.types';

/**
 * Originalbelege eines Einkaufs. Dateien liegen ausschließlich im privaten Bucket;
 * der Dienst erzeugt keine öffentlichen Adressen und verändert keine Originaldatei.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseDocumentService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly auth = inject(AuthService, { optional: true });

  private readonly documentsRaw = signal<readonly PurchaseDocument[]>([]);
  readonly documents = this.documentsRaw.asReadonly();
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly loadedPurchaseId = signal<string | null>(null);

  async loadForPurchase(purchaseId: string): Promise<void> {
    this.loadedPurchaseId.set(null);
    this.loadError.set(null);
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
      this.loadedPurchaseId.set(purchaseId);
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
    sourceFinalizedAt: string | null = null,
    companySnapshot: InvoiceParty | null = null,
    expectedWorkspaceId?: string,
    expectedDocumentId?: string,
    expectedUserId?: string,
  ): Promise<{ data: PurchaseDocument | null; error: Error | null }> {
    if ((documentType === 'self_receipt') !== (sourceFinalizedAt !== null)) {
      return { data: null, error: new Error('Die Abschlussfassung des Eigenbelegs fehlt.') };
    }
    const invalid = validatePurchaseDocumentFile(file);
    if (invalid) return { data: null, error: invalid };

    const workspace = this.workspaceService.currentWorkspace();
    if (!workspace) return { data: null, error: new Error('Kein aktiver Workspace') };
    if (expectedWorkspaceId && workspace.id !== expectedWorkspaceId) {
      return {
        data: null,
        error: new Error('Der Workspace wurde während der Belegerstellung gewechselt.'),
      };
    }
    if (documentType === 'self_receipt' && !companySnapshot) {
      return { data: null, error: new Error('Die Unternehmensdaten für den Eigenbeleg fehlen.') };
    }
    const extension = purchaseDocumentExtension(file);
    if (!extension) return { data: null, error: new Error('Die Dateiendung passt nicht zum Typ.') };

    if (
      expectedDocumentId &&
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(expectedDocumentId)
    )
      return { data: null, error: new Error('Die Belegkennung ist ungültig.') };
    const id = expectedDocumentId ?? crypto.randomUUID();
    const bufferedUserId = expectedDocumentId
      ? (expectedUserId ?? this.auth?.currentUser()?.id)
      : undefined;
    const verifyIdentity = () => {
      if (
        expectedDocumentId &&
        (!bufferedUserId ||
          this.auth?.currentUser()?.id !== bufferedUserId ||
          this.workspaceService.currentWorkspace()?.id !== workspace.id)
      )
        throw new Error(
          'Die Anmeldung oder der Workspace hat sich während des Beleguploads geändert.',
        );
    };
    const path = purchaseDocumentPath(workspace.id, purchaseId, id, extension);
    let uploadedPath: string | null = null;
    try {
      verifyIdentity();
      if (expectedDocumentId) {
        const existing = await this.findBufferedDocument(
          workspace.id,
          purchaseId,
          id,
          file,
          documentType,
          path,
        );
        verifyIdentity();
        if (existing) return { data: existing, error: null };
      }
      const { error: uploadError } = await this.supabase.client.storage
        .from(PURCHASE_DOCUMENT_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        if (!expectedDocumentId) throw uploadError;
        await this.verifyBufferedFile(path, file);
      }
      uploadedPath = path;
      verifyIdentity();
      if (this.workspaceService.currentWorkspace()?.id !== workspace.id) {
        throw new Error('Der Workspace wurde während des Beleguploads gewechselt.');
      }

      const { data, error } = await this.supabase.client
        .from('purchase_documents')
        .insert({
          id,
          workspace_id: workspace.id,
          purchase_id: purchaseId,
          document_type: documentType,
          source_finalized_at: sourceFinalizedAt,
          company_snapshot: companySnapshot as unknown as Json,
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
      const document = data as PurchaseDocument;
      verifyIdentity();
      if (this.workspaceService.currentWorkspace()?.id !== workspace.id) {
        return {
          data: null,
          error: new Error('Der Workspace wurde während des Beleguploads gewechselt.'),
        };
      }
      this.documentsRaw.update((current) => [...current, document]);
      return { data: document, error: null };
    } catch (cause: unknown) {
      if (expectedDocumentId) {
        try {
          verifyIdentity();
          const existing = await this.findBufferedDocument(
            workspace.id,
            purchaseId,
            id,
            file,
            documentType,
            path,
          );
          verifyIdentity();
          if (existing) return { data: existing, error: null };
        } catch {
          // Bei unbekanntem Ausgang dürfen bereits referenzierte Originalbelege nicht gelöscht werden.
        }
        return { data: null, error: this.syncStatus.melde('Speichern des Belegs', cause) };
      }
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
  private async findBufferedDocument(
    workspaceId: string,
    purchaseId: string,
    id: string,
    file: File,
    documentType: PurchaseDocumentType,
    path: string,
  ): Promise<PurchaseDocument | null> {
    const { data, error } = await this.supabase.client
      .from('purchase_documents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('purchase_id', purchaseId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const document = data as PurchaseDocument;
    if (
      document.workspace_id !== workspaceId ||
      document.purchase_id !== purchaseId ||
      document.id !== id ||
      document.document_type !== documentType ||
      document.storage_path !== path ||
      document.original_file_name !== file.name ||
      document.mime_type !== file.type ||
      document.file_size !== file.size
    )
      throw new Error('Der bereits gespeicherte Beleg stimmt nicht mit deinen Eingaben überein.');
    await this.verifyBufferedFile(path, file);
    if (this.workspaceService.currentWorkspace()?.id !== workspaceId)
      throw new Error('Der Workspace hat sich geändert.');
    this.documentsRaw.update((documents) => [
      ...documents.filter((entry) => entry.id !== document.id),
      document,
    ]);
    return document;
  }
  private async verifyBufferedFile(path: string, file: File): Promise<void> {
    const { data, error } = await this.supabase.client.storage
      .from(PURCHASE_DOCUMENT_BUCKET)
      .download(path);
    if (error || !data) throw error ?? new Error('Der Beleg konnte nicht geprüft werden.');
    const [storedHash, inputHash] = await Promise.all([
      data.arrayBuffer().then((bytes) => crypto.subtle.digest('SHA-256', bytes)),
      file.arrayBuffer().then((bytes) => crypto.subtle.digest('SHA-256', bytes)),
    ]);
    if (new Uint8Array(storedHash).some((byte, index) => byte !== new Uint8Array(inputHash)[index]))
      throw new Error('Der gespeicherte Beleg enthält andere Dateiinhalte.');
  }

  async download(document: PurchaseDocument): Promise<{ data: Blob | null; error: Error | null }> {
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

  /** Zuerst die private Datei, damit ein Storage-Fehler wiederholbar bleibt. */
  async remove(document: PurchaseDocument): Promise<{ error: Error | null }> {
    if (document.document_type === 'self_receipt') {
      return { error: new Error('Ein erzeugter Eigenbeleg kann nicht entfernt werden.') };
    }
    try {
      const knownDocument = this.documentsRaw().find((entry) => entry.id === document.id);
      if (!knownDocument || knownDocument.storage_path !== document.storage_path) {
        return {
          error: new Error('Der Beleg wurde nicht gefunden oder darf nicht entfernt werden.'),
        };
      }
      const cleanup = await this.supabase.client.storage
        .from(PURCHASE_DOCUMENT_BUCKET)
        .remove([document.storage_path]);
      if (cleanup.error) {
        return {
          error: this.syncStatus.melde('Entfernen der Belegdatei', cleanup.error),
        };
      }

      const { data, error } = await this.supabase.client
        .from('purchase_documents')
        .delete()
        .eq('id', document.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        return {
          error: new Error('Der Beleg wurde nicht gefunden oder darf nicht entfernt werden.'),
        };
      }

      this.documentsRaw.update((current) => current.filter((entry) => entry.id !== document.id));
      return { error: null };
    } catch (cause: unknown) {
      return { error: this.syncStatus.melde('Entfernen des Belegs', cause) };
    }
  }
}
