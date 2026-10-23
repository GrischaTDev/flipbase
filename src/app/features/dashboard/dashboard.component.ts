import { SummaryMetricComponent } from '../../shared/components/summary-metric/summary-metric.component';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  LucideArrowRight,
  LucideChartNoAxesCombined,
  LucideCoins,
  LucideDynamicIcon,
  LucideHouse,
  LucidePackage,
  LucidePercent,
  LucideShoppingBag,
  LucideShoppingCart,
  LucideTag,
  type LucideIconInput,
} from '@lucide/angular';
import type { DashboardRange } from '../../core/models/flipbase.models';
import { DashboardReportService } from '../../core/services/dashboard-report.service';
import { ExpenseService } from '../../core/services/expense.service';
import { InventoryService } from '../../core/services/inventory.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { SalePlatformsService } from '../../core/services/sale-platforms.service';
import { SalesService } from '../../core/services/sales.service';
import { StockService } from '../../core/services/stock.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { MarketplacePlatformIdentityComponent } from '../../shared/components/marketplace-platform-identity/marketplace-platform-identity.component';
import { ModalShellComponent } from '../../shared/components/modal-shell/modal-shell.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { RevenueChartComponent } from '../../shared/components/revenue-chart/revenue-chart.component';
import { BetaDiscordBannerComponent } from '../beta-discord/components/beta-discord-banner/beta-discord-banner.component';
import { stockOverview } from './models/dashboard-overview';
import { kpiChange } from './models/kpi-change';
import { DashboardPreferencesService } from './services/dashboard-preferences.service';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const percent = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
interface OverviewMetric {
  readonly key: string;
  readonly label: string;
  readonly icon: LucideIconInput;
  readonly value: string;
  readonly help: string;
  readonly hint: string;
  readonly tone: 'neutral' | 'positive' | 'negative';
  readonly change: ReturnType<typeof kpiChange>;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    SummaryMetricComponent,
    CurrencyPipe,
    DatePipe,
    LucideDynamicIcon,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CustomSelectComponent,
    MarketplacePlatformIdentityComponent,
    ModalShellComponent,
    PageHeaderComponent,
    RevenueChartComponent,
    BetaDiscordBannerComponent,
  ],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly reports = inject(DashboardReportService);
  private readonly preferences = inject(DashboardPreferencesService);
  private readonly workspace = inject(WorkspaceService);
  private readonly inventory = inject(InventoryService);
  private readonly stockService = inject(StockService);
  private readonly purchases = inject(PurchaseService);
  private readonly expenses = inject(ExpenseService);
  readonly salesService = inject(SalesService);
  readonly salePlatforms = inject(SalePlatformsService);
  readonly range = computed(() => this.preferences.preferences().range);
  readonly platform = computed(() => this.preferences.preferences().platform);
  readonly saveError = this.preferences.saveError;
  readonly rangeOptions: readonly { value: DashboardRange; label: string }[] = [
    { value: 'today', label: 'Heute' },
    { value: 'last_7_days', label: '7 Tage' },
    { value: 'month', label: 'Dieser Monat' },
    { value: 'year', label: 'Dieses Jahr' },
  ];
  readonly platformSelectOptions = computed(() => {
    const options = [...this.salePlatforms.options()];
    const selected = this.platform();
    if (selected !== 'all' && !options.some((option) => option.value === selected))
      options.push({ value: selected, label: this.salePlatforms.label(selected) });
    return [{ value: 'all', label: 'Alle Plattformen' }, ...options];
  });
  readonly report = computed(() => this.reports.createReport(this.range(), this.platform()));
  readonly loadError = computed(
    () =>
      this.salesService.loadError() ||
      this.inventory.loadError() ||
      this.stockService.loadError() ||
      this.purchases.loadError() ||
      this.expenses.loadError(),
  );
  readonly ready = computed(() => {
    const id = this.workspace.currentWorkspace()?.id;
    return (
      !!id &&
      !this.loadError() &&
      !this.expenses.isLoading() &&
      [this.salesService, this.inventory, this.stockService, this.purchases].every(
        (source) => !source.isLoading() && source.loadedWorkspaceId() === id,
      )
    );
  });
  readonly stock = computed(() => {
    const id = this.workspace.currentWorkspace()?.id;
    return stockOverview(
      this.inventory.items().filter((item) => item.workspace_id === id),
      this.stockService.lots().filter((lot) => lot.workspace_id === id),
    );
  });
  readonly stockAges = computed(() =>
    [
      { label: 'Bis 30 Tage', units: this.stock().young },
      { label: '31–60 Tage', units: this.stock().middle },
      { label: '61–90 Tage', units: this.stock().slow },
      { label: 'Über 90 Tage', units: this.stock().old },
    ].map((entry) => ({
      ...entry,
      share: this.stock().units ? (entry.units / this.stock().units) * 100 : 0,
    })),
  );
  readonly recentSales = computed(() => this.report().rows.slice(0, 3));
  readonly comparisonLabel = computed(
    () =>
      ({
        today: 'zu gestern',
        last_7_days: 'zur Vorwoche',
        month: 'zum Vormonat',
        year: 'zum Vorjahr',
      })[this.range()],
  );
  readonly metrics = computed<readonly OverviewMetric[]>(() => {
    const report = this.report();
    const missing = report.salesWithoutCostCount > 0;
    const change = (
      current: number | null,
      previous: number | null,
      format: 'percent' | 'points',
    ) =>
      this.ready() && !missing && previous !== null && (format === 'points' || previous !== 0)
        ? kpiChange({
            current,
            previous,
            format,
            comparisonLabel: report.comparison.label,
            colored: true,
          })
        : null;
    const metric = (
      key: string,
      label: string,
      icon: LucideIconInput,
      value: string,
      help: string,
      hint = '',
      comparison: ReturnType<typeof kpiChange> = null,
      tone: OverviewMetric['tone'] = 'neutral',
    ): OverviewMetric => ({
      key,
      label,
      icon,
      value: this.ready() ? value : '–',
      help,
      hint: this.ready() ? hint : this.loadError() ? 'Nicht verfügbar' : 'Wird geladen …',
      change: comparison,
      tone,
    });
    return [
      metric(
        'revenue',
        'Umsatz',
        LucideCoins,
        euro.format(report.revenue),
        'Umsatz bestätigter Verkäufe im gewählten Zeitraum inklusive Versanderlösen und dokumentierter Erstattungen.',
        '',
        change(report.revenue, report.comparison.revenue, 'percent'),
      ),
      metric(
        'gross-profit',
        'Gewinn',
        LucideChartNoAxesCombined,
        euro.format(report.grossProfit),
        'Ergebnis nach Wareneinsatz und direkten Verkaufskosten. Betriebsausgaben und Steuern sind nicht abgezogen. Verkäufe mit unbekannten Kosten bleiben unberücksichtigt.',
        missing ? 'Kosten teilweise offen' : '',
        change(report.grossProfit, report.comparison.grossProfit, 'percent'),
        report.grossProfit < 0 ? 'negative' : 'neutral',
      ),
      metric(
        'margin',
        'Marge',
        LucidePercent,
        report.averageMarginPercent === null
          ? '–'
          : `${percent.format(report.averageMarginPercent)} %`,
        'Umsatzgewichtete Marge der Verkäufe mit bekannten Kosten. Veränderungen in Prozentpunkten.',
        '',
        change(report.averageMarginPercent, report.comparison.averageMarginPercent, 'points'),
      ),
      metric(
        'sales',
        'Verkäufe',
        LucideShoppingCart,
        String(report.rows.length),
        'Anzahl bestätigter Verkäufe, nicht die Stückzahl.',
      ),
    ];
  });
  readonly quickActions = [
    { label: 'Einkauf erfassen', link: '/purchases/new', icon: LucideShoppingBag },
    { label: 'Verkauf erfassen', link: '/sales/new', icon: LucideShoppingCart },
  ];
  readonly listingDialogOpen = signal(false);
  readonly listingPlatforms = ['vinted', 'ebay', 'kleinanzeigen'] as const;
  readonly overviewIcon = LucideHouse;
  readonly packageIcon = LucidePackage;
  readonly listingIcon = LucideTag;
  readonly viewAllIcon = LucideArrowRight;

  constructor() {
    effect(() => {
      const id = this.workspace.currentWorkspace()?.id;
      untracked(() => {
        if (id && this.stockService.loadedWorkspaceId() !== id)
          void this.stockService.loadPositions(id);
        if (id) void this.expenses.ensureCurrentWorkspaceLoaded();
      });
    });
  }
  setRange(range: DashboardRange): void {
    this.preferences.setRange(range);
  }
  setPlatform(platform: string | null): void {
    this.preferences.setPlatform(platform ?? 'all');
  }
  reload(): void {
    const id = this.workspace.currentWorkspace()?.id;
    if (!id) return;
    void Promise.allSettled([
      this.inventory.loadInventory(id),
      this.stockService.loadPositions(id),
      this.salesService.loadSales(id),
      this.purchases.loadPurchases(id),
      this.expenses.load(),
      this.salePlatforms.reload(),
    ]);
  }
}
