import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewChild } from '@angular/core';
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
  Camera,
  Sparkles,
  Printer,
  CheckSquare,
  Square,
} from 'lucide-angular';
import { InventoryService } from '../../core/services/inventory.service';
import { ItemCreateModalComponent } from './components/item-create-modal/item-create-modal.component';
import { AiPhotoScannerModalComponent } from '../../shared/components/ai-photo-scanner-modal/ai-photo-scanner-modal.component';
import { InventoryLabelModalComponent } from '../../shared/components/inventory-label-modal/inventory-label-modal.component';
import { AiVisualScanResult } from '../../core/services/ai-assistant.service';
import { InventoryItem, ItemCondition, ItemStatus } from '../../core/models/reflip.models';

@Component({
  selector: 'app-inventory',
  imports: [
    RouterLink,
    CurrencyPipe,
    TranslatePipe,
    LucideAngularModule,
    ItemCreateModalComponent,
    AiPhotoScannerModalComponent,
    InventoryLabelModalComponent,
  ],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryComponent {
  readonly inventoryService = inject(InventoryService);

  @ViewChild('createModal') createModal?: ItemCreateModalComponent;

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
  readonly cameraIcon = Camera;
  readonly sparklesIcon = Sparkles;
  readonly printerIcon = Printer;
  readonly checkSquareIcon = CheckSquare;
  readonly squareIcon = Square;

  readonly isCreateModalOpen = signal<boolean>(false);
  readonly isAiScannerOpen = signal<boolean>(false);
  readonly isLabelModalOpen = signal<boolean>(false);
  readonly selectedItemIds = signal<Set<string>>(new Set());

  readonly searchQuery = signal<string>('');
  readonly activePreset = signal<string>('all');
  readonly selectedCondition = signal<string>('all');
  readonly selectedStatus = signal<string>('all');

  // Filtered Items Computed Signal
  readonly filteredItems = computed(() => {
    let list = this.inventoryService.items();
    const query = this.searchQuery().toLowerCase().trim();

    if (query) {
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          (item.sku && item.sku.toLowerCase().includes(query)) ||
          (item.ean && item.ean.toLowerCase().includes(query)) ||
          (item.brand && item.brand.toLowerCase().includes(query)) ||
          (item.model && item.model.toLowerCase().includes(query))
      );
    }

    const cond = this.selectedCondition();
    if (cond !== 'all') {
      list = list.filter((item) => item.condition === cond);
    }

    const stat = this.selectedStatus();
    if (stat !== 'all') {
      list = list.filter((item) => item.status === stat);
    }

    return list;
  });

  readonly totalTiedCapital = computed(() =>
    this.filteredItems().reduce((sum, item) => sum + (item.allocated_purchase_cost || 0), 0)
  );

  readonly totalExpectedValue = computed(() =>
    this.filteredItems().reduce((sum, item) => sum + (Number(item.expected_value) || 0), 0)
  );

  readonly totalProfitPotential = computed(() =>
    this.filteredItems().reduce(
      (sum, item) => sum + Math.max(0, (Number(item.expected_value) || 0) - (item.allocated_purchase_cost || 0)),
      0
    )
  );

  readonly itemsToPrint = computed<InventoryItem[]>(() => {
    const selected = this.selectedItemIds();
    if (selected.size === 0) {
      return this.filteredItems();
    }
    return this.filteredItems().filter((item) => selected.has(item.id));
  });

  toggleSelectItem(id: string): void {
    const next = new Set(this.selectedItemIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedItemIds.set(next);
  }

  toggleSelectAll(): void {
    const items = this.filteredItems();
    if (this.selectedItemIds().size === items.length && items.length > 0) {
      this.selectedItemIds.set(new Set());
    } else {
      this.selectedItemIds.set(new Set(items.map((i) => i.id)));
    }
  }

  isItemSelected(id: string): boolean {
    return this.selectedItemIds().has(id);
  }

  isAllSelected(): boolean {
    const items = this.filteredItems();
    return items.length > 0 && this.selectedItemIds().size === items.length;
  }

  openCreateModal(): void {
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  openLabelModal(): void {
    this.isLabelModalOpen.set(true);
  }

  closeLabelModal(): void {
    this.isLabelModalOpen.set(false);
  }

  onAiProductDetected(res: AiVisualScanResult): void {
    this.isAiScannerOpen.set(false);
    this.isCreateModalOpen.set(true);

    // Give modal a tick to render and prefill
    setTimeout(() => {
      if (this.createModal) {
        this.createModal.prefillWithAiResult(res);
      }
    }, 50);
  }

  setPreset(preset: string): void {
    this.activePreset.set(preset);
    if (preset === 'all') {
      this.selectedStatus.set('all');
    } else {
      this.selectedStatus.set(preset);
    }
  }
}
