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
  FileText,
} from 'lucide-angular';
import { SalesService } from '../../core/services/sales.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { SaleCreateModalComponent } from './components/sale-create-modal/sale-create-modal.component';
import { InvoiceModalComponent } from '../../shared/components/invoice-modal/invoice-modal.component';
import { Sale } from '../../core/models/reflip.models';
import { Invoice } from '../../core/models/invoice.models';

@Component({
  selector: 'app-sales',
  imports: [
    RouterLink,
    CurrencyPipe,
    DatePipe,
    TranslatePipe,
    LucideAngularModule,
    SaleCreateModalComponent,
    InvoiceModalComponent,
  ],
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesComponent {
  readonly salesService = inject(SalesService);
  readonly invoiceService = inject(InvoiceService);

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
  readonly fileIcon = FileText;

  readonly isCreateModalOpen = signal<boolean>(false);
  readonly selectedPlatform = signal<string>('all');
  readonly activeInvoice = signal<Invoice | null>(null);

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

  openInvoiceForSale(sale: Sale): void {
    const inv = this.invoiceService.generateInvoiceForSale(sale, sale.inventory_item);
    this.activeInvoice.set(inv);
  }

  closeInvoice(): void {
    this.activeInvoice.set(null);
  }

  async onDeleteSale(sale: Sale): Promise<void> {
    if (confirm('Möchtest du diesen Verkauf wirklich stornieren? Der Artikel wird wieder auf "verkaufsbereit" zurückgesetzt.')) {
      await this.salesService.deleteSale(sale.id, sale.inventory_item_id);
    }
  }
}
