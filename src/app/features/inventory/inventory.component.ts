import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  Boxes,
  Plus,
  Filter,
  Search,
  Tag,
  Eye,
  ArrowRight,
  TrendingUp,
  Coins,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-angular';
import { InventoryService } from '../../core/services/inventory.service';
import { ItemCreateModalComponent } from './components/item-create-modal/item-create-modal.component';
import { ItemCondition, ItemStatus } from '../../core/models/reflip.models';

@Component({
  selector: 'app-inventory',
  imports: [
    RouterLink,
    CurrencyPipe,
    TranslatePipe,
    LucideAngularModule,
    ItemCreateModalComponent,
  ],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryComponent {
  readonly inventoryService = inject(InventoryService);

  readonly boxesIcon = Boxes;
  readonly plusIcon = Plus;
  readonly filterIcon = Filter;
  readonly searchIcon = Search;
  readonly tagIcon = Tag;
  readonly eyeIcon = Eye;
  readonly arrowRightIcon = ArrowRight;
  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly shieldIcon = ShieldCheck;
  readonly checkIcon = CheckCircle2;

  readonly isCreateModalOpen = signal<boolean>(false);
  readonly searchQuery = signal<string>('');
  readonly activePreset = signal<string>('all');
  readonly selectedCondition = signal<string>('all');
  readonly selectedStatus = signal<string>('all');

  // Filtered Items Computed Signal
  readonly filteredItems = computed(() => {
    let list = this.inventoryService.items();
    const query = this.searchQuery().toLowerCase().trim();
    const preset = this.activePreset();
    const condition = this.selectedCondition();
    const status = this.selectedStatus();

    // 1. Text Search Filter
    if (query) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(query) ||
          (i.brand && i.brand.toLowerCase().includes(query)) ||
          (i.model && i.model.toLowerCase().includes(query)) ||
          (i.category && i.category.toLowerCase().includes(query))
      );
    }

    // 2. Condition Filter
    if (condition !== 'all') {
      list = list.filter((i) => i.condition === condition);
    }

    // 3. Status Filter
    if (status !== 'all') {
      list = list.filter((i) => i.status === status);
    }

    // 4. Saved View Presets (Kapitel 23)
    if (preset === 'needs_research') {
      list = list.filter((i) => i.status === 'received' || i.status === 'needs_review');
    } else if (preset === 'unlisted') {
      list = list.filter((i) => i.status === 'researched' || i.status === 'ready');
    } else if (preset === 'high_margin') {
      list = list.filter((i) => (i.profit_potential ?? 0) >= 30);
    } else if (preset === 'defective') {
      list = list.filter((i) => i.status === 'defective' || i.condition === 'defective');
    }

    return list;
  });

  // KPI Summary for Current Filtered Inventory
  readonly totalTiedCapital = computed(() => {
    return this.filteredItems().reduce((sum, i) => sum + (i.total_item_cost ?? i.allocated_purchase_cost), 0);
  });

  readonly totalExpectedValue = computed(() => {
    return this.filteredItems().reduce((sum, i) => sum + (Number(i.expected_value) || 0), 0);
  });

  readonly totalProfitPotential = computed(() => {
    return Math.max(0, this.totalExpectedValue() - this.totalTiedCapital());
  });

  openCreateModal(): void {
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }
}
