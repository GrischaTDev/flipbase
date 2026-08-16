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
} from 'lucide-angular';
import { AnalyticsService, AnalyticsTimeRange } from '../../core/services/analytics.service';
import { SalesService } from '../../core/services/sales.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { InventoryService } from '../../core/services/inventory.service';

@Component({
  selector: 'app-analytics',
  imports: [CurrencyPipe, TranslatePipe, LucideAngularModule],
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

  readonly timeRange = signal<AnalyticsTimeRange>('30d');
  readonly activeSection = signal<'overview' | 'sources' | 'pallets' | 'categories'>('overview');

  // Filtered sales based on selected time range
  readonly currentSales = computed(() => {
    return this.analyticsService.filterSalesByTimeRange(
      this.salesService.sales(),
      this.timeRange()
    );
  });

  // KPI Computations for the selected timeframe
  readonly periodProfit = computed(() => {
    return this.currentSales().reduce((sum, s) => sum + (s.net_profit || 0), 0);
  });

  readonly periodRevenue = computed(() => {
    return this.currentSales().reduce((sum, s) => sum + (s.sale_price || 0), 0);
  });

  readonly periodAvgRoi = computed(() => {
    const list = this.currentSales();
    if (list.length === 0) return 0;
    const total = list.reduce((sum, s) => sum + (s.roi || 0), 0);
    return Number((total / list.length).toFixed(1));
  });

  readonly periodAvgHoldingDays = computed(() => {
    const list = this.currentSales();
    if (list.length === 0) return 0;
    const total = list.reduce((sum, s) => sum + (s.holding_duration_days || 0), 0);
    return Math.round(total / list.length);
  });

  readonly sellThroughRate = computed(() => {
    const totalItems = this.inventoryService.items().length;
    const soldItems = this.inventoryService.items().filter((i) => i.status === 'sold').length;
    return this.analyticsService.calculateSellThroughRate(totalItems, soldItems);
  });

  // Source & Supplier Intelligence
  readonly sourceStats = computed(() => {
    return this.analyticsService.computeSourcePerformance(
      this.purchaseService.purchases(),
      this.salesService.sales()
    );
  });

  readonly supplierStats = computed(() => {
    return this.analyticsService.computeSupplierPerformance(
      this.purchaseService.purchases(),
      this.inventoryService.items(),
      this.salesService.sales()
    );
  });

  // Mystery Pack & Pallet Dashboards
  readonly mysteryPackStats = computed(() => {
    return this.analyticsService.computeMysteryPackStats(
      this.purchaseService.purchases(),
      this.inventoryService.items(),
      this.salesService.sales()
    );
  });

  readonly palletStats = computed(() => {
    return this.analyticsService.computePalletStats(
      this.purchaseService.purchases(),
      this.inventoryService.items(),
      this.salesService.sales()
    );
  });

  // Category Rankings
  readonly categoryRankings = computed(() => {
    return this.analyticsService.computeCategoryRankings(
      this.inventoryService.items(),
      this.salesService.sales()
    );
  });
}
