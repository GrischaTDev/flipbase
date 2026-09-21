import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Purchase } from '../../../../core/models/flipbase.models';
import {
  PendingPurchaseDocument,
  PurchaseDocument,
} from '../../../../core/models/purchase-document.models';
import { PurchaseDocumentService } from '../../../../core/services/purchase-document.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
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

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

const inputMetadataSnapshots = new Map<unknown, AngularInputMetadata>();

function bridgeSignalInputs(component: unknown, names: readonly string[]): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  if (!inputMetadataSnapshots.has(component)) {
    inputMetadataSnapshots.set(component, {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
    });
  }
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(names.map((name) => [name, name])),
  };
}

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) {
      throw new Error(`Test-Ressource ${url} ist nicht eindeutig: ${matches.join(', ')}`);
    }
    return readFile(matches[0], 'utf8');
  });
  bridgeSignalInputs(PurchaseDocumentsCardComponent, ['purchase', 'pendingDocuments']);
  bridgeSignalInputs(CardComponent, ['title', 'subtitle', 'rounded']);
  bridgeSignalInputs(CustomSelectComponent, ['options', 'ariaLabel', 'size', 'widthClass']);
  bridgeSignalInputs(ButtonComponent, ['variant', 'size', 'loading']);
});

afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
  }
});

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
    imports: [PurchaseDocumentsCardComponent],
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
  it('ordnet Belegart, Ablagefläche und Dateiliste vertikal ohne Zusatzknopf an', async () => {
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(PurchaseDocumentsCardComponent);
    fixture.componentRef.setInput('purchase', openPurchase);
    fixture.detectChanges();

    const card = fixture.nativeElement as HTMLElement;
    const documentType = card.querySelector<HTMLElement>('[data-document-type]');
    const dropZone = card.querySelector<HTMLButtonElement>('[data-document-drop-zone]');
    const documentRow = card.querySelector<HTMLElement>('[data-document-row]');
    const previewButton = card.querySelector<HTMLButtonElement>('[aria-label="Beleg ansehen"]');
    const removeButton = card.querySelector<HTMLButtonElement>('[aria-label="Beleg entfernen"]');

    expect(card.querySelector('[data-add-document]')).toBeNull();
    expect(documentType).not.toBeNull();
    expect(dropZone).not.toBeNull();
    expect(documentRow).not.toBeNull();
    expect(documentType?.compareDocumentPosition(dropZone as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(dropZone?.textContent).toContain(
      'Hier klicken, um eine Datei auszuwählen, oder Datei hier ablegen',
    );
    expect(dropZone?.compareDocumentPosition(documentRow as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(previewButton).not.toBeNull();
    expect(removeButton).not.toBeNull();
    expect(previewButton?.classList).toContain('hover:text-fb-success');
    expect(removeButton?.classList).toContain('hover:text-fb-critical');
  });

  it('öffnet den Dateidialog über die vollständige Ablagefläche', async () => {
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(PurchaseDocumentsCardComponent);
    fixture.componentRef.setInput('purchase', openPurchase);
    fixture.detectChanges();

    const fileInput =
      fixture.nativeElement.querySelector<HTMLInputElement>('[data-document-input]');
    const dropZone = fixture.nativeElement.querySelector<HTMLButtonElement>(
      '[data-document-drop-zone]',
    );
    if (!fileInput || !dropZone) throw new Error('Dateifeld oder Ablagefläche fehlt.');
    const inputClick = vi.spyOn(fileInput, 'click');

    dropZone.click();

    expect(inputClick).toHaveBeenCalledOnce();
  });

  it('öffnet einen gespeicherten Beleg über die Icon-Aktion', async () => {
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(PurchaseDocumentsCardComponent);
    fixture.componentRef.setInput('purchase', openPurchase);
    fixture.detectChanges();

    const previewButton = fixture.nativeElement.querySelector<HTMLButtonElement>(
      '[aria-label="Beleg ansehen"]',
    );
    if (!previewButton) throw new Error('Vorschauaktion fehlt.');

    previewButton.click();

    expect(fixture.componentInstance.previewDocument()).toEqual(document);
  });

  it('entfernt einen gespeicherten Beleg über die Icon-Aktion nach Bestätigung', async () => {
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(PurchaseDocumentsCardComponent);
    fixture.componentRef.setInput('purchase', openPurchase);
    fixture.detectChanges();

    const removeButton = fixture.nativeElement.querySelector<HTMLButtonElement>(
      '[aria-label="Beleg entfernen"]',
    );
    if (!removeButton) throw new Error('Entfernenaktion fehlt.');

    removeButton.click();
    await fixture.whenStable();

    expect(confirmRemoval).toHaveBeenCalledWith(
      expect.objectContaining({ titel: 'Beleg entfernen?', gefahr: true }),
    );
    expect(remove).toHaveBeenCalledWith(document);
  });

  it('entfernt einen vorgemerkten Beleg über dieselbe kritische Icon-Aktion', async () => {
    const pendingDocument: PendingPurchaseDocument = {
      id: 'pending-document-1',
      file: new File(['pdf'], 'Rechnung.pdf', { type: 'application/pdf' }),
      documentType: 'invoice',
      status: 'pending',
      error: null,
    };
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(PurchaseDocumentsCardComponent);
    fixture.componentRef.setInput('purchase', openPurchase);
    fixture.componentRef.setInput('pendingDocuments', [pendingDocument]);
    fixture.detectChanges();

    const removeButton = fixture.nativeElement.querySelector<HTMLButtonElement>(
      '[aria-label="Vorgemerkten Beleg entfernen"]',
    );
    if (!removeButton) throw new Error('Entfernenaktion für vorgemerkten Beleg fehlt.');
    expect(removeButton.classList).toContain('hover:text-fb-critical');

    removeButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-pending-documents]')).toBeNull();
  });

  it('bleibt mit Icon-Aktionen barrierefrei', async () => {
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(PurchaseDocumentsCardComponent);
    fixture.componentRef.setInput('purchase', openPurchase);
    fixture.detectChanges();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });

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
