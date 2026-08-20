import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideTrendingUp as TrendingUp,
  LucideCoins as Coins,
  LucideBoxes as Boxes,
  LucidePercent as Percent,
  LucidePlusCircle as PlusCircle,
  LucideSearch as Search,
  LucideCalculator as Calculator,
  LucideArrowUpRight as ArrowUpRight,
  LucideLightbulb as Lightbulb,
  LucideShoppingBag as ShoppingBag,
  LucideClock as Clock,
} from '@lucide/angular';
import { WorkspaceService } from '../../core/services/workspace.service';
import { SalesService } from '../../core/services/sales.service';
import { InventoryService } from '../../core/services/inventory.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { DashboardMetrics } from '../../core/models/reflip.models';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, CurrencyPipe, DatePipe, TranslatePipe, LucideDynamicIcon],
  templateUrl: './dashboard.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly workspaceService = inject(WorkspaceService);
  readonly salesService = inject(SalesService);
  readonly inventoryService = inject(InventoryService);
  readonly purchaseService = inject(PurchaseService);

  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly boxesIcon = Boxes;
  readonly percentIcon = Percent;
  readonly plusIcon = PlusCircle;
  readonly searchIcon = Search;
  readonly calcIcon = Calculator;
  readonly arrowIcon = ArrowUpRight;
  readonly lightbulbIcon = Lightbulb;
  readonly bagIcon = ShoppingBag;
  readonly clockIcon = Clock;

  // Real-time computed dashboard metrics (Kapitel 27)
  readonly metrics = computed<DashboardMetrics>(() => {
    const sales = this.salesService.sales();
    const items = this.inventoryService.items();

    const realizedProfit = sales.reduce((sum, s) => sum + (s.net_profit || 0), 0);
    const totalRevenue = sales.reduce((sum, s) => sum + (s.sale_price || 0), 0);

    const activeItems = items.filter((i) => i.status !== 'sold' && i.status !== 'archived');
    const tiedCapital = activeItems.reduce(
      (sum, i) => sum + (i.total_item_cost ?? i.allocated_purchase_cost),
      0,
    );
    const inventoryValue = activeItems.reduce((sum, i) => sum + (Number(i.expected_value) || 0), 0);

    const totalRoi = sales.reduce((sum, s) => sum + (s.roi || 0), 0);
    const avgRoi = sales.length > 0 ? Number((totalRoi / sales.length).toFixed(1)) : 0;

    return {
      realized_profit: Number(realizedProfit.toFixed(2)),
      total_revenue: Number(totalRevenue.toFixed(2)),
      tied_capital: Number(tiedCapital.toFixed(2)),
      inventory_value: Number(inventoryValue.toFixed(2)),
      active_items_count: activeItems.length,
      average_roi_percent: avgRoi,
    };
  });
}
