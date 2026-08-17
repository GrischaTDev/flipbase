import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  LucideAngularModule,
  Printer,
  X,
  Mail,
  CheckCircle2,
  FileText,
  Building,
  User,
  Send,
} from 'lucide-angular';
import { Invoice } from '../../../core/models/invoice.models';
import { InvoiceService } from '../../../core/services/invoice.service';

@Component({
  selector: 'app-invoice-modal',
  imports: [CurrencyPipe, DatePipe, LucideAngularModule],
  templateUrl: './invoice-modal.component.html',
  styleUrl: './invoice-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceModalComponent {
  private readonly invoiceService = inject(InvoiceService);

  readonly invoice = input.required<Invoice>();
  readonly close = output<void>();

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
