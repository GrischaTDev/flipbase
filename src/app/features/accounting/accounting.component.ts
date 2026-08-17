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
} from 'lucide-angular';
import { TaxEngineService } from '../../core/services/tax-engine.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { TaxAdvisorService } from '../../core/services/tax-advisor.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { SalesService } from '../../core/services/sales.service';
import { TaxCalculationResult, TaxMode } from '../../core/models/reflip.models';
import { MonthlyTaxReport } from '../../core/models/accounting.models';

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

  readonly spreadsheetIcon = FileSpreadsheet;
  readonly downloadIcon = Download;
  readonly printIcon = Printer;
  readonly calendarIcon = Calendar;
  readonly filterIcon = Filter;
  readonly checkIcon = CheckCircle2;
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

  readonly selectedYear = signal<number>(2026);
  readonly selectedPeriod = signal<string>('08'); // 'all', 'Q1'..'Q4', or '01'..'12'
  readonly selectedTaxMode = signal<TaxMode>('diff_25a');

  readonly invoiceModalItem = signal<TaxCalculationResult | null>(null);
  readonly isTaxAdvisorModalOpen = signal<boolean>(false);
  readonly emailSentStatus = signal<{ success: boolean; text: string } | null>(null);

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
    document.body.removeChild(link);
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
