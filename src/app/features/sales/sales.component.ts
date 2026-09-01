import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { ToastService } from '../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../core/services/sync-status.service';
import {
  LegacySaleReconciliation,
  SaleTarget,
  SaleTargetRouteState,
} from '../../core/models/sale-target.models';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { WorkspaceService } from '../../core/services/workspace.service';
import { SaleMetrics } from '../../core/models/sale-metrics.models';
import { calculateStoredSaleMetrics } from '../../core/utils/sale-metrics';

const SALE_TARGET_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function validatedSaleTargetId(value: string | null): string | null {
  if (!value || !SALE_TARGET_ID_PATTERN.test(value)) return null;
  return value;
}

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

  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly workspaceService = inject(WorkspaceService);
  readonly salesService = inject(SalesService);
  readonly invoiceService = inject(InvoiceService);
  readonly returnService = inject(ReturnService);

  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly dollarIcon = DollarSign;
  readonly calendarIcon = Calendar;
  readonly plusIcon = Plus;
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
  readonly createSaleTarget = signal<SaleTarget | null>(null);
  readonly legacySaleReconciliation = signal<LegacySaleReconciliation | null>(null);
  readonly selectedPlatform = signal<string>('all');
  readonly activeInvoice = signal<Invoice | null>(null);
  readonly isCreatingInvoice = signal(false);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private lastFocusedSaleId: string | null = null;

  readonly requestedSaleId = computed(() =>
    validatedSaleTargetId(this.queryParams().get('saleId')),
  );
  readonly highlightedSaleId = computed(() => {
    const saleId = this.requestedSaleId();
    const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
    if (
      !saleId ||
      !workspaceId ||
      this.salesService.loadError() ||
      this.salesService.loadedWorkspaceId() !== workspaceId
    ) {
      return null;
    }
    return this.salesService
      .sales()
      .some((sale) => sale.id === saleId && sale.workspace_id === workspaceId)
      ? saleId
      : null;
  });

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
      return list.filter(
        (sale) =>
          (sale.returned_at !== null && sale.returned_at !== undefined) ||
          returnSaleIds.has(sale.id),
      );
    }
    return list.filter((s) => s.platform === plat);
  });

  // KPI Calculations
  readonly totalRealizedProfit = computed(() => {
    return this.filteredSales().reduce(
      (sum, sale) => sum + (this.saleMetrics(sale).resultAfterDirectCosts ?? 0),
      0,
    );
  });

  readonly totalRevenue = computed(() => {
    return this.filteredSales().reduce((sum, sale) => sum + this.saleMetrics(sale).revenue, 0);
  });

  readonly averageMargin = computed(() => {
    const margins = this.filteredSales()
      .map((sale) => this.saleMetrics(sale).marginPercent)
      .filter((margin): margin is number => margin !== null);
    if (margins.length === 0) return null;
    return Number((margins.reduce((sum, margin) => sum + margin, 0) / margins.length).toFixed(1));
  });

  readonly averageHoldingDays = computed(() => {
    const list = this.filteredSales();
    if (list.length === 0) return 0;
    const totalDays = list.reduce((sum, s) => sum + (s.holding_duration_days || 0), 0);
    return Math.round(totalDays / list.length);
  });

  readonly returnedSalesCount = computed(
    () =>
      this.salesService
        .sales()
        .filter((sale) => sale.returned_at !== null && sale.returned_at !== undefined).length,
  );

  constructor() {
    const state = (this.router.getCurrentNavigation()?.extras.state ??
      globalThis.history?.state ??
      {}) as Partial<SaleTargetRouteState>;
    if (state.saleTarget) {
      this.createSaleTarget.set(state.saleTarget);
      this.legacySaleReconciliation.set(state.legacyReconciliation ?? null);
      this.isCreateModalOpen.set(true);
    }

    afterRenderEffect({
      write: () => {
        const saleId = this.highlightedSaleId();
        if (!saleId) {
          this.lastFocusedSaleId = null;
          return;
        }
        if (this.lastFocusedSaleId === saleId) return;

        const desktop = globalThis.matchMedia?.('(min-width: 768px)').matches ?? true;
        const prefix = desktop ? 'sale-desktop-' : 'sale-mobile-';
        const target = this.host.nativeElement.querySelector<HTMLElement>(`#${prefix}${saleId}`);
        if (!target) return;

        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.lastFocusedSaleId = saleId;
      },
    });
  }

  openCreateModal(): void {
    this.createSaleTarget.set(null);
    this.legacySaleReconciliation.set(null);
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
    this.createSaleTarget.set(null);
    this.legacySaleReconciliation.set(null);
  }

  async openInvoiceForSale(sale: Sale): Promise<void> {
    if (this.isCreatingInvoice()) return;
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

  saleQuantity(sale: Sale): number {
    return sale.lines?.reduce((sum, line) => sum + line.quantity, 0) ?? 1;
  }

  saleMetrics(sale: Sale): SaleMetrics {
    return calculateStoredSaleMetrics(sale);
  }

  saleTitle(sale: Sale): string {
    return (
      sale.lines?.map((line) => line.title_snapshot).join(', ') ||
      sale.inventory_item?.title ||
      'Artikel'
    );
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
    if (this.isProcessingReturn()) return;
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
        data: null,
        error:
          ursache instanceof Error
            ? ursache
            : new Error('Die Retoure konnte nicht erfasst werden.'),
        status: 'error',
        problems: [],
      };
    } finally {
      this.isProcessingReturn.set(false);
    }

    if (ergebnis.error) {
      if (!this.syncStatus.istZentralGemeldet(ergebnis.error)) {
        this.toast.error('Retoure konnte nicht erfasst werden.', ergebnis.error.message);
      }
      return;
    }

    this.closeReturnModal();
    this.activeInvoice.set(ergebnis.data?.creditNoteInvoice ?? null);
    this.toast.success('Retoure wurde erfasst.');
  }

  closeInvoice(): void {
    this.activeInvoice.set(null);
  }
}
