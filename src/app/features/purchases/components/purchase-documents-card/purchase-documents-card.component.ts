import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  OnInit,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Purchase } from '../../../../core/models/flipbase.models';
import {
  PURCHASE_DOCUMENT_TYPE_LABELS,
  PendingPurchaseDocument,
  PurchaseDocument,
  PurchaseDocumentType,
  validatePurchaseDocumentFile,
} from '../../../../core/models/purchase-document.models';
import { PurchaseDocumentService } from '../../../../core/services/purchase-document.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { PurchaseDocumentPreviewDialogComponent } from '../purchase-document-preview-dialog/purchase-document-preview-dialog.component';

interface PurchaseDocumentRow {
  readonly document: PurchaseDocument;
  readonly typeLabel: string;
  readonly sizeLabel: string;
}

/** Originalbelege eines Einkaufs vormerken, hinzufügen, ansehen und bei Fehlern korrigieren. */
@Component({
  selector: 'app-purchase-documents-card',
  imports: [
    CardComponent,
    ButtonComponent,
    CustomSelectComponent,
    ReactiveFormsModule,
    DatePipe,
    PurchaseDocumentPreviewDialogComponent,
  ],
  templateUrl: './purchase-documents-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class PurchaseDocumentsCardComponent implements OnInit {
  private readonly documentService = inject(PurchaseDocumentService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(ConfirmDialogService);

  readonly purchase = input<Purchase | null>(null);
  readonly pendingDocuments = model<readonly PendingPurchaseDocument[]>([]);

  readonly isLoading = this.documentService.isLoading;
  readonly loadError = this.documentService.loadError;
  readonly isUploading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly previewDocument = signal<PurchaseDocument | null>(null);

  readonly documentTypeControl = new FormControl<PurchaseDocumentType>('invoice', {
    nonNullable: true,
  });
  readonly documentTypeLabels = PURCHASE_DOCUMENT_TYPE_LABELS;
  readonly documentTypeOptions: readonly SelectOption<PurchaseDocumentType>[] = (
    Object.keys(PURCHASE_DOCUMENT_TYPE_LABELS) as PurchaseDocumentType[]
  ).map((value) => ({ value, label: PURCHASE_DOCUMENT_TYPE_LABELS[value] }));

  readonly rows = computed<readonly PurchaseDocumentRow[]>(() =>
    this.purchase()
      ? this.documentService
          .documents()
          .filter((document) => document.purchase_id === this.purchase()?.id)
          .map((document) => ({
            document,
            typeLabel: PURCHASE_DOCUMENT_TYPE_LABELS[document.document_type],
            sizeLabel: formatFileSize(document.file_size),
          }))
      : [],
  );

  ngOnInit(): void {
    const purchase = this.purchase();
    if (purchase) void this.documentService.loadForPurchase(purchase.id);
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.addFiles(files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: Pick<DragEvent, 'preventDefault' | 'dataTransfer'>): void {
    event.preventDefault();
    void this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  async addFiles(files: readonly File[]): Promise<void> {
    for (const file of files) {
      const invalid = validatePurchaseDocumentFile(file);
      if (invalid) {
        this.errorMessage.set(invalid.message);
        continue;
      }
      const purchase = this.purchase();
      if (!purchase) {
        this.pendingDocuments.update((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            file,
            documentType: this.documentTypeControl.value,
            status: 'pending',
            error: null,
          },
        ]);
        continue;
      }
      await this.uploadFile(purchase.id, file, this.documentTypeControl.value);
    }
  }

  private async uploadFile(
    purchaseId: string,
    file: File,
    documentType: PurchaseDocumentType,
  ): Promise<boolean> {
    this.errorMessage.set(null);
    this.isUploading.set(true);
    try {
      const { error } = await this.documentService.upload(purchaseId, file, documentType);
      if (error) {
        this.errorMessage.set(error.message);
        return false;
      }
      this.toast.success('Beleg wurde hinzugefügt.');
      return true;
    } finally {
      this.isUploading.set(false);
    }
  }

  removePendingDocument(id: string): void {
    this.pendingDocuments.update((current) => current.filter((document) => document.id !== id));
  }

  async retryPendingDocument(pending: PendingPurchaseDocument): Promise<void> {
    const purchase = this.purchase();
    if (!purchase) return;
    this.updatePending(pending.id, { status: 'uploading', error: null });
    const uploaded = await this.uploadFile(purchase.id, pending.file, pending.documentType);
    if (uploaded) {
      this.removePendingDocument(pending.id);
      return;
    }
    this.updatePending(pending.id, { status: 'error', error: this.errorMessage() });
  }

  async removeDocument(document: PurchaseDocument): Promise<void> {
    const confirmed = await this.dialog.frage({
      titel: 'Beleg entfernen?',
      text: `„${document.original_file_name}“ wird aus diesem Einkauf entfernt. Die Änderung bleibt in der Chronik nachvollziehbar.`,
      bestaetigenText: 'Beleg entfernen',
      gefahr: true,
    });
    if (!confirmed) return;
    this.errorMessage.set(null);
    const { error } = await this.documentService.remove(document);
    if (error) {
      this.errorMessage.set(error.message);
      return;
    }
    this.toast.success('Beleg wurde entfernt.');
  }

  private updatePending(
    id: string,
    patch: Pick<PendingPurchaseDocument, 'status' | 'error'>,
  ): void {
    this.pendingDocuments.update((current) =>
      current.map((document) => (document.id === id ? { ...document, ...patch } : document)),
    );
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes < 10 ? 1 : 0)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
