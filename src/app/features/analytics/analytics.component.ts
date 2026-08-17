import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  BarChart3,
  TrendingUp,
  Coins,
  Percent,
  Clock,
  Store,
  Users,
  Package,
  Boxes,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
  Zap,
  Calendar,
  Layers,
} from 'lucide-angular';
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

@Component({
  selector: 'app-analytics',
  imports: [CurrencyPipe, LucideAngularModule],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent {
  readonly analyticsService = inject(AnalyticsService);
  readonly salesService = inject(SalesService);
  readonly purchaseService = inject(PurchaseService);
  readonly inventoryService = inject(InventoryService);

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

  readonly timeRange = signal<AnalyticsTimeRange>('30d');
  readonly activeSection = signal<
    'overview' | 'platforms' | 'velocity' | 'cohorts' | 'heatmap' | 'categories' | 'sources'
  >('overview');

  // Filtered sales based on selected time range
  readonly currentSales = computed(() => {
    return this.analyticsService.filterSalesByTimeRange(
      this.salesService.sales(),
      this.timeRange()
    );
  });

  // Overview Financials
  readonly totalRevenue = computed(() =>
    this.currentSales().reduce((sum, s) => sum + s.sale_price, 0)
  );

  readonly totalNetProfit = computed(() =>
    this.currentSales().reduce((sum, s) => sum + (s.net_profit || 0), 0)
  );

  readonly avgRoi = computed(() => {
    const list = this.currentSales();
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, s) => acc + (s.roi || 0), 0);
    return Number((sum / list.length).toFixed(1));
  });

  readonly avgHoldingDays = computed(() => {
    const list = this.currentSales();
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, s) => acc + (s.holding_duration_days || 0), 0);
    return Number((sum / list.length).toFixed(1));
  });

  // 1. Platform Performance
  readonly platformPerformance = computed<PlatformPerformance[]>(() =>
    this.analyticsService.computePlatformPerformance(this.currentSales())
  );

  // 2. Holding Duration & Speed Buckets
  readonly holdingDurationAnalysis = computed<HoldingDurationAnalysis>(() =>
    this.analyticsService.computeHoldingDurationAnalysis(this.currentSales())
  );

  // 3. Monthly Cohorts
  readonly monthlyCohorts = computed<MonthlyCohortStats[]>(() =>
    this.analyticsService.computeMonthlyCohorts(
      this.purchaseService.purchases(),
      this.salesService.sales()
    )
  );

  // 4. Sales Heatmap
  readonly salesHeatmap = computed<DayHeatmap[]>(() =>
    this.analyticsService.computeSalesHeatmap(this.salesService.sales())
  );

  // 5. Category Rankings
  readonly categoryRankings = computed<CategoryRank[]>(() =>
    this.analyticsService.computeCategoryRankings(
      this.inventoryService.items(),
      this.currentSales()
    )
  );

  // 6. Source Performance
  readonly sourcePerformance = computed<SourcePerformance[]>(() =>
    this.analyticsService.computeSourcePerformance(
      this.purchaseService.purchases(),
      this.currentSales()
    )
  );

  setTimeRange(range: AnalyticsTimeRange): void {
    this.timeRange.set(range);
  }

  setSection(section: any): void {
    this.activeSection.set(section);
  }
}
