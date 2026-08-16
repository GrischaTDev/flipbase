import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  TrendingUp,
  Coins,
  Boxes,
  Percent,
  PlusCircle,
  Search,
  Calculator,
  ArrowUpRight,
  Lightbulb,
} from 'lucide-angular';
import { WorkspaceService } from '../../core/services/workspace.service';
import { DashboardMetrics } from '../../core/models/reflip.models';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, CurrencyPipe, TranslatePipe, LucideAngularModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly workspaceService = inject(WorkspaceService);

  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly boxesIcon = Boxes;
  readonly percentIcon = Percent;
  readonly plusIcon = PlusCircle;
  readonly searchIcon = Search;
  readonly calcIcon = Calculator;
  readonly arrowIcon = ArrowUpRight;
  readonly lightbulbIcon = Lightbulb;

  // Initial KPIs
  readonly metrics = signal<DashboardMetrics>({
    realized_profit: 0,
    total_revenue: 0,
    tied_capital: 0,
    inventory_value: 0,
    active_items_count: 0,
    average_roi_percent: 0,
  });
}
