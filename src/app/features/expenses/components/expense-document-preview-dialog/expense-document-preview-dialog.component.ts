import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ExpenseDocument } from '../../../../core/models/expense-document.models';
import { ExpenseDocumentService } from '../../../../core/services/expense-document.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

@Component({
  selector: 'app-expense-document-preview-dialog',
  imports: [ModalShellComponent, ButtonComponent],
  templateUrl: './expense-document-preview-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseDocumentPreviewDialogComponent implements OnInit, OnDestroy {
  private readonly documentService = inject(ExpenseDocumentService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly document = input.required<ExpenseDocument>();
  readonly closed = output<void>();

  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly objectUrl = signal<string | null>(null);

  readonly kind = computed<'image' | 'pdf' | 'other'>(() => {
    const mime = this.document().mime_type;
    if (mime.startsWith('image/')) return 'image';
    return mime === 'application/pdf' ? 'pdf' : 'other';
  });

  readonly pdfUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.objectUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  async ngOnInit(): Promise<void> {
    const result = await this.documentService.download(this.document());
    this.isLoading.set(false);
    if (result.error || !result.data) {
      this.errorMessage.set(result.error?.message ?? 'Der Beleg konnte nicht geladen werden.');
      return;
    }
    this.objectUrl.set(URL.createObjectURL(result.data));
  }

  ngOnDestroy(): void {
    const url = this.objectUrl();
    if (url) URL.revokeObjectURL(url);
  }

  print(): void {
    const url = this.objectUrl();
    if (!url) return;
    const printWindow = window.open(url, '_blank');
    if (!printWindow) return;
    printWindow.opener = null;
    printWindow.addEventListener('load', () => printWindow.print(), { once: true });
  }

  download(): void {
    const url = this.objectUrl();
    if (!url) return;
    const link = window.document.createElement('a');
    link.href = url;
    link.download = this.document().original_file_name;
    link.click();
  }
}
