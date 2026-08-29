import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import {
  LucideDynamicIcon,
  LucideBarChart3 as BarChart3,
  LucideTrendingUp as TrendingUp,
  LucideCoins as Coins,
  LucidePercent as Percent,
  LucideClock as Clock,
  LucideStore as Store,
  LucideUsers as Users,
  LucidePackage as Package,
  LucideBoxes as Boxes,
  LucideTrophy as Trophy,
  LucideAlertTriangle as AlertTriangle,
  LucideCheckCircle2 as CheckCircle2,
  LucideSparkles as Sparkles,
  LucideArrowUpRight as ArrowUpRight,
  LucideZap as Zap,
  LucideCalendar as Calendar,
  LucideLayers as Layers,
  LucideBuilding as Building,
  LucideArrowRight as ArrowRight,
  LucideTag as Tag,
  LucideSun as Sun,
  LucideSunrise as Sunrise,
  LucideMoon as Moon,
} from '@lucide/angular';
import {
  AnalyticsService,
  AnalyticsTimeRange,
  PlatformPerformance,
  HoldingDurationAnalysis,
  MonthlyCohortStats,
  DayHeatmap,
  CategoryRank,
  SourcePerformance,
} from '../../core/services/analytics.service';
import { SalesService } from '../../core/services/sales.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { InventoryService } from '../../core/services/inventory.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ConsolidatedHoldingSummary } from '../../core/models/flipbase.models';

type AnalyticsSection =
  | 'overview'
  | 'cohorts'
  | 'platforms'
  | 'velocity'
  | 'heatmap'
  | 'sources'
  | 'categories'
  | 'speed'
  | 'holding';

@Component({
  selector: 'app-analytics',
  imports: [CurrencyPipe, LucideDynamicIcon],
  templateUrl: './analytics.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent {
  readonly analyticsService = inject(AnalyticsService);
  readonly salesService = inject(SalesService);
  readonly purchaseService = inject(PurchaseService);
  readonly inventoryService = inject(InventoryService);
  readonly workspaceService = inject(WorkspaceService);

  readonly barIcon = BarChart3;
  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly percentIcon = Percent;
  readonly clockIcon = Clock;
  readonly storeIcon = Store;
  readonly usersIcon = Users;
  readonly packageIcon = Package;
  readonly boxesIcon = Boxes;
  readonly trophyIcon = Trophy;
  readonly alertIcon = AlertTriangle;
  readonly checkIcon = CheckCircle2;
  readonly sparklesIcon = Sparkles;
  readonly arrowIcon = ArrowUpRight;
  readonly zapIcon = Zap;
  readonly calendarIcon = Calendar;
  readonly layersIcon = Layers;
  readonly buildingIcon = Building;
  readonly nextIcon = ArrowRight;
  readonly tagIcon = Tag;
  readonly sunIcon = Sun;
  readonly sunriseIcon = Sunrise;
  readonly moonIcon = Moon;

  readonly timeRange = signal<AnalyticsTimeRange>('30d');
  readonly activeSection = signal<AnalyticsSection>('overview');

  readonly isHoldingMode = signal<boolean>(false);

  readonly currentSales = computed(() => {
    // Zurueckgegebene Verkaeufe fliessen in keine Auswertung ein - der Artikel
    // ist wieder im Lager, der Gewinn also nicht realisiert.
    const list = this.salesService.sales().filter((s) => !s.returned_at);
    const range = this.timeRange();
    if (range === 'all') return list;

    const now = new Date();
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 365;
    const cutoff = new Date(now.getTime() - days * 86400000);

    return list.filter((s) => new Date(s.sale_date) >= cutoff);
  });

  // KPI Computations
  readonly totalSalesVolume = computed<number>(() => {
    return this.currentSales().reduce((acc, s) => acc + (s.sale_price || 0), 0);
  });

  readonly totalRevenue = computed<number>(() => {
    return this.totalSalesVolume();
  });

  readonly totalNetProfit = computed<number>(() => {
    return this.currentSales().reduce((acc, s) => acc + (s.net_profit || 0), 0);
  });

  readonly averageRoi = computed<number>(() => {
    const list = this.currentSales();
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, s) => acc + (s.roi || 0), 0);
    return Number((sum / list.length).toFixed(1));
  });

  readonly avgRoi = computed<number>(() => this.averageRoi());

  readonly averageHoldingDays = computed<number>(() => {
    const list = this.currentSales();
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, s) => acc + (s.holding_duration_days || 0), 0);
    return Number((sum / list.length).toFixed(1));
  });

  readonly avgHoldingDays = computed<number>(() => this.averageHoldingDays());

  // Holding Multi-Workspace Consolidation
  readonly holdingSummary = computed<ConsolidatedHoldingSummary>(() => {
    return this.workspaceService.getConsolidatedHoldingSummary(
      this.salesService.sales(),
      this.purchaseService.purchases(),
      this.inventoryService.items(),
    );
  });

  // 1. Platform Performance
  readonly platformPerformance = computed<PlatformPerformance[]>(() =>
    this.analyticsService.computePlatformPerformance(this.currentSales()),
  );

  // 2. Holding Duration & Speed Buckets
  readonly holdingDurationAnalysis = computed<HoldingDurationAnalysis>(() =>
    this.analyticsService.computeHoldingDurationAnalysis(this.currentSales()),
  );

  // 3. Monthly Cohorts
  readonly monthlyCohorts = computed<MonthlyCohortStats[]>(() =>
    this.analyticsService.computeMonthlyCohorts(
      this.purchaseService.purchases(),
      this.salesService.sales(),
    ),
  );

  // 4. Sales Heatmap
  readonly salesHeatmap = computed<DayHeatmap[]>(() =>
    this.analyticsService.computeSalesHeatmap(this.salesService.sales()),
  );

  // 5. Category Rankings
  readonly categoryRankings = computed<CategoryRank[]>(() =>
    this.analyticsService.computeCategoryRankings(
      this.inventoryService.items(),
      this.currentSales(),
    ),
  );

  // 6. Source Performance
  readonly sourcePerformance = computed<SourcePerformance[]>(() =>
    this.analyticsService.computeSourcePerformance(
      this.purchaseService.purchases(),
      this.currentSales(),
    ),
  );

  setTimeRange(range: AnalyticsTimeRange): void {
    this.timeRange.set(range);
  }

  setSection(section: AnalyticsSection): void {
    this.activeSection.set(section);
  }

  switchToWorkspace(wsId: string): void {
    this.workspaceService.switchWorkspace(wsId);
  }
}
