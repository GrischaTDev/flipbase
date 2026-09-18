import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import {
  OperatingExpenseDocument,
  OPERATING_EXPENSE_DOCUMENT_MAX_BYTES,
} from '../models/operating-expense.models';
import { OperatingExpenseDocumentService } from './operating-expense-document.service';
import { SyncStatusService } from './sync-status.service';

const workspace = { id: '11111111-1111-4111-8111-111111111111' };
const expenseId = '33333333-3333-4333-8333-333333333333';

const storedDocument: OperatingExpenseDocument = {
  id: '55555555-5555-4555-8555-555555555555',
  workspace_id: workspace.id,
  expense_id: expenseId,
  document_type: 'invoice',
  original_file_name: 'Serverrechnung.pdf',
  storage_path:
    `operating-expense-documents/${workspace.id}/${expenseId}/55555555-5555-4555-8555-555555555555.pdf`,
  mime_type: 'application/pdf',
  file_size: 1024,
  created_at: '2026-09-18T10:00:00.000Z',
  created_by: 'user-1',
};

function file(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  return {
    name: 'Serverrechnung.pdf',
    type: 'application/pdf',
    size: 1024,
    ...overrides,
  } as File;
}

function createService(
  options: {
    demo?: boolean;
    insertError?: boolean;
  } = {},
) {
  const upload = vi.fn(async () => ({ error: null }));
  const removeFile = vi.fn(async () => ({ error: null }));
  const download = vi.fn(async () => ({ data: new Blob(['x']), error: null }));
  const insert = vi.fn(() => ({
    select: () => ({
      single: async () => ({
        data: options.insertError ? null : storedDocument,
        error: options.insertError ? { message: 'insert denied' } : null,
      }),
    }),
  }));
  const deleteRows = vi.fn(() => ({
    eq: () => ({ select: async () => ({ data: [storedDocument], error: null }) }),
  }));
  const selectRows = vi.fn(() => ({
    eq: () => ({ order: async () => ({ data: [storedDocument], error: null }) }),
  }));

  const documentsRaw = signal<readonly OperatingExpenseDocument[]>([]);
  const service = Object.create(
    OperatingExpenseDocumentService.prototype,
  ) as OperatingExpenseDocumentService;
  Object.assign(service, {
    documentsRaw,
    documents: documentsRaw.asReadonly(),
    isLoading: signal(false),
    loadError: signal<string | null>(null),
    workspaceService: { currentWorkspace: () => workspace },
    mockStore: { isDemoMode: () => options.demo ?? false },
    syncStatus: new SyncStatusService(),
    auth: { currentUser: () => ({ id: 'user-1' }) },
    supabase: {
      client: {
        storage: { from: () => ({ upload, remove: removeFile, download }) },
        from: () => ({
          insert,
          delete: deleteRows,
          select: selectRows,
        }),
      },
    },
  });

  return { service, upload, removeFile, download };
}

describe('OperatingExpenseDocumentService', () => {
  it('speichert Originalbelege ausschließlich im privaten Ausgaben-Bucket', async () => {
    const { service, upload } = createService();

    const result = await service.upload(expenseId, file(), 'invoice');

    expect(result.error).toBeNull();
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `^operating-expense-documents/${workspace.id}/${expenseId}/[0-9a-f-]{36}\\.pdf$`,
        ),
      ),
      expect.anything(),
      { contentType: 'application/pdf', upsert: false },
    );
    expect(service.documents()).toEqual([storedDocument]);
  });

  it('nimmt eine hochgeladene Datei zurück, wenn der Metadateneintrag scheitert', async () => {
    const { service, removeFile } = createService({ insertError: true });

    const result = await service.upload(expenseId, file(), 'invoice');

    expect(result.error).not.toBeNull();
    expect(removeFile).toHaveBeenCalledWith([
      expect.stringContaining('operating-expense-documents/'),
    ]);
  });

  it('lehnt unerlaubte oder zu große Dateien vor dem Upload ab', async () => {
    const { service, upload } = createService();

    const wrongType = await service.upload(
      expenseId,
      file({ name: 'beleg.gif', type: 'image/gif' }),
      'invoice',
    );
    const tooLarge = await service.upload(
      expenseId,
      file({ size: OPERATING_EXPENSE_DOCUMENT_MAX_BYTES + 1 }),
      'invoice',
    );

    expect(wrongType.error).not.toBeNull();
    expect(tooLarge.error).not.toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it('lädt Belege über den privaten Storage-Client', async () => {
    const { service, download } = createService();

    const result = await service.download(storedDocument);

    expect(download).toHaveBeenCalledWith(storedDocument.storage_path);
    expect(result.data).toBeInstanceOf(Blob);
  });

  it('entfernt einen einzelnen Beleg samt privater Datei', async () => {
    const { service, removeFile } = createService();

    const result = await service.remove(storedDocument);

    expect(result.error).toBeNull();
    expect(removeFile).toHaveBeenCalledWith([storedDocument.storage_path]);
  });

  it('entfernt beim Löschen einer Ausgabe alle zugehörigen Dateien und Metadaten', async () => {
    const { service, removeFile } = createService();

    const result = await service.removeAllForExpense(expenseId);

    expect(result.error).toBeNull();
    expect(removeFile).toHaveBeenCalledWith([storedDocument.storage_path]);
  });

  it('schreibt im Demo-Modus keine privaten Dateien', async () => {
    const { service, upload } = createService({ demo: true });

    const result = await service.upload(expenseId, file(), 'invoice');

    expect(result.error?.message).toContain('Demo');
    expect(upload).not.toHaveBeenCalled();
  });
});
