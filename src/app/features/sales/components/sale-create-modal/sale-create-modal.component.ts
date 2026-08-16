import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { LucideAngularModule, X, Plus, TrendingUp, DollarSign, Calendar, Tag, ShieldCheck } from 'lucide-angular';
import { SalesService, CreateSalePayload } from '../../../../core/services/sales.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { ProfitEngineService } from '../../../../core/services/profit-engine.service';
import { InventoryItem } from '../../../../core/models/reflip.models';

@Component({
  selector: 'app-sale-create-modal',
  imports: [ReactiveFormsModule, CurrencyPipe, LucideAngularModule],
  templateUrl: './sale-create-modal.component.html',
  styleUrl: './sale-create-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleCreateModalComponent {
  readonly preselectedItemId = input<string | null>(null);

  private readonly salesService = inject(SalesService);
  readonly inventoryService = inject(InventoryService);
  private readonly profitEngine = inject(ProfitEngineService);

  readonly close = output<void>();
  readonly created = output<void>();

  readonly closeIcon = X;
  readonly plusIcon = Plus;
  readonly trendingIcon = TrendingUp;
  readonly dollarIcon = DollarSign;
  readonly calendarIcon = Calendar;
  readonly tagIcon = Tag;
  readonly shieldIcon = ShieldCheck;

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = new FormGroup({
    inventory_item_id: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    platform: new FormControl<string>('kleinanzeigen', { nonNullable: true, validators: [Validators.required] }),
    sale_price: new FormControl<number>(0, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
    sale_date: new FormControl<string>(new Date().toISOString().split('T')[0], { nonNullable: true, validators: [Validators.required] }),
    platform_fee: new FormControl<number>(0, { nonNullable: true }),
    shipping_cost: new FormControl<number>(0, { nonNullable: true }),
    packaging_cost: new FormControl<number>(0, { nonNullable: true }),
    other_costs: new FormControl<number>(0, { nonNullable: true }),
    external_order_id: new FormControl<string>(''),
    buyer_notes: new FormControl<string>(''),
  });

  // Available items to sell (excluding sold/archived items, or including preselected item)
  readonly availableItems = computed(() => {
    const list = this.inventoryService.items();
    const preId = this.preselectedItemId();
    return list.filter((item) => item.status !== 'sold' && item.status !== 'archived' || item.id === preId);
  });

  // Currently selected item for live math
  readonly selectedItem = computed(() => {
    const currentId = this.form.get('inventory_item_id')?.value || this.preselectedItemId();
    return this.inventoryService.items().find((i) => i.id === currentId) || null;
  });

  // Live Calculations (Kapitel 26)
  readonly liveMetrics = signal<{
    totalCosts: number;
    profit: number;
    roi: number;
    holdingDays: number;
  }>({
    totalCosts: 0,
    profit: 0,
    roi: 0,
    holdingDays: 0,
  });

  constructor() {
    // If preselected item ID was provided, set it in form
    const preId = this.preselectedItemId();
    if (preId) {
      this.form.patchValue({ inventory_item_id: preId });
    }
  }

  updateLiveCalculation(): void {
    const f = this.form.getRawValue();
    const item = this.inventoryService.items().find((i) => i.id === f.inventory_item_id);

    const itemBaseCost = item ? (item.total_item_cost ?? item.allocated_purchase_cost) : 0;
    const saleFees = (f.platform_fee || 0) + (f.shipping_cost || 0) + (f.packaging_cost || 0) + (f.other_costs || 0);
    const totalCosts = Number((itemBaseCost + saleFees).toFixed(2));
    const profit = this.profitEngine.calculateProfit(f.sale_price || 0, totalCosts);
    const roi = this.profitEngine.calculateRoi(profit, totalCosts);

    let holdingDays = 0;
    const purchaseDate = item?.purchase?.purchase_date || item?.created_at;
    if (purchaseDate && f.sale_date) {
      holdingDays = this.profitEngine.calculateHoldingDurationDays(purchaseDate, f.sale_date);
    }

    this.liveMetrics.set({
      totalCosts,
      profit,
      roi,
      holdingDays,
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const f = this.form.getRawValue();
    const payload: CreateSalePayload = {
      inventory_item_id: f.inventory_item_id,
      platform: f.platform,
      sale_price: f.sale_price,
      sale_date: f.sale_date,
      platform_fee: f.platform_fee || 0,
      shipping_cost: f.shipping_cost || 0,
      packaging_cost: f.packaging_cost || 0,
      other_costs: f.other_costs || 0,
      external_order_id: f.external_order_id || null,
      buyer_notes: f.buyer_notes || null,
    };

    const { error } = await this.salesService.createSale(payload);
    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.created.emit();
      this.close.emit();
    }
  }
}
