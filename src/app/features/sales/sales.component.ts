import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  TrendingUp,
  Coins,
  DollarSign,
  Calendar,
  Plus,
  Trash2,
  Tag,
  Clock,
  ArrowUpRight,
  Sparkles,
} from 'lucide-angular';
import { SalesService } from '../../core/services/sales.service';
import { SaleCreateModalComponent } from './components/sale-create-modal/sale-create-modal.component';
import { Sale } from '../../core/models/reflip.models';

@Component({
  selector: 'app-sales',
  imports: [
    RouterLink,
    CurrencyPipe,
    DatePipe,
    TranslatePipe,
    LucideAngularModule,
    SaleCreateModalComponent,
  ],
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesComponent {
  readonly salesService = inject(SalesService);

  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly dollarIcon = DollarSign;
  readonly calendarIcon = Calendar;
  readonly plusIcon = Plus;
  readonly trashIcon = Trash2;
  readonly tagIcon = Tag;
  readonly clockIcon = Clock;
  readonly arrowIcon = ArrowUpRight;
  readonly sparklesIcon = Sparkles;

  readonly isCreateModalOpen = signal<boolean>(false);
  readonly selectedPlatform = signal<string>('all');

  readonly filteredSales = computed(() => {
    const list = this.salesService.sales();
    const plat = this.selectedPlatform();
    if (plat === 'all') return list;
    return list.filter((s) => s.platform === plat);
  });

  // KPI Calculations (Kapitel 26 & 27)
  readonly totalRealizedProfit = computed(() => {
    return this.salesService.sales().reduce((sum, s) => sum + (s.net_profit || 0), 0);
  });

  readonly totalRevenue = computed(() => {
    return this.salesService.sales().reduce((sum, s) => sum + (s.sale_price || 0), 0);
  });

  readonly averageRoi = computed(() => {
    const list = this.salesService.sales();
    if (list.length === 0) return 0;
    const totalRoi = list.reduce((sum, s) => sum + (s.roi || 0), 0);
    return Number((totalRoi / list.length).toFixed(1));
  });

  readonly averageHoldingDays = computed(() => {
    const list = this.salesService.sales();
    if (list.length === 0) return 0;
    const totalDays = list.reduce((sum, s) => sum + (s.holding_duration_days || 0), 0);
    return Math.round(totalDays / list.length);
  });

  openCreateModal(): void {
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  async onDeleteSale(sale: Sale): Promise<void> {
    if (confirm('Möchtest du diesen Verkauf wirklich stornieren? Der Artikel wird wieder auf "verkaufsbereit" zurückgesetzt.')) {
      await this.salesService.deleteSale(sale.id, sale.inventory_item_id);
    }
  }
}
