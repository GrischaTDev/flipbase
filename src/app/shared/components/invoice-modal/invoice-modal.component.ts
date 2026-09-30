import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  LucideDynamicIcon,
  LucidePrinter as Printer,
  LucideX as X,
  LucideMail as Mail,
  LucideFileText as FileText,
  LucideBuilding as Building,
  LucideUser as User,
  LucideSend as Send,
} from '@lucide/angular';
import { Invoice } from '../../../core/models/invoice.models';
import { InvoiceService } from '../../../core/services/invoice.service';
import { ModalDialogDirective } from '../../../shared/directives/modal-dialog.directive';
import { ToastService } from '../toast/toast.service';
import { SyncStatusService } from '../../../core/services/sync-status.service';

@Component({
  selector: 'app-invoice-modal',
  imports: [ModalDialogDirective, CurrencyPipe, DatePipe, LucideDynamicIcon],
  templateUrl: './invoice-modal.component.html',
  styleUrl: './invoice-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceModalComponent {
  private readonly invoiceService = inject(InvoiceService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);

  readonly invoice = input.required<Invoice>();
  readonly closed = output<void>();

  readonly printerIcon = Printer;
  readonly closeIcon = X;
  readonly mailIcon = Mail;
  readonly fileIcon = FileText;
  readonly buildingIcon = Building;
  readonly userIcon = User;
  readonly sendIcon = Send;

  readonly isSendingEmail = signal<boolean>(false);
  readonly documentLogoUrl = signal<string | null>(null);
  readonly logoUnavailable = signal(false);
  private logoVersion = 0;

  constructor() {
    effect(() => {
      void this.loadDocumentLogo();
    });
  }

  async loadDocumentLogo(): Promise<void> {
    const version = ++this.logoVersion;
    this.documentLogoUrl.set(null);
    this.logoUnavailable.set(false);
    const path = this.invoice().seller.logoPath;
    if (!path) return;
    try {
      const url = await this.invoiceService.getDocumentLogoUrl(path);
      if (version === this.logoVersion) this.documentLogoUrl.set(url);
    } catch {
      if (version === this.logoVersion) this.logoUnavailable.set(true);
    }
  }

  onLogoError(): void {
    this.documentLogoUrl.set(null);
    this.logoUnavailable.set(true);
  }

  printInvoice(): void {
    window.print();
  }

  async sendEmail(): Promise<void> {
    this.isSendingEmail.set(true);
    try {
      const res = await this.invoiceService.prepareConfirmationEmail(this.invoice());
      if (!res.success || res.error) {
        const fehler = res.error ?? new Error('Die Bestätigung konnte nicht vorbereitet werden.');
        if (!this.syncStatus.istZentralGemeldet(fehler)) {
          this.toast.error('Bestätigung konnte nicht vorbereitet werden.', fehler.message);
        }
        return;
      }
      this.toast.info('Bestätigung wurde für den E-Mail-Versand vorbereitet.');
    } catch (ursache: unknown) {
      const fehler =
        ursache instanceof Error
          ? ursache
          : new Error('Die Bestätigung konnte nicht vorbereitet werden.');
      if (!this.syncStatus.istZentralGemeldet(fehler)) {
        this.toast.error('Bestätigung konnte nicht vorbereitet werden.', fehler.message);
      }
    } finally {
      this.isSendingEmail.set(false);
    }
  }
}
