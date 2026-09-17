import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  LucideArrowUpRight as ArrowUpRight,
  LucideBoxes as Boxes,
  LucideCoins as Coins,
  LucideDynamicIcon,
  LucideReceiptText as ReceiptText,
  LucideTrendingUp as TrendingUp,
  LucideWallet as Wallet,
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
import { kpiChange, KpiChangeFormat } from './models/kpi-change';
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
    const { comparison } = report;
    const change = (
      current: number | null,
      previous: number | null,
      colored: boolean,
      format: KpiChangeFormat = 'percent',
    ) => kpiChange({ current, previous, format, colored, comparisonLabel: comparison.label });
    const salesWithoutCost = report.salesWithoutCostCount;

    return {
      comparisonLabel: comparison.label,
      grossProfit: {
        value: euro.format(report.grossProfit),
        tone:
          report.grossProfit > 0
            ? ('positive' as const)
            : report.grossProfit < 0
              ? ('negative' as const)
              : ('default' as const),
        hint:
          salesWithoutCost > 0
            ? `davon ohne Kosten: ${euro.format(report.revenueWithoutCost)} Umsatz (${
                salesWithoutCost === 1 ? '1 Verkauf' : `${salesWithoutCost} Verkäufe`
              })`
            : 'Nur Verkäufe mit bekannten Kosten',
        change: change(report.grossProfit, comparison.grossProfit, true),
      },
      revenue: {
        value: euro.format(report.revenue),
        change: change(report.revenue, comparison.revenue, true),
      },
      expenses: {
        value: euro.format(report.totalExpenses),
        hint: report.purchasesIncluded
          ? `Einkäufe ${euro.format(report.purchaseSpend)} · Verkaufskosten ${euro.format(report.sellingCosts)}`
          : 'Nur Verkaufskosten dieser Plattform',
        change: change(report.totalExpenses, comparison.totalExpenses, false),
      },
      inventory: {
        value: euro.format(report.inventoryCostValue),
        hint:
          report.inventoryItemsWithoutCost > 0
            ? `${report.inventoryItemsWithoutCost} Artikel ohne Kosten`
            : 'Anschaffungswert aktuell vorhandener Ware',
      },
      soldItems: {
        value: String(report.soldItems),
        change: change(report.soldItems, comparison.soldItems, false),
      },
      margin: {
        value:
          report.averageMarginPercent === null
            ? '–'
            : `${percent.format(report.averageMarginPercent)} %`,
        change: change(
          report.averageMarginPercent,
          comparison.averageMarginPercent,
          false,
          'points',
        ),
      },
    };
  });

  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly receiptIcon = ReceiptText;
  readonly boxesIcon = Boxes;
  readonly walletIcon = Wallet;
  readonly arrowIcon = ArrowUpRight;

  setRange(range: DashboardRange): void {
    this.preferencesService.setRange(range);
  }

  setPlatform(platform: DashboardPlatform | null): void {
    this.preferencesService.setPlatform(platform ?? 'all');
  }
}
