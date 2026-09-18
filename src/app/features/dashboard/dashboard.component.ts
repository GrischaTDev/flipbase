import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  LucideArrowUpRight as ArrowUpRight,
  LucideCoins as Coins,
  LucideDynamicIcon,
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
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { DashboardKpiCardComponent } from './components/dashboard-kpi-card/dashboard-kpi-card.component';
import { DashboardOpenCostsComponent } from './components/dashboard-open-costs/dashboard-open-costs.component';
import { DashboardPreferencesService } from './services/dashboard-preferences.service';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const percent = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

interface RangeOption {
  readonly value: DashboardRange;
  readonly label: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    CurrencyPipe,
    DatePipe,
    ButtonComponent,
    CardComponent,
    LucideDynamicIcon,
    CustomSelectComponent,
    RevenueChartComponent,
    DashboardKpiCardComponent,
    DashboardOpenCostsComponent,
  ],
  templateUrl: './dashboard.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly reportService = inject(DashboardReportService);
  private readonly preferencesService = inject(DashboardPreferencesService);
  readonly salesService = inject(SalesService);

  readonly range = computed(() => this.preferencesService.preferences().range);
  readonly platform = computed(() => this.preferencesService.preferences().platform);
  readonly saveError = this.preferencesService.saveError;

  readonly rangeOptions: readonly RangeOption[] = [
    { value: 'today', label: 'Heute' },
    { value: 'last_7_days', label: '7 Tage' },
    { value: 'month', label: 'Dieser Monat' },
    { value: 'year', label: 'Dieses Jahr' },
  ];

  readonly platformSelectOptions = computed<readonly SelectOption<DashboardPlatform>[]>(() => {
    const selected = this.platform();
    const platforms = new Set(this.salesService.sales().map((sale) => sale.platform));
    if (selected !== 'all') platforms.add(selected);
    return [
      { value: 'all', label: 'Alle Plattformen' },
      ...[...platforms]
        .sort((a, b) => a.localeCompare(b, 'de'))
        .map((value) => ({ value, label: value })),
    ];
  });
  readonly report = computed(() => this.reportService.createReport(this.range(), this.platform()));

  readonly kpis = computed(() => {
    const report = this.report();
    const cashflow = report.purchasesIncluded ? report.revenue - report.totalExpenses : null;

    return {
      grossProfit: {
        value: euro.format(report.grossProfit),
        tone:
          report.grossProfit > 0
            ? ('positive' as const)
            : report.grossProfit < 0
              ? ('negative' as const)
              : ('default' as const),
      },
      revenue: {
        value: euro.format(report.revenue),
      },
      margin: {
        value:
          report.averageMarginPercent === null
            ? '–'
            : `${percent.format(report.averageMarginPercent)} %`,
      },
      cashflow: {
        value: cashflow === null ? '–' : euro.format(cashflow),
        tone:
          cashflow === null || cashflow === 0
            ? ('default' as const)
            : cashflow > 0
              ? ('positive' as const)
              : ('negative' as const),
      },
      expenses: {
        total: report.purchasesIncluded ? euro.format(report.totalExpenses) : '–',
        purchases: report.purchasesIncluded ? euro.format(report.purchaseSpend) : '–',
        selling: euro.format(report.sellingCosts),
        operating: report.purchasesIncluded
          ? euro.format(report.operatingExpenseSpend ?? 0)
          : '–',
      },
    };
  });

  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly arrowIcon = ArrowUpRight;

  setRange(range: DashboardRange): void {
    this.preferencesService.setRange(range);
  }

  setPlatform(platform: DashboardPlatform | null): void {
    this.preferencesService.setPlatform(platform ?? 'all');
  }
}
