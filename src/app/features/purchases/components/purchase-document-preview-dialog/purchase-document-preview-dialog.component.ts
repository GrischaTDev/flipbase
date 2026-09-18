import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PurchaseDocument } from '../../../../core/models/purchase-document.models';
import { PurchaseDocumentService } from '../../../../core/services/purchase-document.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

/** Zeigt einen Beleg aus dem privaten Bucket, ohne eine öffentliche Adresse zu erzeugen. */
@Component({
  selector: 'app-purchase-document-preview-dialog',
  imports: [ModalShellComponent, ButtonComponent],
  templateUrl: './purchase-document-preview-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseDocumentPreviewDialogComponent implements OnInit, OnDestroy {
  private readonly documentService = inject(PurchaseDocumentService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly document = input.required<PurchaseDocument>();
  readonly closed = output<void>();

  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly objectUrl = signal<string | null>(null);

  /** Die Blob-Adresse stammt aus der eigenen Datei und wird nur im eigenen Rahmen angezeigt. */
  readonly pdfUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.objectUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  readonly kind = computed<'image' | 'pdf' | 'other'>(() => {
    const mime = this.document().mime_type;
    if (mime.startsWith('image/')) return 'image';
    return mime === 'application/pdf' ? 'pdf' : 'other';
  });

  async ngOnInit(): Promise<void> {
    const { data, error } = await this.documentService.download(this.document());
    this.isLoading.set(false);
    if (error || !data) {
      this.errorMessage.set(error?.message ?? 'Der Beleg konnte nicht geladen werden.');
      return;
    }
    this.objectUrl.set(URL.createObjectURL(data));
  }

  ngOnDestroy(): void {
    this.revoke();
  }

  download(): void {
    const url = this.objectUrl();
    if (!url) return;
    const link = window.document.createElement('a');
    link.href = url;
    link.download = this.document().original_file_name;
    link.click();
  }

  private revoke(): void {
    const url = this.objectUrl();
    if (url) URL.revokeObjectURL(url);
    this.objectUrl.set(null);
  }
}
