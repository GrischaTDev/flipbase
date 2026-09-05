import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
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
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { RevenueChartComponent } from '../../shared/components/revenue-chart/revenue-chart.component';

interface RangeOption {
  readonly value: DashboardRange;
  readonly label: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    LucideDynamicIcon,
    CustomSelectComponent,
    RevenueChartComponent,
  ],
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
    { value: 'month', label: 'Dieser Monat' },
    { value: 'year', label: 'Dieses Jahr' },
  ];

  readonly platformSelectOptions = computed<readonly SelectOption<DashboardPlatform>[]>(() => [
    { value: 'all', label: 'Alle Plattformen' },
    ...[...new Set(this.salesService.sales().map((sale) => sale.platform))]
      .sort((a, b) => a.localeCompare(b, 'de'))
      .map((value) => ({ value, label: value })),
  ]);
  readonly report = computed(() => this.reportService.createReport(this.range(), this.platform()));

  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly receiptIcon = ReceiptText;
  readonly boxesIcon = Boxes;
  readonly arrowIcon = ArrowUpRight;

  constructor() {
    effect(() => {
      const current = this.platform();
      if (!this.platformSelectOptions().some((option) => option.value === current)) {
        this.platform.set('all');
      }
    });
  }

  setRange(range: DashboardRange): void {
    this.range.set(range);
  }

  setPlatform(platform: DashboardPlatform | null): void {
    this.platform.set(platform ?? 'all');
  }
}
