import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ExpenseDocument } from '../models/expense-document.models';
import { ExpenseDocumentService } from './expense-document.service';
import { SyncStatusService } from './sync-status.service';

const workspace = { id: '11111111-1111-4111-8111-111111111111' };
const expenseId = '22222222-2222-4222-8222-222222222222';

const storedDocument: ExpenseDocument = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspace.id,
  expense_id: expenseId,
  document_type: 'invoice',
  original_file_name: 'Serverrechnung.pdf',
  storage_path: `expense-documents/${workspace.id}/${expenseId}/33333333-3333-4333-8333-333333333333.pdf`,
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

function createService(options: { metadataFails?: boolean; demo?: boolean } = {}) {
  const upload = vi.fn(async () => ({ error: null }));
  const removeFile = vi.fn(async () => ({ error: null }));
  const download = vi.fn(async () => ({ data: new Blob(['x']), error: null }));
  const insert = vi.fn(() => ({
    select: () => ({
      single: async () =>
        options.metadataFails
          ? { data: null, error: { message: 'insert denied' } }
          : { data: storedDocument, error: null },
    }),
  }));
  const deleteRow = vi.fn(() => ({
    eq: () => ({ select: async () => ({ data: [{ id: storedDocument.id }], error: null }) }),
  }));

  const service = Object.create(ExpenseDocumentService.prototype) as ExpenseDocumentService;
  const documents = signal<readonly ExpenseDocument[]>([]);
  Object.assign(service, {
    documents,
    workspaceService: { currentWorkspace: signal(workspace) },
    mockStore: { isDemoMode: signal(options.demo ?? false) },
    syncStatus: new SyncStatusService(),
    auth: { currentUser: signal({ id: 'user-1' }) },
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

  return { service, upload, removeFile, download, insert };
}

describe('ExpenseDocumentService', () => {
  it('lädt private Belege einer konkreten Ausgabe', async () => {
    const { service } = createService();

    await service.loadForExpense(expenseId);

    expect(service.documents()).toEqual([storedDocument]);
  });

  it('lädt zuerst die Datei hoch und speichert danach Metadaten', async () => {
    const { service, upload, insert } = createService();

    const result = await service.upload(expenseId, file(), 'invoice');

    expect(result.error).toBeNull();
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^expense-documents/${workspace.id}/${expenseId}/[0-9a-f-]{36}\\.pdf$`),
      ),
      expect.anything(),
      { contentType: 'application/pdf', upsert: false },
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: workspace.id,
        expense_id: expenseId,
        document_type: 'invoice',
      }),
    );
  });

  it('räumt die Datei weg, wenn das Speichern der Metadaten scheitert', async () => {
    const { service, removeFile } = createService({ metadataFails: true });

    const result = await service.upload(expenseId, file(), 'invoice');

    expect(result.error).not.toBeNull();
    expect(removeFile).toHaveBeenCalledWith([expect.stringContaining('expense-documents/')]);
  });

  it('speichert im Demo-Modus keinen Beleg', async () => {
    const { service, upload } = createService({ demo: true });

    const result = await service.upload(expenseId, file(), 'invoice');

    expect(upload).not.toHaveBeenCalled();
    expect(result.error?.message).toContain('Demo');
  });

  it('lädt den privaten Blob ohne öffentliche URL', async () => {
    const { service, download } = createService();

    const result = await service.download(storedDocument);

    expect(download).toHaveBeenCalledWith(storedDocument.storage_path);
    expect(result.data).toBeInstanceOf(Blob);
  });
});
