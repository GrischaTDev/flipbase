import { Injectable, signal } from '@angular/core';

@Injectable()
export class PurchaseReceiptPreviewStateService {
  readonly openPreviewId = signal<string | null>(null);

  open(previewId: string): void {
    this.openPreviewId.set(previewId);
  }

  close(previewId: string): void {
    if (this.openPreviewId() === previewId) this.openPreviewId.set(null);
  }
}
