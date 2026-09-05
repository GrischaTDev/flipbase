import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideDynamicIcon,
  LucideFileSpreadsheet as FileSpreadsheet,
  LucideDownload as Download,
  LucidePrinter as Printer,
  LucideCalendar as Calendar,
  LucideFilter as Filter,
  LucideCheckCircle2 as CheckCircle2,
  LucideAlertCircle as AlertCircle,
  LucideHelpCircle as HelpCircle,
  LucideReceipt as Receipt,
  LucideFileText as FileText,
  LucideX as X,
  LucideMail as Mail,
  LucideSend as Send,
  LucideBuilding as Building,
  LucideSparkles as Sparkles,
  LucideExternalLink as ExternalLink,
  LucideUploadCloud as UploadCloud,
  LucideCheckCheck as CheckCheck,
  LucideSearch as Search,
  LucideArrowUpRight as ArrowUpRight,
  LucideArrowDownLeft as ArrowDownLeft,
  LucideRefreshCw as RefreshCw,
  LucideSlidersHorizontal as SlidersHorizontal,
  LucideLayers as Layers,
  LucideCreditCard as CreditCard,
  LucideAlertTriangle as AlertTriangle,
  LucideTrash2 as Trash2,
  LucideCheck as Check,
} from '@lucide/angular';
import { TaxEngineService } from '../../core/services/tax-engine.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { TaxAdvisorService } from '../../core/services/tax-advisor.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { SalesService } from '../../core/services/sales.service';
import { BankReconciliationService } from '../../core/services/bank-reconciliation.service';
import { TaxCalculationResult, TaxMode } from '../../core/models/flipbase.models';
import { MonthlyTaxReport } from '../../core/models/accounting.models';
import { BankTransaction } from '../../core/models/bank-reconciliation.models';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';

import { CustomSearchInputComponent } from '../../shared/components/custom-search-input/custom-search-input.component';
import { ModalDialogDirective } from '../../shared/directives/modal-dialog.directive';
import { MockDataStoreService } from '../../core/services/mock-data-store.service';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { TableColumnMenuComponent } from '../../shared/components/table-column-menu/table-column-menu.component';
import { TablePreferencesService } from '../../core/services/table-preferences.service';
import { AccountingColumnId, AccountingSortField } from '../../core/config/table-defaults.config';
import { TableSortState } from '../../core/models/table-preferences.models';

export type AccountingTab = 'tax_journal' | 'bank_reconciliation';
export type BankTxFilter = 'all' | 'matched' | 'pending' | 'booked' | 'ignored';

@Component({
  selector: 'app-accounting',
  imports: [
    ModalDialogDirective,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    LucideDynamicIcon,
    CustomSearchInputComponent,
    CustomSelectComponent,
    TableColumnMenuComponent,
  ],
  templateUrl: './accounting.component.html',
  styleUrl: './accounting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingComponent {
  private readonly tablePreferencesService = inject(TablePreferencesService);
  /**
   * Vorgaben fuer die eigenen Auswahlfelder.
   *
   * Ein natives Auswahlfeld klappt eine Liste auf, die das Betriebssystem
   * zeichnet - hell, mit fremder Schrift. Deshalb uebernimmt
   * `app-custom-select`, und die Eintraege stehen hier.
   */
  readonly jahresOptionen: SelectOption<number>[] = [
    { value: 2026, label: '2026' },
    { value: 2025, label: '2025' },
    { value: 2024, label: '2024' },
  ];

  readonly zeitraumOptionen: SelectOption<string>[] = [
    { value: 'all', label: 'Ganzes Jahr' },
    { value: 'Q1', label: '1. Quartal (Q1)' },
    { value: 'Q2', label: '2. Quartal (Q2)' },
    { value: 'Q3', label: '3. Quartal (Q3)' },
    { value: 'Q4', label: '4. Quartal (Q4)' },
    { value: '01', label: 'Januar (01)' },
    { value: '02', label: 'Februar (02)' },
    { value: '03', label: 'März (03)' },
    { value: '04', label: 'April (04)' },
    { value: '05', label: 'Mai (05)' },
    { value: '06', label: 'Juni (06)' },
    { value: '07', label: 'Juli (07)' },
    { value: '08', label: 'August (08)' },
    { value: '09', label: 'September (09)' },
    { value: '10', label: 'Oktober (10)' },
    { value: '11', label: 'November (11)' },
    { value: '12', label: 'Dezember (12)' },
  ];

  readonly kontenrahmenOptionen: SelectOption<string>[] = [
    { value: 'SKR03', label: 'SKR03' },
    { value: 'SKR04', label: 'SKR04' },
  ];

  readonly taxEngine = inject(TaxEngineService);
  readonly workspaceService = inject(WorkspaceService);
  readonly taxAdvisorService = inject(TaxAdvisorService);
  readonly purchaseService = inject(PurchaseService);
  readonly salesService = inject(SalesService);
  readonly bankService = inject(BankReconciliationService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly toast = inject(ToastService);
  private readonly mockStore = inject(MockDataStoreService);

  /** Nur im Demo-Modus darf erfundenes Buchungsmaterial geladen werden. */
  readonly istDemoModus = computed(() => this.mockStore.isDemoMode());

  // Tab State
  readonly activeTab = signal<AccountingTab>('tax_journal');

  // Icons
  readonly spreadsheetIcon = FileSpreadsheet;
  readonly downloadIcon = Download;
  readonly printIcon = Printer;
  readonly calendarIcon = Calendar;
  readonly filterIcon = Filter;
  readonly checkIcon = CheckCircle2;
  readonly checkCheckIcon = CheckCheck;
  readonly checkSingleIcon = Check;
  readonly alertIcon = AlertCircle;
  readonly helpIcon = HelpCircle;
  readonly receiptIcon = Receipt;
  readonly fileIcon = FileText;
  readonly closeIcon = X;
  readonly mailIcon = Mail;
  readonly sendIcon = Send;
  readonly buildingIcon = Building;
  readonly sparklesIcon = Sparkles;
  readonly linkIcon = ExternalLink;
  readonly uploadIcon = UploadCloud;
  readonly searchIcon = Search;
  readonly incomeIcon = ArrowDownLeft;
  readonly expenseIcon = ArrowUpRight;
  readonly refreshIcon = RefreshCw;
  readonly slidersIcon = SlidersHorizontal;
  readonly layersIcon = Layers;
  readonly cardIcon = CreditCard;
  readonly alertTriangleIcon = AlertTriangle;
  readonly trashIcon = Trash2;

  // Tax Journal State
  readonly selectedYear = signal<number>(2026);
  readonly selectedPeriod = signal<string>('08'); // 'all', 'Q1'..'Q4', or '01'..'12'
  readonly selectedTaxMode = signal<TaxMode>('diff_25a');

  readonly invoiceModalItem = signal<TaxCalculationResult | null>(null);
  readonly isTaxAdvisorModalOpen = signal<boolean>(false);

  // Bank Reconciliation State
  readonly bankTxFilter = signal<BankTxFilter>('all');
  readonly bankSearchQuery = signal<string>('');
  readonly isDraggingFile = signal<boolean>(false);
  readonly manualAssignTx = signal<BankTransaction | null>(null);

  readonly advisorForm = new FormGroup({
    firmName: new FormControl(this.taxAdvisorService.advisorConfig().firmName, {
      nonNullable: true,
    }),
    advisorEmail: new FormControl(this.taxAdvisorService.advisorConfig().advisorEmail, {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    clientNumber: new FormControl(this.taxAdvisorService.advisorConfig().clientNumber, {
      nonNullable: true,
    }),
    consultantNumber: new FormControl(this.taxAdvisorService.advisorConfig().consultantNumber, {
      nonNullable: true,
    }),
    skrStandard: new FormControl<'SKR03' | 'SKR04'>(
      this.taxAdvisorService.advisorConfig().skrStandard,
      { nonNullable: true },
    ),
  });

  // Filtered Tax Results
  readonly filteredTaxResults = computed<TaxCalculationResult[]>(() => {
    const results = this.taxEngine.allTaxCalculations();
    const year = this.selectedYear();
    const period = this.selectedPeriod();

    return results.filter((r) => {
      if (!r.sale_date) return true;
      const date = new Date(r.sale_date);
      if (date.getFullYear() !== year) return false;

      const month = date.getMonth() + 1;
      if (period === 'all') return true;
      if (period === 'Q1') return month >= 1 && month <= 3;
      if (period === 'Q2') return month >= 4 && month <= 6;
      if (period === 'Q3') return month >= 7 && month <= 9;
      if (period === 'Q4') return month >= 10 && month <= 12;

      return month === parseInt(period, 10);
    });
  });

  readonly periodSummary = computed(() => {
    const results = this.filteredTaxResults();
    let label = `${this.selectedYear()}`;
    if (this.selectedPeriod() !== 'all') {
      label += ` (${this.selectedPeriod()})`;
    }
    return this.taxEngine.summarizePeriod(results, label, this.selectedTaxMode());
  });

  readonly advisorReport = computed<MonthlyTaxReport>(() => {
    return this.taxAdvisorService.buildMonthlyReport(
      this.selectedYear(),
      this.selectedPeriod(),
      this.filteredTaxResults(),
      this.purchaseService.purchases(),
      this.salesService.sales(),
      this.workspaceService.currentWorkspace()?.name || 'Flipbase HQ',
    );
  });

  readonly workspaceId = computed(() => this.workspaceService.currentWorkspace()?.id ?? 'default');
  readonly accountingTableConfig = this.tablePreferencesService.getTableConfig<
    AccountingColumnId,
    AccountingSortField
  >('accounting');
  readonly tablePrefs = computed(() =>
    this.tablePreferencesService.getTablePreferences<AccountingColumnId, AccountingSortField>(
      'accounting',
      this.workspaceId(),
    )(),
  );

  isColumnVisible(colId: AccountingColumnId): boolean {
    const col = this.tablePrefs().columns.find((c) => c.id === colId);
    return col?.visible ?? true;
  }

  toggleColumnVisibility(colId: AccountingColumnId): void {
    this.tablePreferencesService.toggleColumnVisibility('accounting', colId, this.workspaceId());
  }

  onSortChanged(sort: TableSortState<AccountingSortField>): void {
    this.tablePreferencesService.setSort('accounting', sort, this.workspaceId());
  }

  onColumnsReordered(event: { previousIndex: number; currentIndex: number }): void {
    this.tablePreferencesService.reorderColumns(
      'accounting',
      event.previousIndex,
      event.currentIndex,
      this.workspaceId(),
    );
  }

  resetTablePreferences(): void {
    this.tablePreferencesService.resetToDefaults('accounting', this.workspaceId());
  }

  // Filtered Bank Transactions
  readonly filteredBankTransactions = computed<BankTransaction[]>(() => {
    const all = this.bankService.transactions();
    const filter = this.bankTxFilter();
    const q = this.bankSearchQuery().toLowerCase().trim();

    const filtered = all.filter((tx) => {
      // Status filter
      if (filter === 'matched' && tx.status !== 'matched') return false;
      if (filter === 'pending' && tx.status !== 'pending') return false;
      if (filter === 'booked' && tx.status !== 'booked') return false;
      if (filter === 'ignored' && tx.status !== 'ignored') return false;

      // Text search
      if (q) {
        const text =
          `${tx.counterpartyName} ${tx.purpose} ${tx.amount} ${tx.match?.targetReference || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });

    const sort = this.tablePrefs().sort;
    return filtered.sort((a, b) => {
      let cmp = 0;
      switch (sort.field) {
        case 'booking_date':
          cmp = new Date(a.bookingDate).getTime() - new Date(b.bookingDate).getTime();
          break;
        case 'amount':
          cmp = a.amount - b.amount;
          break;
        case 'counterparty':
          cmp = a.counterpartyName.localeCompare(b.counterpartyName, 'de');
          break;
      }
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  });

  // --- Bank Reconciliation Methods ---

  async onFileUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    await this.processBankFile(file);
    input.value = '';
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingFile.set(false);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      this.processBankFile(file);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingFile.set(true);
  }

  onDragLeave(): void {
    this.isDraggingFile.set(false);
  }

  private async processBankFile(file: File): Promise<void> {
    try {
      const res = await this.bankService.importBankStatementFile(file);
      if (res.success) {
        this.toast.success('Kontoauszug wurde importiert.');
      } else if (!res.problem?.reportedBySyncStatus) {
        this.toast.error('Kontoauszug konnte nicht importiert werden.', res.message);
      }
    } catch (error: unknown) {
      this.meldeLokalenFehler('Kontoauszug konnte nicht importiert werden.', error);
    }
  }

  onLoadDemoStatement(): void {
    try {
      this.bankService.loadDemoStatement();
      this.toast.success('Demo-Kontoauszug wurde geladen.');
    } catch (error: unknown) {
      this.meldeLokalenFehler('Demo-Kontoauszug konnte nicht geladen werden.', error);
    }
  }

  async onBookTransaction(txId: string): Promise<void> {
    try {
      const res = await this.bankService.bookTransaction(txId);
      if (res.success) {
        this.toast.success('Transaktion wurde gebucht.');
      } else if (!res.problem.reportedBySyncStatus) {
        this.toast.error('Transaktion konnte nicht gebucht werden.', res.message);
      }
    } catch (error: unknown) {
      this.meldeLokalenFehler('Transaktion konnte nicht gebucht werden.', error);
    }
  }

  async onBookAllExactMatches(): Promise<void> {
    try {
      const result = await this.bankService.bookAllExactMatches();
      switch (result.status) {
        case 'success':
          this.toast.success('Passende Transaktionen wurden gebucht.');
          break;
        case 'empty':
          this.toast.info('Keine passenden Transaktionen gefunden.');
          break;
        case 'partial':
          this.toast.warning('Einige Transaktionen konnten nicht gebucht werden.', result.message);
          break;
        case 'failed':
          if (result.problems.some(({ reportedBySyncStatus }) => !reportedBySyncStatus)) {
            this.toast.error(
              'Passende Transaktionen konnten nicht gebucht werden.',
              result.message,
            );
          }
          break;
      }
    } catch (error: unknown) {
      this.meldeLokalenFehler('Passende Transaktionen konnten nicht gebucht werden.', error);
    }
  }

  async onIgnoreTransaction(txId: string): Promise<void> {
    try {
      const result = await this.bankService.ignoreTransaction(txId);
      if (result.status === 'success') {
        this.toast.success('Transaktion wurde ignoriert.');
      } else if (!result.problem.reportedBySyncStatus) {
        this.toast.error('Transaktion konnte nicht ignoriert werden.', result.message);
      }
    } catch (error: unknown) {
      this.meldeLokalenFehler('Transaktion konnte nicht ignoriert werden.', error);
    }
  }

  async onResetBankStatement(): Promise<void> {
    try {
      const result = await this.bankService.resetStatement();
      if (result.status === 'success') {
        this.toast.success('Kontoauszug wurde zurückgesetzt.');
      } else if (!result.problem.reportedBySyncStatus) {
        this.toast.error('Kontoauszug konnte nicht zurückgesetzt werden.', result.message);
      }
    } catch (error: unknown) {
      this.meldeLokalenFehler('Kontoauszug konnte nicht zurückgesetzt werden.', error);
    }
  }

  openManualAssign(tx: BankTransaction): void {
    this.manualAssignTx.set(tx);
  }

  closeManualAssign(): void {
    this.manualAssignTx.set(null);
  }

  // --- Tax Advisor / Export Methods ---

  onDownloadDatev(): void {
    try {
      const report = this.advisorReport();
      const csv = this.taxAdvisorService.generateDatevExtfCsv(report, this.filteredTaxResults());
      this.downloadFile(
        csv,
        `DATEV_Buchungsstapel_${this.selectedYear()}_${this.selectedPeriod()}.csv`,
        'text/csv;charset=utf-8;',
      );
      this.toast.success('DATEV-Buchungsstapel wurde exportiert.');
    } catch (error: unknown) {
      this.meldeLokalenFehler('DATEV-Buchungsstapel konnte nicht exportiert werden.', error);
    }
  }

  onDownloadDiffTaxJournal(): void {
    try {
      const csv = this.taxAdvisorService.generateDiffTaxJournalCsv(this.filteredTaxResults());
      this.downloadFile(
        csv,
        `DiffBesteuerung_25a_Journal_${this.selectedYear()}_${this.selectedPeriod()}.csv`,
        'text/csv;charset=utf-8;',
      );
      this.toast.success('§-25a-Journal wurde exportiert.');
    } catch (error: unknown) {
      this.meldeLokalenFehler('§-25a-Journal konnte nicht exportiert werden.', error);
    }
  }

  onDownloadEur(): void {
    try {
      const csv = this.taxEngine.generateEurCsv(this.filteredTaxResults());
      this.downloadFile(
        csv,
        `EUER_Bericht_${this.selectedYear()}_${this.selectedPeriod()}.csv`,
        'text/csv;charset=utf-8;',
      );
      this.toast.success('EÜR-Bericht wurde exportiert.');
    } catch (error: unknown) {
      this.meldeLokalenFehler('EÜR-Bericht konnte nicht exportiert werden.', error);
    }
  }

  async onPrepareReportForAdvisor(): Promise<void> {
    try {
      const val = this.advisorForm.getRawValue();
      this.taxAdvisorService.updateAdvisorConfig(val);

      const report = this.advisorReport();
      const res = await this.taxAdvisorService.prepareReportPackageForAdvisor(
        report,
        val.advisorEmail,
      );
      this.toast.info('Berichtspaket wurde vorbereitet.', res.message);
    } catch (error: unknown) {
      this.meldeLokalenFehler('Berichtspaket konnte nicht vorbereitet werden.', error);
    }
  }

  private meldeLokalenFehler(title: string, error: unknown): void {
    if (this.syncStatus.istZentralGemeldet(error)) return;
    this.toast.error(title, error instanceof Error ? error.message : String(error));
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    // Byte Order Mark voranstellen: Ohne sie zeigen DATEV und Excel Umlaute in
    // Artikelbezeichnungen und Buchungstexten verstuemmelt an.
    const blob = new Blob(['\uFEFF' + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  openTaxAdvisorModal(): void {
    this.isTaxAdvisorModalOpen.set(true);
  }

  closeTaxAdvisorModal(): void {
    this.isTaxAdvisorModalOpen.set(false);
  }

  openInvoiceModal(item: TaxCalculationResult): void {
    this.invoiceModalItem.set(item);
  }

  closeInvoiceModal(): void {
    this.invoiceModalItem.set(null);
  }

  printInvoice(): void {
    window.print();
  }
}
