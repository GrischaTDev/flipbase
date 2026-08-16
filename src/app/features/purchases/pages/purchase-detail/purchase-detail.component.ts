import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
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

  readonly isAddingCost = signal<boolean>(false);
  readonly isAddingItem = signal<boolean>(false);

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

  constructor() {
    effect(() => {
      const purchaseId = this.id();
      if (purchaseId) {
        this.purchaseService.getPurchaseById(purchaseId);
      }
    });
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
