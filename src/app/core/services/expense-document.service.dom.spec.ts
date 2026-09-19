import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ExpenseDocument, EXPENSE_DOCUMENT_BUCKET } from '../models/expense-document.models';
import { ExpenseDocumentService } from './expense-document.service';
import { SyncStatusService } from './sync-status.service';

const workspace = { id: '11111111-1111-4111-8111-111111111111' };
const expenseId = '44444444-4444-4444-8444-444444444444';

const storedDocument: ExpenseDocument = {
  id: '55555555-5555-4555-8555-555555555555',
  workspace_id: workspace.id,
  expense_id: expenseId,
  document_type: 'invoice',
  original_file_name: 'Serverrechnung.pdf',
  storage_path: `expense-documents/${workspace.id}/${expenseId}/55555555-5555-4555-8555-555555555555.pdf`,
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
    upload?: ReturnType<typeof vi.fn>;
    removeFile?: ReturnType<typeof vi.fn>;
    download?: ReturnType<typeof vi.fn>;
    insert?: ReturnType<typeof vi.fn>;
    deleteRow?: ReturnType<typeof vi.fn>;
    summaryRows?: readonly { expense_id: string }[];
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

  const summaryIn = vi.fn(async () => ({
    data: options.summaryRows ?? [{ expense_id: expenseId }],
    error: null,
  }));
  const documentsRaw = signal<readonly ExpenseDocument[]>([]);
  const documentCountsRaw = signal<ReadonlyMap<string, number>>(new Map());
  const service = Object.create(ExpenseDocumentService.prototype) as ExpenseDocumentService;
  Object.assign(service, {
    documentsRaw,
    documents: documentsRaw.asReadonly(),
    documentCountsRaw,
    documentCountsByExpense: documentCountsRaw.asReadonly(),
    isLoading: signal(false),
    loadError: signal<string | null>(null),
    workspaceService: { currentWorkspace: signal(workspace) },
    mockStore: { isDemoMode: signal(options.demo ?? false) },
    syncStatus: new SyncStatusService(),
    auth: { currentUser: () => ({ id: 'user-1' }) },
    supabase: {
      client: {
        storage: { from: () => ({ upload, remove: removeFile, download }) },
        from: () => ({
          insert,
          delete: deleteRow,
          select: (columns?: string) =>
            columns === 'expense_id'
              ? {
                  eq: () => ({
                    in: summaryIn,
                  }),
                }
              : {
                  eq: () => ({ order: async () => ({ data: [storedDocument], error: null }) }),
                },
        }),
      },
    },
  });

  return { service, upload, removeFile, download, insert, deleteRow, summaryIn };
}

describe('ExpenseDocumentService', () => {
  it('lädt einen schlanken Belegstatus für mehrere Ausgaben', async () => {
    const secondExpenseId = '66666666-6666-4666-8666-666666666666';
    const { service, summaryIn } = createService({
      summaryRows: [
        { expense_id: expenseId },
        { expense_id: expenseId },
        { expense_id: secondExpenseId },
      ],
    });

    await service.loadSummaryForExpenses([expenseId, secondExpenseId]);

    expect(summaryIn).toHaveBeenCalledWith('expense_id', [expenseId, secondExpenseId]);
    expect(service.hasDocuments(expenseId)).toBe(true);
    expect(service.documentCountsByExpense().get(expenseId)).toBe(2);
    expect(service.documentCountsByExpense().get(secondExpenseId)).toBe(1);
  });

  it('überspringt die Zusammenfassungsabfrage ohne Ausgaben', async () => {
    const { service, summaryIn } = createService();

    await service.loadSummaryForExpenses([]);

    expect(summaryIn).not.toHaveBeenCalled();
    expect(service.documentCountsByExpense().size).toBe(0);
  });

  it('lädt Belege einer konkreten Ausgabe', async () => {
    const { service } = createService();

    await service.loadForExpense(expenseId);

    expect(service.documents()).toEqual([storedDocument]);
  });

  it('lädt erst die private Datei hoch und speichert danach Metadaten', async () => {
    const { service, upload, insert } = createService();

    const result = await service.upload(expenseId, file(), 'invoice');

    expect(result.error).toBeNull();
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^${EXPENSE_DOCUMENT_BUCKET}/${workspace.id}/${expenseId}/[0-9a-f-]{36}\\.pdf$`),
      ),
      expect.anything(),
      { contentType: 'application/pdf', upsert: false },
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: workspace.id,
        expense_id: expenseId,
        original_file_name: 'Serverrechnung.pdf',
      }),
    );
    expect(service.hasDocuments(expenseId)).toBe(true);
  });

  it('räumt die Datei auf, wenn die Metadaten nicht gespeichert werden', async () => {
    const insert = vi.fn(() => ({
      select: () => ({
        single: async () => ({ data: null, error: { message: 'insert denied' } }),
      }),
    }));
    const { service, removeFile } = createService({ insert });

    const result = await service.upload(expenseId, file(), 'invoice');

    expect(result.error).not.toBeNull();
    expect(removeFile).toHaveBeenCalledWith([expect.stringContaining('expense-documents/')]);
  });

  it('lädt Belege nur über den privaten Bucket', async () => {
    const { service, download } = createService();

    const result = await service.download(storedDocument);

    expect(download).toHaveBeenCalledWith(storedDocument.storage_path);
    expect(result.data).toBeInstanceOf(Blob);
  });

  it('entfernt Metadaten und anschließend die Datei', async () => {
    const { service, removeFile } = createService();
    await service.loadForExpense(expenseId);

    const result = await service.remove(storedDocument);

    expect(result.error).toBeNull();
    expect(removeFile).toHaveBeenCalledWith([storedDocument.storage_path]);
    expect(service.documents()).toEqual([]);
    expect(service.hasDocuments(expenseId)).toBe(false);
  });

  it('speichert im Demo-Modus keine privaten Dateien', async () => {
    const { service, upload } = createService({ demo: true });

    const result = await service.upload(expenseId, file(), 'invoice');

    expect(result.error?.message).toContain('Demo');
    expect(upload).not.toHaveBeenCalled();
  });
});
