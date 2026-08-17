import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
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
} from 'lucide-angular';
import { TaxEngineService } from '../../core/services/tax-engine.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { TaxCalculationResult, TaxMode } from '../../core/models/reflip.models';

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

  readonly selectedYear = signal<number>(2026);
  readonly selectedPeriod = signal<string>('all'); // 'all', 'Q1', 'Q2', 'Q3', 'Q4', or '01'..'12'
  readonly selectedTaxMode = signal<TaxMode>('diff_25a');

  readonly invoiceModalItem = signal<TaxCalculationResult | null>(null);

  readonly filteredTaxResults = computed<TaxCalculationResult[]>(() => {
    const results = this.taxEngine.allTaxCalculations();
    const year = this.selectedYear();
    const period = this.selectedPeriod();

    return results.filter((r) => {
      if (!r.sale_date) return true;
      const date = new Date(r.sale_date);
      if (date.getFullYear() !== year) return false;

      const month = date.getMonth() + 1; // 1..12
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

  onDownloadDatev(): void {
    const csv = this.taxEngine.generateDatevCsv(this.filteredTaxResults());
    this.downloadFile(csv, `DATEV_Export_${this.selectedYear()}_${this.selectedPeriod()}.csv`, 'text/csv;charset=utf-8;');
  }

  onDownloadEur(): void {
    const csv = this.taxEngine.generateEurCsv(this.filteredTaxResults());
    this.downloadFile(csv, `EUER_Bericht_${this.selectedYear()}_${this.selectedPeriod()}.csv`, 'text/csv;charset=utf-8;');
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
