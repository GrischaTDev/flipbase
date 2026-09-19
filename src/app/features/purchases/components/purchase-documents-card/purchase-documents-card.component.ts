import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Purchase } from '../../../../core/models/flipbase.models';
import {
  PURCHASE_DOCUMENT_TYPE_LABELS,
  PurchaseDocument,
  PurchaseDocumentType,
} from '../../../../core/models/purchase-document.models';
import { PurchaseDocumentService } from '../../../../core/services/purchase-document.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { PurchaseDocumentPreviewDialogComponent } from '../purchase-document-preview-dialog/purchase-document-preview-dialog.component';

interface PurchaseDocumentRow {
  readonly document: PurchaseDocument;
  readonly typeLabel: string;
  readonly sizeLabel: string;
}

/** Originalbelege eines Einkaufs: hinzufügen, ansehen und vor dem Abschluss entfernen. */
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

  readonly purchase = input.required<Purchase>();

  readonly isLoading = this.documentService.isLoading;
  readonly loadError = this.documentService.loadError;
  readonly isUploading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly previewDocument = signal<PurchaseDocument | null>(null);

  readonly canRemove = computed(() => this.purchase().entry_status !== 'finalized');

  readonly documentTypeControl = new FormControl<PurchaseDocumentType>('invoice', {
    nonNullable: true,
  });
  readonly documentTypeOptions: readonly SelectOption<PurchaseDocumentType>[] = (
    Object.keys(PURCHASE_DOCUMENT_TYPE_LABELS) as PurchaseDocumentType[]
  ).map((value) => ({ value, label: PURCHASE_DOCUMENT_TYPE_LABELS[value] }));

  readonly rows = computed<readonly PurchaseDocumentRow[]>(() =>
    this.documentService
      .documents()
      .filter((document) => document.purchase_id === this.purchase().id)
      .map((document) => ({
        document,
        typeLabel: PURCHASE_DOCUMENT_TYPE_LABELS[document.document_type],
        sizeLabel: formatFileSize(document.file_size),
      })),
  );

  ngOnInit(): void {
    void this.documentService.loadForPurchase(this.purchase().id);
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.errorMessage.set(null);
    this.isUploading.set(true);
    try {
      const { error } = await this.documentService.upload(
        this.purchase().id,
        file,
        this.documentTypeControl.value,
      );
      if (error) {
        this.errorMessage.set(error.message);
        return;
      }
      this.toast.success('Beleg wurde hinzugefügt.');
    } finally {
      this.isUploading.set(false);
    }
  }

  async removeDocument(document: PurchaseDocument): Promise<void> {
    this.errorMessage.set(null);
    const { error } = await this.documentService.remove(document);
    if (error) {
      this.errorMessage.set(error.message);
      return;
    }
    this.toast.success('Beleg wurde entfernt.');
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes < 10 ? 1 : 0)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
