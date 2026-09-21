import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Purchase } from '../../../../core/models/flipbase.models';
import { PurchaseDocument } from '../../../../core/models/purchase-document.models';
import { PurchaseDocumentService } from '../../../../core/services/purchase-document.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  formatFileSize,
  PurchaseDocumentsCardComponent,
} from './purchase-documents-card.component';

const openPurchase = {
  id: 'purchase-1',
  workspace_id: 'workspace-1',
  type: 'single',
  title: 'Vinted-Jacke',
  purchase_date: '2026-09-18',
  purchase_price: 10,
  cost_allocation_mode: 'even',
  entry_status: 'draft',
} as Purchase;

const document: PurchaseDocument = {
  id: 'document-1',
  workspace_id: 'workspace-1',
  purchase_id: 'purchase-1',
  document_type: 'payment_proof',
  original_file_name: 'Zahlung.png',
  storage_path: 'purchase-documents/workspace-1/purchase-1/document-1.png',
  mime_type: 'image/png',
  file_size: 2048,
  created_at: '2026-09-18T09:00:00.000Z',
  created_by: 'user-1',
};

const documents = signal<readonly PurchaseDocument[]>([document]);
const loadForPurchase = vi.fn(async () => undefined);
const upload = vi.fn(async (): Promise<{ data: PurchaseDocument | null; error: Error | null }> => ({
  data: document,
  error: null,
}));
const remove = vi.fn(async () => ({ error: null as Error | null }));
const toastSuccess = vi.fn();
const confirmRemoval = vi.fn(async () => true);

function createCard(purchase: Purchase | null = openPurchase) {
  const component = TestBed.runInInjectionContext(() => new PurchaseDocumentsCardComponent());
  Object.defineProperty(component, 'purchase', { value: () => purchase });
  return component;
}

beforeEach(() => {
  documents.set([document]);
  loadForPurchase.mockClear();
  upload.mockClear().mockResolvedValue({ data: document, error: null });
  remove.mockClear().mockResolvedValue({ error: null });
  toastSuccess.mockClear();
  confirmRemoval.mockClear().mockResolvedValue(true);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: PurchaseDocumentService,
        useValue: {
          documents,
          isLoading: signal(false),
          loadError: signal<string | null>(null),
          loadForPurchase,
          upload,
          remove,
        },
      },
      { provide: ToastService, useValue: { success: toastSuccess } },
      { provide: ConfirmDialogService, useValue: { frage: confirmRemoval } },
    ],
  });
});

function fileEvent(file: File | null): Event {
  const input = {
    files: file ? [file] : [],
    value: 'C:/fake/Zahlung.png',
  } as unknown as HTMLInputElement;
  return { target: input } as unknown as Event;
}

describe('formatFileSize', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('zeigt %i Byte als %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});

describe('PurchaseDocumentsCardComponent', () => {
  it('merkt eine abgelegte Datei ohne Einkaufs-ID lokal vor', () => {
    const card = createCard(null);
    const file = new File(['pdf'], 'rechnung.pdf', { type: 'application/pdf' });
    const preventDefault = vi.fn();

    (
      card as unknown as {
        onDrop: (event: { preventDefault: () => void; dataTransfer: { files: File[] } }) => void;
      }
    ).onDrop({ preventDefault, dataTransfer: { files: [file] } });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(
      (
        card as unknown as {
          pendingDocuments: () => readonly unknown[];
        }
      ).pendingDocuments(),
    ).toEqual([
      expect.objectContaining({
        file,
        documentType: 'invoice',
        status: 'pending',
        error: null,
      }),
    ]);
    expect(upload).not.toHaveBeenCalled();
  });

  it('zeigt Belegart, Größe und Datum je Beleg', () => {
    const card = createCard();

    expect(card.rows()).toEqual([{ document, typeLabel: 'Zahlungsnachweis', sizeLabel: '2.0 KB' }]);
  });

  it('lädt die Belege des gezeigten Einkaufs', () => {
    createCard().ngOnInit();

    expect(loadForPurchase).toHaveBeenCalledWith('purchase-1');
  });

  it('lädt eine ausgewählte Datei mit der gewählten Belegart hoch', async () => {
    const card = createCard();
    card.documentTypeControl.setValue('invoice');

    await card.onFileSelected(
      fileEvent(new File(['pdf'], 'Rechnung.pdf', { type: 'application/pdf' })),
    );

    expect(upload).toHaveBeenCalledWith('purchase-1', expect.anything(), 'invoice');
    expect(toastSuccess).toHaveBeenCalledOnce();
    expect(card.errorMessage()).toBeNull();
    expect(card.isUploading()).toBe(false);
  });

  it('zeigt eine abgelehnte Datei als Meldung und meldet keinen Erfolg', async () => {
    upload.mockResolvedValue({ data: null, error: new Error('Zu groß: 25 MiB.') });
    const card = createCard();

    await card.onFileSelected(
      fileEvent(new File(['pdf'], 'gross.pdf', { type: 'application/pdf' })),
    );

    expect(card.errorMessage()).toBe('Zu groß: 25 MiB.');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('bietet Entfernen auch bei einem abgeschlossenen Einkauf nach Bestätigung an', async () => {
    const card = createCard({ ...openPurchase, entry_status: 'finalized' });

    await card.removeDocument(document);

    expect(confirmRemoval).toHaveBeenCalledWith(
      expect.objectContaining({ titel: 'Beleg entfernen?', gefahr: true }),
    );
    expect(remove).toHaveBeenCalledWith(document);
  });

  it('erklärt einen fehlgeschlagenen Entfernen-Versuch', async () => {
    remove.mockResolvedValue({ error: new Error('Der Einkauf ist abgeschlossen.') });
    const card = createCard();

    await card.removeDocument(document);

    expect(card.errorMessage()).toBe('Der Einkauf ist abgeschlossen.');
  });
});
