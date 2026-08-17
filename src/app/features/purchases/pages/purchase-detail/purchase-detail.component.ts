import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  ArrowLeft,
  ShoppingBag,
  Package,
  Layers,
  Boxes,
  Plus,
  Trash2,
  ExternalLink,
  Coins,
  Receipt,
  Scale,
  Sparkles,
  Sliders,
  CheckCircle2,
  PieChart,
  X,
  RefreshCw,
} from 'lucide-angular';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { CostAllocationMode, ItemCondition } from '../../../../core/models/reflip.models';

@Component({
  selector: 'app-purchase-detail',
  imports: [RouterLink, ReactiveFormsModule, CurrencyPipe, DatePipe, LucideAngularModule],
  templateUrl: './purchase-detail.component.html',
  styleUrl: './purchase-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseDetailComponent {
  readonly id = input.required<string>();

  readonly purchaseService = inject(PurchaseService);
  private readonly router = inject(Router);

  readonly arrowLeftIcon = ArrowLeft;
  readonly bagIcon = ShoppingBag;
  readonly packageIcon = Package;
  readonly layersIcon = Layers;
  readonly boxesIcon = Boxes;
  readonly plusIcon = Plus;
  readonly trashIcon = Trash2;
  readonly linkIcon = ExternalLink;
  readonly coinsIcon = Coins;
  readonly receiptIcon = Receipt;
  readonly scaleIcon = Scale;
  readonly sparklesIcon = Sparkles;
  readonly slidersIcon = Sliders;
  readonly checkIcon = CheckCircle2;
  readonly chartIcon = PieChart;
  readonly closeIcon = X;
  readonly refreshIcon = RefreshCw;

  readonly isAddingCost = signal<boolean>(false);
  readonly isAddingItem = signal<boolean>(false);
  readonly isAllocatorOpen = signal<boolean>(false);

  // Lot Allocator interactive state
  readonly allocatorMode = signal<CostAllocationMode>('value_weighted');
  readonly editableExpectedValues = signal<{ [itemId: string]: number }>({});
  readonly isApplyingAllocation = signal<boolean>(false);

  readonly costForm = new FormGroup({
    type: new FormControl('shipping', { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl<number>(0, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
    description: new FormControl(''),
  });

  readonly itemForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    condition: new FormControl<ItemCondition>('used', { nonNullable: true }),
    expected_value: new FormControl<number | null>(null),
  });

  readonly simulatedAllocations = computed(() => {
    const purchase = this.purchaseService.selectedPurchase();
    const items = this.purchaseService.purchaseItems();
    if (!purchase || items.length === 0) return [];

    const totalCost = purchase.total_purchase_cost || purchase.purchase_price;
    const mode = this.allocatorMode();
    const customValues = this.editableExpectedValues();

    if (mode === 'even') {
      const evenCost = Number((totalCost / items.length).toFixed(2));
      return items.map((it) => {
        const expVal = customValues[it.id] !== undefined ? customValues[it.id] : (it.expected_value || 0);
        const percent = (1 / items.length) * 100;
        return {
          item: it,
          expected_value: expVal,
          allocated_cost: evenCost,
          percent_of_total: percent,
        };
      });
    }

    // Value weighted mode
    const sumExpectedValues = items.reduce((sum, it) => {
      const val = customValues[it.id] !== undefined ? customValues[it.id] : (it.expected_value || 1);
      return sum + Math.max(0.01, val);
    }, 0);

    return items.map((it) => {
      const expVal = customValues[it.id] !== undefined ? customValues[it.id] : (it.expected_value || 1);
      const factor = sumExpectedValues > 0 ? Math.max(0.01, expVal) / sumExpectedValues : 1 / items.length;
      const allocatedCost = Number((totalCost * factor).toFixed(2));
      const percent = factor * 100;

      return {
        item: it,
        expected_value: expVal,
        allocated_cost: allocatedCost,
        percent_of_total: percent,
      };
    });
  });

  readonly totalSimulatedAllocatedCost = computed(() => {
    return this.simulatedAllocations().reduce((sum, a) => sum + a.allocated_cost, 0);
  });

  constructor() {
    effect(() => {
      const purchaseId = this.id();
      if (purchaseId) {
        this.purchaseService.getPurchaseById(purchaseId);
      }
    });
  }

  openAllocator(): void {
    const items = this.purchaseService.purchaseItems();
    const currentValues: { [itemId: string]: number } = {};
    for (const it of items) {
      currentValues[it.id] = it.expected_value || 0;
    }
    this.editableExpectedValues.set(currentValues);
    const p = this.purchaseService.selectedPurchase();
    if (p) {
      this.allocatorMode.set(p.cost_allocation_mode || 'value_weighted');
    }
    this.isAllocatorOpen.set(true);
  }

  closeAllocator(): void {
    this.isAllocatorOpen.set(false);
  }

  updateItemExpectedValue(itemId: string, value: number): void {
    this.editableExpectedValues.update((current) => ({
      ...current,
      [itemId]: Math.max(0, value),
    }));
  }

  async applyAllocations(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase) return;

    this.isApplyingAllocation.set(true);
    const customValues = this.editableExpectedValues();
    const itemValues = Object.entries(customValues).map(([id, expected_value]) => ({ id, expected_value }));

    await this.purchaseService.redistributeCosts(purchase.id, this.allocatorMode(), itemValues);
    this.isApplyingAllocation.set(false);
    this.closeAllocator();
  }

  async setAllocationMode(mode: CostAllocationMode): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase) return;
    await this.purchaseService.updateCostAllocationMode(purchase.id, mode);
  }

  async onAddCost(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || this.costForm.invalid) return;

    const val = this.costForm.getRawValue();
    await this.purchaseService.addPurchaseCost(purchase.id, val.type, val.amount, val.description || undefined);

    this.costForm.reset({ type: 'shipping', amount: 0, description: '' });
    this.isAddingCost.set(false);
  }

  async onDeleteCost(costId: string): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase) return;
    await this.purchaseService.deletePurchaseCost(costId, purchase.id);
  }

  async onAddItem(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || this.itemForm.invalid) return;

    const val = this.itemForm.getRawValue();
    await this.purchaseService.addItemToPurchase(purchase.id, {
      title: val.title,
      condition: val.condition,
      expected_value: val.expected_value || undefined,
    });

    this.itemForm.reset({ title: '', condition: 'used', expected_value: null });
    this.isAddingItem.set(false);
  }

  async onDeletePurchase(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase) return;
    if (confirm('Möchtest du diesen Einkauf und alle zugehörigen Daten wirklich löschen?')) {
      await this.purchaseService.deletePurchase(purchase.id);
      this.router.navigate(['/purchases']);
    }
  }
}
