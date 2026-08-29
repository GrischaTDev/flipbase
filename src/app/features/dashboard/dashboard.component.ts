import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowUpRight as ArrowUpRight,
  LucideBoxes as Boxes,
  LucideCoins as Coins,
  LucideDynamicIcon,
  LucideReceiptText as ReceiptText,
  LucideTrendingUp as TrendingUp,
} from '@lucide/angular';
import { DashboardRange } from '../../core/models/flipbase.models';
import {
  DashboardPlatform,
  DashboardReportService,
} from '../../core/services/dashboard-report.service';
import { SalesService } from '../../core/services/sales.service';
import { RevenueChartComponent } from '../../shared/components/revenue-chart/revenue-chart.component';

interface RangeOption {
  readonly value: DashboardRange;
  readonly label: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [CurrencyPipe, DatePipe, RouterLink, LucideDynamicIcon, RevenueChartComponent],
  templateUrl: './dashboard.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly reportService = inject(DashboardReportService);
  readonly salesService = inject(SalesService);

  readonly range = signal<DashboardRange>('month');
  readonly platform = signal<DashboardPlatform>('all');

  readonly rangeOptions: readonly RangeOption[] = [
    { value: 'today', label: 'Heute' },
    { value: 'last_7_days', label: '7 Tage' },
    { value: 'month', label: 'Monat' },
    { value: 'year', label: 'Jahr' },
  ];

  readonly platformOptions = computed(() =>
    [...new Set(this.salesService.sales().map((sale) => sale.platform))].sort((a, b) =>
      a.localeCompare(b, 'de'),
    ),
  );
  readonly report = computed(() => this.reportService.createReport(this.range(), this.platform()));

  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly receiptIcon = ReceiptText;
  readonly boxesIcon = Boxes;
  readonly arrowIcon = ArrowUpRight;

  setRange(range: DashboardRange): void {
    this.range.set(range);
  }

  setPlatform(platform: string): void {
    this.platform.set(platform || 'all');
  }
}
