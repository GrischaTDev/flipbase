import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideTrendingUp as TrendingUp,
  LucideCoins as Coins,
  LucideDollarSign as DollarSign,
  LucideCalendar as Calendar,
  LucidePlus as Plus,
  LucideTrash2 as Trash2,
  LucidePencil as Pencil,
  LucideTag as Tag,
  LucideClock as Clock,
  LucideArrowUpRight as ArrowUpRight,
  LucideSparkles as Sparkles,
  LucideFileText as FileText,
  LucideRotateCcw as RotateCcw,
  LucideReceipt as Receipt,
  LucideX as X,
  LucideCheckCircle2 as CheckCircle2,
  LucideAlertTriangle as AlertTriangle,
} from '@lucide/angular';
import { SalesService } from '../../core/services/sales.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { ReturnService } from '../../core/services/return.service';
import { SaleCreateModalComponent } from './components/sale-create-modal/sale-create-modal.component';
import { InvoiceModalComponent } from '../../shared/components/invoice-modal/invoice-modal.component';
import { Sale } from '../../core/models/flipbase.models';
import { Invoice } from '../../core/models/invoice.models';
import { RestockAction, ReturnReason, ReturnRecord } from '../../core/models/return.models';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../core/services/sync-status.service';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';

@Component({
  selector: 'app-sales',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    TranslatePipe,
    LucideDynamicIcon,
    SaleCreateModalComponent,
    InvoiceModalComponent,
    CustomSelectComponent,
  ],
  templateUrl: './sales.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesComponent {
  /**
   * Vorgaben fuer das eigene Auswahlfeld.
   *
   * Ein natives Auswahlfeld klappt eine Liste auf, die das Betriebssystem
   * zeichnet - hell, mit fremder Schrift. Deshalb uebernimmt
   * `app-custom-select`, und die Eintraege stehen hier.
   */
  readonly retourengrundOptionen: SelectOption<string>[] = [
    { value: 'buyer_remorse', label: 'Widerruf / Nichtgefallen (14 Tage Gesetz)' },
    { value: 'defective', label: 'Transportschaden / Defekt' },
    { value: 'not_as_described', label: 'Zustand weicht von Beschreibung ab' },
    { value: 'wrong_item', label: 'Falscher Artikel geliefert' },
    { value: 'lost_in_transit', label: 'Sendungsverlust bei Versanddienstleister' },
    { value: 'other', label: 'Sonstiges / Kulanz' },
  ];

  private readonly dialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  readonly salesService = inject(SalesService);
  readonly invoiceService = inject(InvoiceService);
  readonly returnService = inject(ReturnService);

  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly dollarIcon = DollarSign;
  readonly calendarIcon = Calendar;
  readonly plusIcon = Plus;
  readonly trashIcon = Trash2;
  readonly editIcon = Pencil;
  readonly tagIcon = Tag;
  readonly clockIcon = Clock;
  readonly arrowIcon = ArrowUpRight;
  readonly sparklesIcon = Sparkles;
  readonly fileIcon = FileText;
  readonly returnIcon = RotateCcw;
  readonly receiptIcon = Receipt;
  readonly closeIcon = X;
  readonly checkIcon = CheckCircle2;
  readonly alertIcon = AlertTriangle;

  readonly isCreateModalOpen = signal<boolean>(false);
  /** Der Verkauf, der gerade bearbeitet wird - null heisst: keiner. */
  readonly bearbeiteVerkauf = signal<Sale | null>(null);
  readonly selectedPlatform = signal<string>('all');
  readonly activeInvoice = signal<Invoice | null>(null);
  readonly isCreatingInvoice = signal(false);

  // Return modal state
  readonly isReturnModalOpen = signal<boolean>(false);
  readonly selectedSaleForReturn = signal<Sale | null>(null);
  readonly isProcessingReturn = signal<boolean>(false);

  readonly returnForm = new FormGroup({
    reason: new FormControl<ReturnReason>('buyer_remorse', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    refundAmount: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.01)],
    }),
    isFullRefund: new FormControl<boolean>(true, { nonNullable: true }),
    restockAction: new FormControl<RestockAction>('restock_ready', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    notes: new FormControl<string>(''),
  });

  readonly filteredSales = computed(() => {
    const list = this.salesService.sales();
    const plat = this.selectedPlatform();
    if (plat === 'all') return list;
    if (plat === 'returned') {
      const returnSaleIds = new Set(this.returnService.returns().map((r) => r.sale_id));
      return list.filter((s) => returnSaleIds.has(s.id));
    }
    return list.filter((s) => s.platform === plat);
  });

  // KPI Calculations
  readonly totalRealizedProfit = computed(() => {
    return this.salesService.sales().reduce((sum, s) => sum + (s.net_profit || 0), 0);
  });

  readonly totalRevenue = computed(() => {
    return this.salesService.sales().reduce((sum, s) => sum + (s.sale_price || 0), 0);
  });

  readonly averageRoi = computed(() => {
    const list = this.salesService.sales();
    if (list.length === 0) return 0;
    const totalRoi = list.reduce((sum, s) => sum + (s.roi || 0), 0);
    return Number((totalRoi / list.length).toFixed(1));
  });

  readonly averageHoldingDays = computed(() => {
    const list = this.salesService.sales();
    if (list.length === 0) return 0;
    const totalDays = list.reduce((sum, s) => sum + (s.holding_duration_days || 0), 0);
    return Math.round(totalDays / list.length);
  });

  openCreateModal(): void {
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  async openInvoiceForSale(sale: Sale): Promise<void> {
    this.isCreatingInvoice.set(true);
    try {
      const result = await this.invoiceService.generateInvoiceForSale(sale, sale.inventory_item);
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

  openCreditNoteForSale(sale: Sale): void {
    const ret = this.returnService.returns().find((r) => r.sale_id === sale.id);
    if (ret && ret.creditNoteInvoice) {
      this.activeInvoice.set(ret.creditNoteInvoice);
    } else if (ret) {
      const generated = this.returnService.generateCreditNoteInvoice(ret, sale, null);
      this.activeInvoice.set(generated);
    }
  }

  getReturnForSale(saleId: string): ReturnRecord | undefined {
    return this.returnService.returns().find((r) => r.sale_id === saleId);
  }

  openReturnModal(sale: Sale): void {
    this.selectedSaleForReturn.set(sale);
    this.returnForm.patchValue({
      reason: 'buyer_remorse',
      refundAmount: sale.sale_price,
      isFullRefund: true,
      restockAction: 'restock_ready',
      notes: '',
    });
    this.isReturnModalOpen.set(true);
  }

  closeReturnModal(): void {
    this.isReturnModalOpen.set(false);
    this.selectedSaleForReturn.set(null);
  }

  onRefundModeChange(isFull: boolean): void {
    this.returnForm.patchValue({ isFullRefund: isFull });
    const sale = this.selectedSaleForReturn();
    if (isFull && sale) {
      this.returnForm.patchValue({ refundAmount: sale.sale_price });
    }
  }

  async onSubmitReturn(): Promise<void> {
    if (this.returnForm.invalid) return;
    const sale = this.selectedSaleForReturn();
    if (!sale) return;

    this.isProcessingReturn.set(true);
    const val = this.returnForm.getRawValue();

    let ergebnis: Awaited<ReturnType<ReturnService['processReturn']>>;
    try {
      ergebnis = await this.returnService.processReturn({
        sale,
        item: sale.inventory_item,
        reason: val.reason,
        refundAmount: val.refundAmount,
        isFullRefund: val.isFullRefund,
        restockAction: val.restockAction,
        notes: val.notes?.trim() || undefined,
      });
    } catch (ursache: unknown) {
      ergebnis = {
        status: 'error',
        data: null,
        error:
          ursache instanceof Error
            ? ursache
            : new Error('Die Retoure konnte nicht erfasst werden.'),
        problems: [],
      };
    } finally {
      this.isProcessingReturn.set(false);
    }

    if (ergebnis.error) {
      if (ergebnis.status === 'partial') {
        const ungemeldeteProbleme = ergebnis.problems.filter(
          (problem) => !problem.reportedBySyncStatus,
        );
        if (ergebnis.data) {
          this.closeReturnModal();
          if (ergebnis.data.creditNoteInvoice)
            this.activeInvoice.set(ergebnis.data.creditNoteInvoice);
        }
        if (ungemeldeteProbleme.length > 0) {
          this.toast.warning(
            'Retoure wurde mit Einschränkungen erfasst.',
            beschreibeRetourenTeilprobleme(ungemeldeteProbleme),
          );
        }
      } else if (!this.syncStatus.istZentralGemeldet(ergebnis.error)) {
        this.toast.error('Retoure konnte nicht erfasst werden.', ergebnis.error.message);
      }
      return;
    }

    this.closeReturnModal();
    if (ergebnis.data?.creditNoteInvoice) this.activeInvoice.set(ergebnis.data.creditNoteInvoice);
    this.toast.success('Retoure wurde erfasst.');
  }

  closeInvoice(): void {
    this.activeInvoice.set(null);
  }

  async onDeleteSale(sale: Sale): Promise<void> {
    const bestaetigt = await this.dialog.frage({
      titel: 'Verkauf stornieren?',
      text: 'Der Verkauf wird entfernt und der Artikel wieder auf „verkaufsbereit“ gesetzt.',
      bestaetigenText: 'Stornieren',
      gefahr: true,
    });
    if (bestaetigt) {
      let ergebnis: Awaited<ReturnType<SalesService['deleteSale']>>;
      try {
        ergebnis = await this.salesService.deleteSale(sale.id, sale.inventory_item_id);
      } catch (ursache: unknown) {
        ergebnis = {
          data: null,
          error:
            ursache instanceof Error
              ? ursache
              : new Error('Der Verkauf konnte nicht gelöscht werden.'),
          status: 'error',
          problems: [],
        };
      }

      if (ergebnis.error) {
        if (ergebnis.status === 'partial') {
          const ungemeldeteProbleme = ergebnis.problems.filter(
            (problem) => !problem.reportedBySyncStatus,
          );
          if (ungemeldeteProbleme.length > 0) {
            this.toast.warning(
              'Verkauf wurde mit Einschränkungen gelöscht.',
              'Der Artikelstatus „verkaufsbereit“ wird automatisch nachgeholt.',
            );
          }
        } else if (!this.syncStatus.istZentralGemeldet(ergebnis.error)) {
          this.toast.error('Verkauf konnte nicht gelöscht werden.', ergebnis.error.message);
        }
        return;
      }

      this.toast.success('Verkauf wurde gelöscht.');
    }
  }
}

function beschreibeRetourenTeilprobleme(
  problems: readonly { readonly kind: 'inventory_status' | 'sale_return_status' }[],
): string {
  if (problems.some((problem) => problem.kind === 'inventory_status')) {
    return 'Der Artikelstatus wird automatisch nachgeholt.';
  }
  return 'Der Retourenvermerk wird automatisch nachgeholt.';
}
