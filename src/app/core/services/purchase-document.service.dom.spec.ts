import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import {
  PurchaseDocument,
  PURCHASE_DOCUMENT_MAX_BYTES,
  validatePurchaseDocumentFile,
} from '../models/purchase-document.models';
import { PurchaseDocumentService } from './purchase-document.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const workspace = { id: '11111111-1111-4111-8111-111111111111' };
const purchaseId = '22222222-2222-4222-8222-222222222222';

const storedDocument: PurchaseDocument = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspace.id,
  purchase_id: purchaseId,
  document_type: 'invoice',
  original_file_name: 'Rechnung.pdf',
  storage_path: `purchase-documents/${workspace.id}/${purchaseId}/33333333-3333-4333-8333-333333333333.pdf`,
  mime_type: 'application/pdf',
  file_size: 1024,
  created_at: '2026-09-18T10:00:00.000Z',
  created_by: 'user-1',
};

function file(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  return { name: 'Rechnung.pdf', type: 'application/pdf', size: 1024, ...overrides } as File;
}

function createService(
  options: {
    upload?: ReturnType<typeof vi.fn>;
    removeFile?: ReturnType<typeof vi.fn>;
    download?: ReturnType<typeof vi.fn>;
    insert?: ReturnType<typeof vi.fn>;
    deleteRow?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const upload = options.upload ?? vi.fn(async () => ({ error: null }));
  const removeFile = options.removeFile ?? vi.fn(async () => ({ error: null }));
  const download = options.download ?? vi.fn(async () => ({ data: new Blob(['x']), error: null }));
  const insert =
    options.insert ??
    vi.fn(() => ({
      select: () => ({ single: async () => ({ data: storedDocument, error: null }) }),
    }));
  const deleteRow =
    options.deleteRow ??
    vi.fn(() => ({
      eq: () => ({ select: async () => ({ data: [{ id: storedDocument.id }], error: null }) }),
    }));
  const documentsRaw = signal<readonly PurchaseDocument[]>([]);
  const service = Object.create(PurchaseDocumentService.prototype) as PurchaseDocumentService;
  Object.assign(service, {
    documentsRaw,
    documents: documentsRaw.asReadonly(),
    isLoading: signal(false),
    loadError: signal<string | null>(null),
    workspaceService: { currentWorkspace: signal(workspace) },
    syncStatus: new SyncStatusService(),
    auth: { currentUser: () => ({ id: 'user-1' }) },
    supabase: {
      client: {
        storage: { from: () => ({ upload, remove: removeFile, download }) },
        from: () => ({
          insert,
          delete: deleteRow,
          select: () => ({
            eq: () => ({ order: async () => ({ data: [storedDocument], error: null }) }),
          }),
        }),
      },
    },
  });
  return { service, upload, removeFile, download, insert, deleteRow };
}

describe('validatePurchaseDocumentFile', () => {
  it.each([
    [{ type: 'image/gif', name: 'bild.gif' }, 'Bitte eine PDF-, JPG-, PNG- oder XML-Datei'],
    [{ name: 'rechnung.txt' }, 'Bitte eine PDF-, JPG-, PNG- oder XML-Datei'],
    [{ size: PURCHASE_DOCUMENT_MAX_BYTES + 1 }, 'größer als 20 MiB'],
    [{ size: 0 }, 'ist leer'],
  ])('lehnt %j mit einer verständlichen Meldung ab', (overrides, expected) => {
    expect(validatePurchaseDocumentFile(file(overrides))?.message).toContain(expected);
  });

  it('nimmt eine erlaubte Datei an', () => {
    expect(validatePurchaseDocumentFile(file())).toBeNull();
  });
});

describe('PurchaseDocumentService.upload', () => {
  it('legt erst die Datei und danach die Metadaten an', async () => {
    const { service, upload, insert } = createService();

    const result = await service.upload(purchaseId, file(), 'invoice');

    expect(result.error).toBeNull();
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^purchase-documents/${workspace.id}/${purchaseId}/[0-9a-f-]{36}\\.pdf$`),
      ),
      expect.anything(),
      { contentType: 'application/pdf', upsert: false },
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: workspace.id,
        purchase_id: purchaseId,
        document_type: 'invoice',
        original_file_name: 'Rechnung.pdf',
        mime_type: 'application/pdf',
        file_size: 1024,
      }),
    );
    expect(service.documents()).toEqual([storedDocument]);
  });

  it('nimmt die hochgeladene Datei zurück, wenn die Metadaten scheitern', async () => {
    const insert = vi.fn(() => ({
      select: () => ({
        single: async () => ({ data: null, error: { message: 'insert denied' } }),
      }),
    }));
    const { service, removeFile } = createService({ insert });

    const result = await service.upload(purchaseId, file(), 'other');

    expect(result.error).not.toBeNull();
    expect(removeFile).toHaveBeenCalledWith([expect.stringContaining('purchase-documents/')]);
    expect(service.documents()).toEqual([]);
  });

  it('speichert Belege ohne eine Browser-Ersatzdatenbank über den privaten Bucket', async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: storedDocument, error: null }) }),
    }));
    const service = runInInjectionContext(
      Injector.create({
        providers: [
          {
            provide: SupabaseService,
            useValue: {
              client: {
                storage: { from: () => ({ upload }) },
                from: () => ({ insert }),
              },
            },
          },
          { provide: WorkspaceService, useValue: { currentWorkspace: signal(workspace) } },
          { provide: SyncStatusService, useValue: new SyncStatusService() },
          { provide: AuthService, useValue: { currentUser: () => ({ id: 'user-1' }) } },
        ],
      }),
      () => new PurchaseDocumentService(),
    );

    const result = await service.upload(purchaseId, file(), 'invoice');

    expect(result.error).toBeNull();
    expect(upload).toHaveBeenCalledOnce();
  });

  it('lehnt eine unerlaubte Datei ab, bevor sie hochgeladen wird', async () => {
    const { service, upload } = createService();

    const result = await service.upload(purchaseId, file({ type: 'image/gif' }), 'invoice');

    expect(upload).not.toHaveBeenCalled();
    expect(result.error?.message).toContain('Bitte eine PDF-');
  });
});

describe('PurchaseDocumentService.remove', () => {
  it('entfernt erst die Datei und danach den Eintrag', async () => {
    const { service, removeFile, deleteRow } = createService();
    await service.upload(purchaseId, file(), 'invoice');

    const result = await service.remove(storedDocument);

    expect(result.error).toBeNull();
    expect(deleteRow).toHaveBeenCalled();
    expect(removeFile).toHaveBeenCalledWith([storedDocument.storage_path]);
    expect(service.documents()).toEqual([]);
  });

  it('behält Eintrag und Anzeige bei, wenn die Datei nicht entfernt werden kann', async () => {
    const removeFile = vi.fn(async () => ({ error: { message: 'storage unavailable' } }));
    const { service, deleteRow } = createService({ removeFile });
    await service.upload(purchaseId, file(), 'invoice');

    const result = await service.remove(storedDocument);

    expect(result.error).not.toBeNull();
    expect(deleteRow).not.toHaveBeenCalled();
    expect(service.documents()).toEqual([storedDocument]);
  });

  it('meldet einen nicht sichtbaren oder bereits entfernten Beleg verständlich', async () => {
    const deleteRow = vi.fn(() => ({
      eq: () => ({ select: async () => ({ data: [], error: null }) }),
    }));
    const { service, removeFile } = createService({ deleteRow });

    const result = await service.remove(storedDocument);

    expect(result.error?.message).toContain('nicht gefunden oder darf nicht entfernt werden');
    expect(removeFile).not.toHaveBeenCalled();
  });
});

describe('PurchaseDocumentService.download', () => {
  it('lädt die Datei über den privaten Bucket, ohne öffentliche Adresse', async () => {
    const { service, download } = createService();

    const result = await service.download(storedDocument);

    expect(download).toHaveBeenCalledWith(storedDocument.storage_path);
    expect(result.data).toBeInstanceOf(Blob);
  });
});
