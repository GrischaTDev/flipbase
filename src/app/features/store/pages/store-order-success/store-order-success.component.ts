import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import {
  LucideDynamicIcon,
  LucideCheckCircle2 as CheckCircle2,
  LucidePackage as Package,
  LucideTruck as Truck,
  LucideBuilding as Building,
  LucideArrowRight as ArrowRight,
  LucideShoppingBag as ShoppingBag,
  LucideFileText as FileText,
  LucidePrinter as Printer,
  LucideMail as Mail,
} from '@lucide/angular';
import { StoreService } from '../../../../core/services/store.service';
import { InvoiceService } from '../../../../core/services/invoice.service';
import { StoreOrder } from '../../../../core/models/store.models';
import { Invoice } from '../../../../core/models/invoice.models';
import { InvoiceModalComponent } from '../../../../shared/components/invoice-modal/invoice-modal.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';

@Component({
  selector: 'app-store-order-success',
  imports: [RouterLink, CurrencyPipe, LucideDynamicIcon, InvoiceModalComponent],
  templateUrl: './store-order-success.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreOrderSuccessComponent {
  private readonly route = inject(ActivatedRoute);
  readonly storeService = inject(StoreService);
  readonly invoiceService = inject(InvoiceService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);

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
  readonly isCreatingInvoice = signal(false);

  readonly order = computed<StoreOrder | null>(() => {
    const id = this.route.snapshot.paramMap.get('orderId');
    if (!id) return null;
    return this.storeService.orders().find((o) => o.id === id) || null;
  });

  async openInvoice(): Promise<void> {
    if (this.isCreatingInvoice()) return;
    const ord = this.order();
    if (!ord) return;
    this.isCreatingInvoice.set(true);
    try {
      const result = await this.invoiceService.generateInvoiceForOrder(ord);
      if (result.error || !result.data) {
        const error = result.error ?? new Error('Die Rechnung konnte nicht erstellt werden.');
        if (!result.reportedBySyncStatus && !this.syncStatus.istZentralGemeldet(error)) {
          this.toast.error('Rechnung konnte nicht erstellt werden.', error.message);
        }
        return;
      }
      this.activeInvoice.set(result.data);
      if (result.created) this.toast.success('Rechnung wurde erstellt.');
    } catch (ursache: unknown) {
      const error = ursache instanceof Error ? ursache : new Error('Unbekannter Fehler');
      if (!this.syncStatus.istZentralGemeldet(error)) {
        this.toast.error('Rechnung konnte nicht erstellt werden.', error.message);
      }
    } finally {
      this.isCreatingInvoice.set(false);
    }
  }

  closeInvoice(): void {
    this.activeInvoice.set(null);
  }
}
