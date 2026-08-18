import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideAngularModule,
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  Filter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Receipt,
  FileText,
  X,
  Mail,
  Send,
  Building,
  Sparkles,
  ExternalLink,
  UploadCloud,
  CheckCheck,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  SlidersHorizontal,
  Layers,
  CreditCard,
  AlertTriangle,
  Trash2,
  Check,
} from 'lucide-angular';
import { TaxEngineService } from '../../core/services/tax-engine.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { TaxAdvisorService } from '../../core/services/tax-advisor.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { SalesService } from '../../core/services/sales.service';
import { BankReconciliationService } from '../../core/services/bank-reconciliation.service';
import { TaxCalculationResult, TaxMode } from '../../core/models/reflip.models';
import { MonthlyTaxReport } from '../../core/models/accounting.models';
import { BankTransaction } from '../../core/models/bank-reconciliation.models';

export type AccountingTab = 'tax_journal' | 'bank_reconciliation';
export type BankTxFilter = 'all' | 'matched' | 'pending' | 'booked' | 'ignored';

@Component({
  selector: 'app-accounting',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, LucideAngularModule],
  templateUrl: './accounting.component.html',
  styleUrl: './accounting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingComponent {
  readonly taxEngine = inject(TaxEngineService);
  readonly workspaceService = inject(WorkspaceService);
  readonly taxAdvisorService = inject(TaxAdvisorService);
  readonly purchaseService = inject(PurchaseService);
  readonly salesService = inject(SalesService);
  readonly bankService = inject(BankReconciliationService);

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
  readonly emailSentStatus = signal<{ success: boolean; text: string } | null>(null);

  // Bank Reconciliation State
  readonly bankTxFilter = signal<BankTxFilter>('all');
  readonly bankSearchQuery = signal<string>('');
  readonly isDraggingFile = signal<boolean>(false);
  readonly bookingFeedback = signal<{ success: boolean; message: string } | null>(null);
  readonly manualAssignTx = signal<BankTransaction | null>(null);

  readonly advisorForm = new FormGroup({
    firmName: new FormControl(this.taxAdvisorService.advisorConfig().firmName, { nonNullable: true }),
    advisorEmail: new FormControl(this.taxAdvisorService.advisorConfig().advisorEmail, {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    clientNumber: new FormControl(this.taxAdvisorService.advisorConfig().clientNumber, { nonNullable: true }),
    consultantNumber: new FormControl(this.taxAdvisorService.advisorConfig().consultantNumber, { nonNullable: true }),
    skrStandard: new FormControl<'SKR03' | 'SKR04'>(this.taxAdvisorService.advisorConfig().skrStandard, { nonNullable: true }),
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
      this.workspaceService.currentWorkspace()?.name || 'ReFlip HQ'
    );
  });

  // Filtered Bank Transactions
  readonly filteredBankTransactions = computed<BankTransaction[]>(() => {
    const all = this.bankService.transactions();
    const filter = this.bankTxFilter();
    const q = this.bankSearchQuery().toLowerCase().trim();

    return all.filter((tx) => {
      // Status filter
      if (filter === 'matched' && tx.status !== 'matched') return false;
      if (filter === 'pending' && tx.status !== 'pending') return false;
      if (filter === 'booked' && tx.status !== 'booked') return false;
      if (filter === 'ignored' && tx.status !== 'ignored') return false;

      // Text search
      if (q) {
        const text = `${tx.counterpartyName} ${tx.purpose} ${tx.amount} ${tx.match?.targetReference || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
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
    const res = await this.bankService.importBankStatementFile(file);
    if (res.success) {
      this.bookingFeedback.set({ success: true, message: res.message });
    } else {
      this.bookingFeedback.set({ success: false, message: res.message });
    }
    setTimeout(() => this.bookingFeedback.set(null), 6000);
  }

  onLoadDemoStatement(): void {
    this.bankService.loadDemoStatement();
    this.bookingFeedback.set({
      success: true,
      message: 'Demo-Kontoauszug (Sparkasse August 2026) geladen und mit Shop-Bestellungen abgeglichen.',
    });
    setTimeout(() => this.bookingFeedback.set(null), 5000);
  }

  async onBookTransaction(txId: string): Promise<void> {
    const res = await this.bankService.bookTransaction(txId);
    this.bookingFeedback.set(res);
    setTimeout(() => this.bookingFeedback.set(null), 4000);
  }

  async onBookAllExactMatches(): Promise<void> {
    const res = await this.bankService.bookAllExactMatches();
    this.bookingFeedback.set({ success: true, message: res.message });
    setTimeout(() => this.bookingFeedback.set(null), 5000);
  }

  onIgnoreTransaction(txId: string): void {
    this.bankService.ignoreTransaction(txId);
  }

  onResetBankStatement(): void {
    this.bankService.resetStatement();
    this.bookingFeedback.set({ success: true, message: 'Kontoauszug-Daten zurückgesetzt.' });
    setTimeout(() => this.bookingFeedback.set(null), 3000);
  }

  openManualAssign(tx: BankTransaction): void {
    this.manualAssignTx.set(tx);
  }

  closeManualAssign(): void {
    this.manualAssignTx.set(null);
  }

  // --- Tax Advisor / Export Methods ---

  onDownloadDatev(): void {
    const report = this.advisorReport();
    const csv = this.taxAdvisorService.generateDatevExtfCsv(report, this.filteredTaxResults());
    this.downloadFile(csv, `DATEV_Buchungsstapel_${this.selectedYear()}_${this.selectedPeriod()}.csv`, 'text/csv;charset=utf-8;');
  }

  onDownloadDiffTaxJournal(): void {
    const csv = this.taxAdvisorService.generateDiffTaxJournalCsv(this.filteredTaxResults());
    this.downloadFile(csv, `DiffBesteuerung_25a_Journal_${this.selectedYear()}_${this.selectedPeriod()}.csv`, 'text/csv;charset=utf-8;');
  }

  onDownloadEur(): void {
    const csv = this.taxEngine.generateEurCsv(this.filteredTaxResults());
    this.downloadFile(csv, `EUER_Bericht_${this.selectedYear()}_${this.selectedPeriod()}.csv`, 'text/csv;charset=utf-8;');
  }

  async onSendEmailToAdvisor(): Promise<void> {
    const val = this.advisorForm.getRawValue();
    this.taxAdvisorService.updateAdvisorConfig(val);

    const report = this.advisorReport();
    const res = await this.taxAdvisorService.sendReportPackageToAdvisor(report, val.advisorEmail);

    if (res.success) {
      this.emailSentStatus.set({ success: true, text: res.message });
    } else {
      this.emailSentStatus.set({ success: false, text: 'Übermittlung an den Steuerberater fehlgeschlagen.' });
    }
    setTimeout(() => this.emailSentStatus.set(null), 5000);
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
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
