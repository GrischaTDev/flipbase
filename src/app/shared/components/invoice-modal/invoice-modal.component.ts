import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  LucideDynamicIcon,
  LucidePrinter as Printer,
  LucideX as X,
  LucideMail as Mail,
  LucideCheckCircle2 as CheckCircle2,
  LucideFileText as FileText,
  LucideBuilding as Building,
  LucideUser as User,
  LucideSend as Send,
} from '@lucide/angular';
import { Invoice } from '../../../core/models/invoice.models';
import { InvoiceService } from '../../../core/services/invoice.service';
import { ModalDialogDirective } from '../../../shared/directives/modal-dialog.directive';

@Component({
  selector: 'app-invoice-modal',
  imports: [ModalDialogDirective, CurrencyPipe, DatePipe, LucideDynamicIcon],
  templateUrl: './invoice-modal.component.html',
  styleUrl: './invoice-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceModalComponent {
  private readonly invoiceService = inject(InvoiceService);

  readonly invoice = input.required<Invoice>();
  readonly closed = output<void>();

  readonly printerIcon = Printer;
  readonly closeIcon = X;
  readonly mailIcon = Mail;
  readonly checkIcon = CheckCircle2;
  readonly fileIcon = FileText;
  readonly buildingIcon = Building;
  readonly userIcon = User;
  readonly sendIcon = Send;

  readonly isSendingEmail = signal<boolean>(false);
  readonly emailSentMessage = signal<string | null>(null);

  printInvoice(): void {
    window.print();
  }

  async sendEmail(): Promise<void> {
    this.isSendingEmail.set(true);
    try {
      const res = await this.invoiceService.sendConfirmationEmail(this.invoice());
      this.isSendingEmail.set(false);
      this.emailSentMessage.set(res.message);
      setTimeout(() => this.emailSentMessage.set(null), 4000);
    } catch {
      this.isSendingEmail.set(false);
    }
  }
}
