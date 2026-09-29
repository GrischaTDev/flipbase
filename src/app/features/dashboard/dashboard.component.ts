import { CurrencyPipe, DatePipe, DecimalPipe, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import {
  LucideArrowRight,
  LucideArrowUpRight,
  LucideChartNoAxesCombined,
  LucideCheck,
  LucideChartNoAxesColumnIncreasing,
  LucideStore,
  LucideTrendingUp,
  LucideCoins,
  LucideDynamicIcon,
  LucideImage,
  LucidePackage,
  LucidePercent,
  LucideShoppingBag,
  LucideShoppingCart,
  LucideTag,
  LucideTriangleAlert,
  type LucideIconInput,
} from '@lucide/angular';
import { DashboardRange } from '../../core/models/flipbase.models';
import { DashboardReportService } from '../../core/services/dashboard-report.service';
import { ExpenseService } from '../../core/services/expense.service';
import { InventoryService } from '../../core/services/inventory.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { SalesService } from '../../core/services/sales.service';
import { StockService } from '../../core/services/stock.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { RevenueChartComponent } from '../../shared/components/revenue-chart/revenue-chart.component';
import { BetaDiscordBannerComponent } from '../beta-discord/components/beta-discord-banner/beta-discord-banner.component';
import {
  platformDistribution,
  platformLabel,
  salesVolumes,
  sparklinePath,
  stockOverview,
} from './models/dashboard-overview';
import { dashboardPlatformAppearance } from './models/dashboard-platform';
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
  readonly path: string;
  readonly tone: 'neutral' | 'positive' | 'negative';
  readonly change: ReturnType<typeof kpiChange>;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    NgOptimizedImage,
    LucideDynamicIcon,
    ButtonComponent,
    BadgeComponent,
    CardComponent,
    CustomSelectComponent,
    RevenueChartComponent,
    BetaDiscordBannerComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
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

  readonly range = computed(() => this.preferences.preferences().range);
  readonly platform = computed(() => this.preferences.preferences().platform);
  readonly saveError = this.preferences.saveError;
  readonly rangeOptions: readonly { value: DashboardRange; label: string }[] = [
    { value: 'today', label: 'Heute' },
    { value: 'last_7_days', label: '7 Tage' },
    { value: 'month', label: 'Dieser Monat' },
    { value: 'year', label: 'Dieses Jahr' },
  ];
  readonly platformName = platformLabel;
  readonly platformAppearance = dashboardPlatformAppearance;
  readonly platformSelectOptions = computed(() => {
    const platforms = new Set(this.salesService.sales().map((sale) => sale.platform));
    if (this.platform() !== 'all') platforms.add(this.platform());
    return [
      { value: 'all', label: 'Alle Plattformen' },
      ...[...platforms]
        .sort((a, b) => a.localeCompare(b, 'de'))
        .map((value) => ({ value, label: platformLabel(value) })),
    ];
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
  readonly averageCost = computed(() => {
    const knownUnits = this.stock().units - this.report().inventoryItemsWithoutCost;
    return knownUnits > 0 ? this.report().inventoryCostValue / knownUnits : null;
  });
  readonly recentSales = computed(() => this.report().rows.slice(0, 5));
  readonly distribution = computed(() => platformDistribution(this.report().rows));
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
    const tone = (value: number): OverviewMetric['tone'] =>
      value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
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
      hint: string,
      values: readonly (number | null)[],
      valueTone: OverviewMetric['tone'] = 'neutral',
      comparison: ReturnType<typeof kpiChange> = null,
    ): OverviewMetric => ({
      key,
      label,
      icon,
      value: this.ready() ? value : '–',
      help,
      hint: this.ready() ? hint : this.loadError() ? 'Nicht verfügbar' : 'Wird geladen …',
      path: this.ready() ? sparklinePath(values) : '',
      tone: valueTone,
      change: comparison,
    });
    return [
      metric(
        'revenue',
        'Umsatz',
        LucideCoins,
        euro.format(report.revenue),
        'Umsatz der bestätigten Verkäufe im gewählten Zeitraum, inklusive Versanderlösen und dokumentierter Erstattungen.',
        '',
        report.points.map((point) => point.revenue),
        'neutral',
        change(report.revenue, report.comparison.revenue, 'percent'),
      ),
      metric(
        'gross-profit',
        'Gewinn',
        LucideChartNoAxesCombined,
        euro.format(report.grossProfit),
        'Ergebnis nach Wareneinsatz und direkten Verkaufskosten. Betriebsausgaben und Steuern sind nicht abgezogen. Verkäufe mit unbekannten Kosten bleiben unberücksichtigt.',
        missing ? 'Kosten teilweise offen' : '',
        report.points.map((point) => point.resultAfterDirectCosts),
        tone(report.grossProfit),
        change(report.grossProfit, report.comparison.grossProfit, 'percent'),
      ),
      metric(
        'margin',
        'Marge',
        LucidePercent,
        report.averageMarginPercent === null
          ? '–'
          : `${percent.format(report.averageMarginPercent)} %`,
        'Umsatzgewichtete Marge der Verkäufe mit bekannten Kosten. Veränderungen werden in Prozentpunkten angegeben.',
        '',
        report.points.map((point) =>
          point.resultAfterDirectCosts !== null && point.revenue > 0
            ? (point.resultAfterDirectCosts / point.revenue) * 100
            : null,
        ),
        'neutral',
        change(report.averageMarginPercent, report.comparison.averageMarginPercent, 'points'),
      ),
      metric(
        'inventory-capital',
        'Kapital im Bestand',
        LucidePackage,
        euro.format(report.inventoryCostValue),
        'Aktueller Anschaffungswert mit bekannten Kosten. Unabhängig von Zeitraum und Verkaufsplattform. Es liegen keine historischen Bestandssnapshots vor.',
        report.inventoryItemsWithoutCost > 0
          ? 'Kosten teilweise offen · aktuell'
          : `${this.stock().units} Stück · aktueller Bestand`,
        [],
      ),
      metric(
        'sales',
        'Verkäufe',
        LucideShoppingCart,
        String(report.rows.length),
        'Anzahl bestätigter Verkäufe, nicht die Stückzahl. Die Kurve zeigt Verkäufe je Zeitabschnitt.',
        `${report.soldItems} Stück verkauft`,
        salesVolumes(report.points, report.rows, this.range() === 'year'),
      ),
    ];
  });
  readonly tasks = computed(() => {
    if (!this.ready()) return [];
    const report = this.report();
    const tasks: { key: string; label: string; link: string; icon: LucideIconInput }[] = [];
    if (report.openCosts.length > 0) {
      const count = report.openCosts.length;
      tasks.push({
        key: 'purchases',
        label: `${count} ${count === 1 ? 'Einkauf' : 'Einkäufe'} mit fehlenden Kostenangaben`,
        link: '/purchases',
        icon: LucideTriangleAlert,
      });
    } else if (report.inventoryItemsWithoutCost > 0) {
      tasks.push({
        key: 'stock',
        label: `${report.inventoryItemsWithoutCost} Artikel ohne Kostenangabe`,
        link: '/catalog',
        icon: LucidePackage,
      });
    }
    if (report.salesWithoutPurchase > 0) {
      const count = report.salesWithoutPurchase;
      tasks.push({
        key: 'sales',
        label: `${count} ${count === 1 ? 'Verkauf' : 'Verkäufe'} ohne nachvollziehbare Kosten`,
        link: '/sales',
        icon: LucideTriangleAlert,
      });
    }
    return tasks;
  });
  readonly quickActions = [
    {
      label: 'Einkauf erfassen',
      hint: 'Neue Ware einbuchen',
      link: '/purchases/new',
      icon: LucideShoppingBag,
    },
    {
      label: 'Verkauf erfassen',
      hint: 'Artikel als verkauft erfassen',
      link: '/sales/new',
      icon: LucideTag,
    },
    {
      label: 'Inserat erstellen',
      hint: 'Angebot vorbereiten',
      link: '/listings/new',
      icon: LucidePackage,
    },
    {
      label: 'Bilder optimieren',
      hint: 'Produktbilder bearbeiten',
      link: '/image-optimizer',
      icon: LucideImage,
    },
  ];
  readonly arrowIcon = LucideArrowUpRight;
  readonly viewAllIcon = LucideArrowRight;
  readonly packageIcon = LucidePackage;
  readonly stockTrendIcon = LucideTrendingUp;
  readonly stockValueIcon = LucideTag;
  readonly stockAgeIcon = LucideChartNoAxesColumnIncreasing;
  readonly stockAlertIcon = LucideTriangleAlert;
  readonly salesIcon = LucideShoppingCart;
  readonly storeIcon = LucideStore;
  readonly checkIcon = LucideCheck;

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
    ]);
  }
}
