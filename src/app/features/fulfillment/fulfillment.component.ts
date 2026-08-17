import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  Package,
  Truck,
  CheckCircle2,
  Printer,
  FileText,
  ExternalLink,
  Search,
  Sliders,
  Send,
  QrCode,
  AlertTriangle,
  X,
  MapPin,
} from 'lucide-angular';
import { FulfillmentService } from '../../core/services/fulfillment.service';
import { CarrierType, ShippingOrder, ShippingStatus } from '../../core/models/fulfillment.models';

@Component({
  selector: 'app-fulfillment',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, LucideAngularModule],
  templateUrl: './fulfillment.component.html',
  styleUrl: './fulfillment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FulfillmentComponent {
  readonly fulfillmentService = inject(FulfillmentService);

  readonly packageIcon = Package;
  readonly truckIcon = Truck;
  readonly checkIcon = CheckCircle2;
  readonly printIcon = Printer;
  readonly fileIcon = FileText;
  readonly linkIcon = ExternalLink;
  readonly searchIcon = Search;
  readonly slidersIcon = Sliders;
  readonly sendIcon = Send;
  readonly qrIcon = QrCode;
  readonly alertIcon = AlertTriangle;
  readonly closeIcon = X;
  readonly pinIcon = MapPin;

  readonly selectedStatusTab = signal<ShippingStatus | 'all'>('ready_to_pack');
  readonly searchQuery = signal<string>('');

  // Modals
  readonly isLabelModalOpen = signal<boolean>(false);
  readonly isSlipModalOpen = signal<boolean>(false);
  readonly isTrackingModalOpen = signal<boolean>(false);

  readonly trackingOrderId = signal<string>('');
  readonly trackingForm = new FormGroup({
    carrier: new FormControl<CarrierType>('dhl', { nonNullable: true, validators: [Validators.required] }),
    trackingNumber: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(5)] }),
  });

  readonly filteredOrders = computed<ShippingOrder[]>(() => {
    const status = this.selectedStatusTab();
    const q = this.searchQuery().toLowerCase().trim();

    return this.fulfillmentService.orders().filter((o) => {
      const matchStatus = status === 'all' || o.status === status || (status === 'ready_to_pack' && o.status === 'label_printed');
      const matchQuery =
        !q ||
        o.order_number.toLowerCase().includes(q) ||
        o.item_title.toLowerCase().includes(q) ||
        o.customer.name.toLowerCase().includes(q) ||
        o.customer.city.toLowerCase().includes(q) ||
        (o.tracking_number && o.tracking_number.toLowerCase().includes(q));

      return matchStatus && matchQuery;
    });
  });

  openLabelModal(order: ShippingOrder): void {
    this.fulfillmentService.selectedOrderForLabel.set(order);
    this.fulfillmentService.markAsPrinted(order.id);
    this.isLabelModalOpen.set(true);
  }

  closeLabelModal(): void {
    this.isLabelModalOpen.set(false);
  }

  openSlipModal(order: ShippingOrder): void {
    this.fulfillmentService.selectedOrderForSlip.set(order);
    this.isSlipModalOpen.set(true);
  }

  closeSlipModal(): void {
    this.isSlipModalOpen.set(false);
  }

  openTrackingModal(order: ShippingOrder): void {
    this.trackingOrderId.set(order.id);
    this.trackingForm.patchValue({
      carrier: order.carrier || 'dhl',
      trackingNumber: order.tracking_number || '',
    });
    this.isTrackingModalOpen.set(true);
  }

  closeTrackingModal(): void {
    this.isTrackingModalOpen.set(false);
  }

  onSaveTracking(): void {
    if (this.trackingForm.invalid) return;

    const { carrier, trackingNumber } = this.trackingForm.getRawValue();
    this.fulfillmentService.markAsShipped(this.trackingOrderId(), trackingNumber, carrier);
    this.closeTrackingModal();
  }

  markDelivered(orderId: string): void {
    this.fulfillmentService.markAsDelivered(orderId);
  }

  printDocument(): void {
    window.print();
  }
}
