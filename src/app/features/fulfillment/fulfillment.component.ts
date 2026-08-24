import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  LucideDynamicIcon,
  LucidePackage as Package,
  LucideTruck as Truck,
  LucideCheckCircle2 as CheckCircle2,
  LucidePrinter as Printer,
  LucideFileText as FileText,
  LucideExternalLink as ExternalLink,
  LucideSearch as Search,
  LucideSliders as Sliders,
  LucideSend as Send,
  LucideQrCode as QrCode,
  LucideAlertTriangle as AlertTriangle,
  LucideX as X,
  LucideMapPin as MapPin,
  LucideZap as Zap,
  LucideCreditCard as CreditCard,
  LucideLayers as Layers,
  LucideSparkles as Sparkles,
  LucideRotateCcw as RotateCcw,
  LucideBoxes as Boxes,
} from '@lucide/angular';
import { FulfillmentService } from '../../core/services/fulfillment.service';
import { ModalDialogDirective } from '../../shared/directives/modal-dialog.directive';
import { LoggerService } from '../../core/services/logger.service';
import {
  BundleCandidate,
  CarrierType,
  ShippingOrder,
  ShippingStatus,
} from '../../core/models/fulfillment.models';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';

@Component({
  selector: 'app-fulfillment',
  imports: [
    ModalDialogDirective,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    LucideDynamicIcon,
    CustomSelectComponent,
  ],
  templateUrl: './fulfillment.component.html',
  styleUrl: './fulfillment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FulfillmentComponent {
  /**
   * Vorgaben fuer das eigene Auswahlfeld.
   *
   * Ein natives Auswahlfeld klappt eine Liste auf, die das Betriebssystem
   * zeichnet - hell, mit fremder Schrift. Deshalb uebernimmt
   * `app-custom-select`, und die Eintraege stehen hier.
   */
  readonly versanddienstOptionen: SelectOption<string>[] = [
    { value: 'dhl', label: 'DHL Paket / Warenpost' },
    { value: 'hermes', label: 'Hermes Logistik' },
    { value: 'dpd', label: 'DPD Deutschland' },
    { value: 'ups', label: 'UPS Express' },
  ];

  private readonly dialog = inject(ConfirmDialogService);
  readonly fulfillmentService = inject(FulfillmentService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly toast = inject(ToastService);
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();

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
  readonly zapIcon = Zap;
  readonly cardIcon = CreditCard;
  readonly layersIcon = Layers;
  readonly sparklesIcon = Sparkles;
  readonly returnIcon = RotateCcw;
  readonly boxesIcon = Boxes;

  readonly selectedStatusTab = signal<ShippingStatus | 'all'>('ready_to_pack');
  readonly searchQuery = signal<string>('');

  // Modals
  readonly isLabelModalOpen = signal<boolean>(false);
  readonly isSlipModalOpen = signal<boolean>(false);
  readonly isTrackingModalOpen = signal<boolean>(false);
  readonly isPurchaseModalOpen = signal<boolean>(false);
  readonly isBundleModalOpen = signal<boolean>(false);

  readonly selectedOrderForPurchase = signal<ShippingOrder | null>(null);
  readonly selectedRateId = signal<string>('dhl-paket-2kg');
  readonly isPurchasing = signal<boolean>(false);

  readonly isBundling = signal<boolean>(false);

  readonly trackingOrderId = signal<string>('');
  readonly trackingForm = new FormGroup({
    carrier: new FormControl<CarrierType>('dhl', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    trackingNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(5)],
    }),
  });

  readonly filteredOrders = computed(() => {
    let list = this.fulfillmentService.orders();
    const tab = this.selectedStatusTab();
    const query = this.searchQuery().toLowerCase().trim();

    if (tab !== 'all') {
      if (tab === 'ready_to_pack') {
        list = list.filter((o) => o.status === 'ready_to_pack' || o.status === 'label_printed');
      } else {
        list = list.filter((o) => o.status === tab);
      }
    }

    if (query) {
      list = list.filter(
        (o) =>
          o.order_number.toLowerCase().includes(query) ||
          o.item_title.toLowerCase().includes(query) ||
          o.customer.name.toLowerCase().includes(query) ||
          o.customer.city.toLowerCase().includes(query) ||
          (o.tracking_number && o.tracking_number.toLowerCase().includes(query)),
      );
    }

    return list;
  });

  async onBundleCandidate(candidate: BundleCandidate): Promise<void> {
    this.isBundling.set(true);
    try {
      const { error } = await this.fulfillmentService.bundleOrders(candidate);
      if (error) {
        this.meldeFehler('Sendungen konnten nicht gebündelt werden.', error);
        return;
      }
      this.toast.success('Sendungen wurden gebündelt.');
    } catch (error: unknown) {
      this.meldeFehler('Sendungen konnten nicht gebündelt werden.', error);
    } finally {
      this.isBundling.set(false);
    }
  }

  async onUnbundleOrder(order: ShippingOrder): Promise<void> {
    const bestaetigt = await this.dialog.frage({
      titel: 'Sammelpaket aufteilen?',
      text: 'Das Sammelpaket wird wieder in einzelne Sendungen zerlegt.',
      bestaetigenText: 'Aufteilen',
    });
    if (bestaetigt) {
      try {
        const { error } = await this.fulfillmentService.unbundleOrder(order.id);
        if (error) {
          this.meldeFehler('Sammelpaket konnte nicht aufgelöst werden.', error);
          return;
        }
        this.toast.success('Sammelpaket wurde aufgelöst.');
      } catch (error: unknown) {
        this.meldeFehler('Sammelpaket konnte nicht aufgelöst werden.', error);
      }
    }
  }

  openPurchaseModal(order: ShippingOrder): void {
    this.selectedOrderForPurchase.set(order);
    this.selectedRateId.set(order.carrier === 'hermes' ? 'hermes-s' : 'dhl-paket-2kg');
    this.isPurchaseModalOpen.set(true);
  }

  closePurchaseModal(): void {
    this.isPurchaseModalOpen.set(false);
    this.selectedOrderForPurchase.set(null);
  }

  /**
   * Frueher: Versandmarke "kaufen".
   *
   * Es wurde nie eine gekauft - die Sendungsnummer war erfunden. Der Einstieg
   * ist deshalb ausgeblendet. Gekauft wird beim Zusteller, die echte Nummer
   * kommt ueber "Sendungsnummer erfassen" herein.
   */
  async onConfirmPurchaseLabel(): Promise<void> {
    this.isPurchaseModalOpen.set(false);
    this.toast.success('Sendungsnummer wurde gespeichert.');
  }

  openLabelModal(order: ShippingOrder): void {
    this.fulfillmentService.selectedOrderForLabel.set(order);
    this.isLabelModalOpen.set(true);
  }

  closeLabelModal(): void {
    this.isLabelModalOpen.set(false);
    this.fulfillmentService.selectedOrderForLabel.set(null);
  }

  openSlipModal(order: ShippingOrder): void {
    this.fulfillmentService.selectedOrderForSlip.set(order);
    this.isSlipModalOpen.set(true);
  }

  closeSlipModal(): void {
    this.isSlipModalOpen.set(false);
    this.fulfillmentService.selectedOrderForSlip.set(null);
  }

  openTrackingModal(order: ShippingOrder): void {
    this.trackingOrderId.set(order.id);
    this.trackingForm.patchValue({
      carrier: order.carrier,
      trackingNumber: order.tracking_number || '',
    });
    this.isTrackingModalOpen.set(true);
  }

  closeTrackingModal(): void {
    this.isTrackingModalOpen.set(false);
    this.trackingOrderId.set('');
  }

  async onSaveTracking(): Promise<void> {
    if (this.trackingForm.invalid) return;
    const { carrier, trackingNumber } = this.trackingForm.getRawValue();
    try {
      const { error } = await this.fulfillmentService.markAsShipped(
        this.trackingOrderId(),
        trackingNumber,
        carrier,
      );
      if (error) {
        this.meldeFehler('Sendungsverfolgung konnte nicht gespeichert werden.', error);
        return;
      }
      this.closeTrackingModal();
      this.toast.success('Sendungsverfolgung wurde gespeichert.');
    } catch (error: unknown) {
      this.meldeFehler('Sendungsverfolgung konnte nicht gespeichert werden.', error);
    }
  }

  markDelivered(orderId: string): void {
    this.fulfillmentService.markAsDelivered(orderId);
  }

  printDocument(): void {
    window.print();
  }

  printCurrentDocument(): void {
    window.print();
  }

  private meldeFehler(titel: string, error: unknown): void {
    if (this.syncStatus.istZentralGemeldet(error)) return;
    this.toast.error(titel, error instanceof Error ? error.message : String(error));
  }
}
