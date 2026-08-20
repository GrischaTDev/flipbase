import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import {
  LucideAngularModule,
  CheckCircle2,
  Package,
  Truck,
  Building,
  ArrowRight,
  ShoppingBag,
  FileText,
  Printer,
  Mail,
} from 'lucide-angular';
import { StoreService } from '../../../../core/services/store.service';
import { InvoiceService } from '../../../../core/services/invoice.service';
import { StoreOrder } from '../../../../core/models/store.models';
import { Invoice } from '../../../../core/models/invoice.models';
import { InvoiceModalComponent } from '../../../../shared/components/invoice-modal/invoice-modal.component';

@Component({
  selector: 'app-store-order-success',
  imports: [RouterLink, CurrencyPipe, LucideAngularModule, InvoiceModalComponent],
  templateUrl: './store-order-success.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreOrderSuccessComponent {
  private readonly route = inject(ActivatedRoute);
  readonly storeService = inject(StoreService);
  readonly invoiceService = inject(InvoiceService);

  readonly checkIcon = CheckCircle2;
  readonly packageIcon = Package;
  readonly truckIcon = Truck;
  readonly bankIcon = Building;
  readonly arrowIcon = ArrowRight;
  readonly bagIcon = ShoppingBag;
  readonly fileIcon = FileText;
  readonly printerIcon = Printer;
  readonly mailIcon = Mail;

  readonly activeInvoice = signal<Invoice | null>(null);

  readonly order = computed<StoreOrder | null>(() => {
    const id = this.route.snapshot.paramMap.get('orderId');
    if (!id) return null;
    return this.storeService.orders().find((o) => o.id === id) || null;
  });

  openInvoice(): void {
    const ord = this.order();
    if (!ord) return;
    const inv = this.invoiceService.generateInvoiceForOrder(ord);
    this.activeInvoice.set(inv);
  }

  closeInvoice(): void {
    this.activeInvoice.set(null);
  }
}
