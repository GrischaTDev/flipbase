import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
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
import { ButtonComponent } from '../../shared/components/button/button.component';
import { ModalShellComponent } from '../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../shared/components/text-field/text-field.component';
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
import { WorkspaceService } from '../../core/services/workspace.service';

@Component({
  selector: 'app-fulfillment',
  imports: [
    ButtonComponent,
    ModalShellComponent,
    TextFieldComponent,
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
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
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
  readonly deliveringOrderId = signal<string | null>(null);

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

  private activeWorkspaceId: string | null | undefined;
  private workspaceActionVersion = 0;

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService?.currentWorkspace()?.id ?? null;
      if (this.activeWorkspaceId === undefined) {
        this.activeWorkspaceId = workspaceId;
        return;
      }
      if (workspaceId !== this.activeWorkspaceId) {
        this.closeWorkspaceDialogs();
        this.activeWorkspaceId = workspaceId;
      }
    });
  }

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
    const action = this.beginWorkspaceAction();
    this.isBundling.set(true);
    try {
      const { error } = await this.fulfillmentService.bundleOrders(candidate);
      if (!this.isCurrentWorkspaceAction(action)) return;
      if (error) {
        this.meldeFehler('Sendungen konnten nicht gebündelt werden.', error);
        return;
      }
      this.toast.success('Sendungen wurden gebündelt.');
    } catch (error: unknown) {
      if (!this.isCurrentWorkspaceAction(action)) return;
      this.meldeFehler('Sendungen konnten nicht gebündelt werden.', error);
    } finally {
      if (this.isCurrentWorkspaceAction(action)) this.isBundling.set(false);
    }
  }

  async onUnbundleOrder(order: ShippingOrder): Promise<void> {
    const action = this.beginWorkspaceAction();
    const bestaetigt = await this.dialog.frage({
      titel: 'Sammelpaket aufteilen?',
      text: 'Das Sammelpaket wird wieder in einzelne Sendungen zerlegt.',
      bestaetigenText: 'Aufteilen',
    });
    if (!this.isCurrentWorkspaceAction(action)) return;
    if (bestaetigt) {
      try {
        const { error } = await this.fulfillmentService.unbundleOrder(order.id);
        if (!this.isCurrentWorkspaceAction(action)) return;
        if (error) {
          this.meldeFehler('Sammelpaket konnte nicht aufgelöst werden.', error);
          return;
        }
        this.toast.success('Sammelpaket wurde aufgelöst.');
      } catch (error: unknown) {
        if (!this.isCurrentWorkspaceAction(action)) return;
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
  openLabelModal(order: ShippingOrder): void {
    if (!this.fulfillmentService.getSenderAddress()) {
      this.toast.warning(
        'Absenderadresse fehlt.',
        'Hinterlege die Absenderdaten zuerst in den Versand-Einstellungen.',
      );
      return;
    }
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
    const action = this.beginWorkspaceAction();
    const { carrier, trackingNumber } = this.trackingForm.getRawValue();
    try {
      const { error } = await this.fulfillmentService.markAsShipped(
        this.trackingOrderId(),
        trackingNumber,
        carrier,
      );
      if (!this.isCurrentWorkspaceAction(action)) return;
      if (error) {
        this.meldeFehler('Sendungsverfolgung konnte nicht gespeichert werden.', error);
        return;
      }
      this.closeTrackingModal();
      this.toast.success('Sendungsverfolgung wurde gespeichert.');
    } catch (error: unknown) {
      if (!this.isCurrentWorkspaceAction(action)) return;
      this.meldeFehler('Sendungsverfolgung konnte nicht gespeichert werden.', error);
    }
  }

  async markDelivered(orderId: string): Promise<void> {
    if (this.deliveringOrderId() !== null) return;
    const action = this.beginWorkspaceAction();
    this.deliveringOrderId.set(orderId);
    try {
      const result = await this.fulfillmentService.markAsDelivered(orderId);
      if (!this.isCurrentWorkspaceAction(action)) return;
      if (result.error) {
        if (!result.reportedBySyncStatus) {
          this.meldeFehler('Sendung konnte nicht als zugestellt markiert werden.', result.error);
        }
        return;
      }
      this.toast.success('Sendung wurde als zugestellt markiert.');
    } catch (error: unknown) {
      if (!this.isCurrentWorkspaceAction(action)) return;
      this.meldeFehler('Sendung konnte nicht als zugestellt markiert werden.', error);
    } finally {
      if (this.isCurrentWorkspaceAction(action)) this.deliveringOrderId.set(null);
    }
  }

  printDocument(): void {
    window.print();
  }

  printCurrentDocument(): void {
    window.print();
  }

  private closeWorkspaceDialogs(): void {
    this.workspaceActionVersion += 1;
    this.isLabelModalOpen.set(false);
    this.isSlipModalOpen.set(false);
    this.isTrackingModalOpen.set(false);
    this.isPurchaseModalOpen.set(false);
    this.isBundleModalOpen.set(false);
    this.isBundling.set(false);
    this.isPurchasing.set(false);
    this.deliveringOrderId.set(null);
    this.trackingOrderId.set('');
    this.trackingForm.reset({ carrier: 'dhl', trackingNumber: '' });
    this.selectedOrderForPurchase.set(null);
    this.fulfillmentService.selectedOrderForLabel.set(null);
    this.fulfillmentService.selectedOrderForSlip.set(null);
    this.fulfillmentService.selectedOrderForPurchase.set(null);
    this.fulfillmentService.selectedBundleCandidate.set(null);
  }

  private beginWorkspaceAction(): {
    readonly version: number;
    readonly workspaceId: string | null;
  } {
    return {
      version: this.workspaceActionVersion,
      workspaceId: this.workspaceService?.currentWorkspace()?.id ?? null,
    };
  }

  private isCurrentWorkspaceAction(action: {
    readonly version: number;
    readonly workspaceId: string | null;
  }): boolean {
    return (
      action.version === this.workspaceActionVersion &&
      action.workspaceId === (this.workspaceService?.currentWorkspace()?.id ?? null)
    );
  }

  private meldeFehler(titel: string, error: unknown): void {
    if (this.syncStatus.istZentralGemeldet(error)) return;
    this.toast.error(titel, error instanceof Error ? error.message : String(error));
  }
}
