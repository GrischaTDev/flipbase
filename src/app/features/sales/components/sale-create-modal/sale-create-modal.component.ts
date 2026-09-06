import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  LucideDynamicIcon,
  LucidePlus as Plus,
  LucideTrendingUp as TrendingUp,
  LucideX as X,
} from '@lucide/angular';
import { Sale, SaleCostCategory, ShippingMode } from '../../../../core/models/flipbase.models';
import { LegacySaleReconciliation, SaleTarget } from '../../../../core/models/sale-target.models';
import { isSellableInventoryItem } from '../../../../core/models/inventory-sellability';
import {
  CreateSalePayload,
  RecordSaleInput,
  SalesService,
} from '../../../../core/services/sales.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { StockService } from '../../../../core/services/stock.service';
import { calculateSaleMetrics } from '../../../../core/utils/sale-metrics';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';

type SaleLineForm = FormGroup<{
  target: FormControl<string>;
  quantity: FormControl<number>;
  unitSalePrice: FormControl<number>;
}>;

type AdditionalCostForm = FormGroup<{
  category: FormControl<SaleCostCategory>;
  description: FormControl<string>;
  amount: FormControl<number>;
}>;

type ShippingFormMode = ShippingMode | 'unknown';

@Component({
  selector: 'app-sale-create-modal',
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    LucideDynamicIcon,
    CustomSelectComponent,
    DatePickerComponent,
  ],
  templateUrl: './sale-create-modal.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleCreateModalComponent {
  readonly saleTarget = input<SaleTarget | null>(null);
  readonly legacyReconciliation = input<LegacySaleReconciliation | null>(null);
  readonly preselectedItemId = input<string | null>(null);
  readonly sale = input<Sale | null>(null);
  readonly closed = output<void>();
  readonly created = output<void>();

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.isPersisted();
  }

  isSaving(): boolean {
    return this.isSubmitting();
  }

  private readonly salesService = inject(SalesService);
  readonly inventoryService = inject(InventoryService);
  readonly stockService = inject(StockService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef, { optional: true });
  private readonly injector = inject(Injector);

  readonly closeIcon = X;
  readonly plusIcon = Plus;
  readonly trendingIcon = TrendingUp;
  readonly isSubmitting = signal(false);
  readonly isPersisted = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly istBearbeitung = computed(() => this.sale() !== null);
  readonly absendeBeschriftung = computed(() =>
    this.isSubmitting()
      ? 'Speichere…'
      : this.istBearbeitung()
        ? 'Änderungen speichern'
        : 'Verkauf abschließen',
  );

  readonly plattformOptionen: SelectOption<string>[] = [
    { value: 'kleinanzeigen', label: 'Kleinanzeigen (0 % Gebühr)' },
    { value: 'ebay', label: 'eBay' },
    { value: 'vinted', label: 'Vinted' },
    { value: 'direct', label: 'Direktverkauf' },
    { value: 'other', label: 'Andere' },
  ];
  readonly versandOptionen: SelectOption<ShippingMode>[] = [
    { value: 'seller_arranged', label: 'Eigener Versand' },
    { value: 'platform_prepaid', label: 'Versandschein der Plattform' },
    { value: 'pickup', label: 'Abholung' },
  ];
  readonly kostenKategorieOptionen: SelectOption<SaleCostCategory>[] = [
    { value: 'packaging', label: 'Verpackung' },
    { value: 'payment_fee', label: 'Zahlungsgebühr' },
    { value: 'promotion', label: 'Verkaufsförderung' },
    { value: 'other', label: 'Sonstige Kosten' },
  ];
  readonly targetOptions = computed<SelectOption<string>[]>(() => {
    const reconciliationTarget = this.legacyReconciliation() ? this.saleTarget() : null;
    if (reconciliationTarget) {
      return [
        {
          value: this.targetValue(reconciliationTarget),
          label: `${reconciliationTarget.title} · ungeklärter Verkaufsstatus`,
        },
      ];
    }
    return [
      { value: '', label: '-- Artikel auswählen --' },
      ...this.stockService
        .positions()
        .filter((position) => position.available_quantity > 0)
        .map((position) => ({
          value: this.targetValue({
            kind: 'catalog_product',
            catalogProductId: position.catalog_product_id,
            title: position.title,
            availableQuantity: position.available_quantity,
          }),
          label: `${position.title} · Mengenbestand: ${position.available_quantity}`,
        })),
      ...this.availableItems().map((item) => ({
        value: this.targetValue({
          kind: 'inventory_item',
          inventoryItemId: item.id,
          title: item.title,
        }),
        label: `${item.title} · Einzelstück`,
      })),
    ];
  });

  readonly form = new FormGroup({
    lines: new FormArray<SaleLineForm>([this.createLineForm()]),
    platform: new FormControl('kleinanzeigen', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    saleDate: new FormControl(this.localToday(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    platformFee: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    shippingCost: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    shippingRevenue: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    shippingMode: new FormControl<ShippingFormMode>('pickup', { nonNullable: true }),
    additionalCosts: new FormArray<AdditionalCostForm>([]),
    packagingCost: new FormControl(0, { nonNullable: true }),
    otherCosts: new FormControl(0, { nonNullable: true }),
    externalOrderId: new FormControl('', { nonNullable: true }),
    buyerNotes: new FormControl('', { nonNullable: true }),
  });
  readonly lines = this.form.controls.lines;
  readonly additionalCosts = this.form.controls.additionalCosts;
  readonly availableItems = computed(() =>
    this.inventoryService.items().filter(isSellableInventoryItem),
  );
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly versandAuswahl = computed<SelectOption<ShippingFormMode>[]>(() => {
    this.formValue();
    const options: SelectOption<ShippingFormMode>[] = [...this.versandOptionen];
    if (this.form.controls.shippingMode.value === 'unknown') {
      options.push({ value: 'unknown', label: 'Nicht bekannt (Altdaten)' });
    }
    return options;
  });
  readonly totalPrice = computed(() => {
    this.formValue();
    return this.lines.controls.reduce(
      (sum, line) => sum + line.controls.quantity.value * line.controls.unitSalePrice.value,
      0,
    );
  });
  readonly grossRevenue = computed(() => {
    this.formValue();
    return Number((this.totalPrice() + this.form.controls.shippingRevenue.value).toFixed(2));
  });
  readonly liveMetrics = computed(() => {
    this.formValue();
    const raw = this.form.getRawValue();
    const costOfGoods = this.lines.controls.reduce((sum, line) => sum + this.lineCost(line), 0);
    const additionalCosts = this.additionalCostTotal();
    const metrics = calculateSaleMetrics({
      itemRevenue: this.totalPrice(),
      buyerShippingRevenue: raw.shippingRevenue,
      costOfGoodsSold: costOfGoods,
      platformFees: raw.platformFee,
      sellerShippingCost: raw.shippingCost,
      extraCosts: [{ amount: additionalCosts }],
    });
    const totalCosts = Number((costOfGoods + metrics.sellingCosts).toFixed(2));
    return {
      costOfGoods,
      sellingCosts: metrics.sellingCosts,
      totalCosts,
      profit: metrics.resultAfterDirectCosts ?? 0,
      margin: metrics.marginPercent,
    };
  });

  private isApplyingShippingDefault = false;
  private hasExplicitShippingMode = false;

  constructor() {
    this.form.controls.platform.valueChanges.subscribe((platform) =>
      this.applyShippingDefault(platform),
    );
    this.form.controls.shippingMode.valueChanges.subscribe((mode) => {
      if (!this.isApplyingShippingDefault) this.hasExplicitShippingMode = true;
      this.enforceShippingMode(mode);
    });
    this.enforceShippingMode(this.form.controls.shippingMode.value);
    effect(() => {
      const existing = this.sale();
      if (existing) {
        this.fillExistingSale(existing);
        return;
      }
      const target = this.saleTarget() ?? this.preselectedTarget();
      if (target && !this.lines.at(0).controls.target.value) this.setLineTarget(0, target);
    });
  }

  addLine(): void {
    this.lines.push(this.createLineForm());
  }
  addAdditionalCost(): void {
    this.additionalCosts.push(this.createAdditionalCostForm());
  }
  removeAdditionalCost(index: number): void {
    this.additionalCosts.removeAt(index);
  }
  removeLine(index: number): void {
    if (this.lines.length > 1) this.lines.removeAt(index);
  }
  onTargetChange(index: number, value: string): void {
    const line = this.lines.at(index);
    line.controls.target.setValue(value);
    this.updateQuantityValidator(line);
  }
  targetForLine(line: SaleLineForm): SaleTarget | null {
    return this.parseTarget(line.controls.target.value);
  }
  availableQuantity(line: SaleLineForm): number | null {
    const target = this.targetForLine(line);
    return target?.kind === 'catalog_product' ? target.availableQuantity : target ? 1 : null;
  }

  async onSubmit(): Promise<void> {
    if (this.isPersisted()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalidField();
      return;
    }
    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    try {
      const existing = this.sale();
      const reconciliation = this.legacyReconciliation();
      const input = this.recordSalePayload();
      const result = existing
        ? await this.salesService.updateSale(existing.id, this.legacyUpdatePayload())
        : reconciliation
          ? await this.salesService.recordLegacySale(
              reconciliation.inventoryItemId,
              this.validatedLegacyInput(reconciliation, input),
            )
          : await this.salesService.recordSale(input);
      if (result.error) throw result.error;
      this.isPersisted.set(true);
      this.toast.success(existing ? 'Verkauf wurde gespeichert.' : 'Verkauf wurde abgeschlossen.');
      this.created.emit();
      this.closed.emit();
    } catch (cause: unknown) {
      const error =
        cause instanceof Error ? cause : new Error('Der Verkauf konnte nicht gespeichert werden.');
      this.errorMessage.set(error.message);
      if (!this.syncStatus.istZentralGemeldet(error))
        this.toast.error(
          this.istBearbeitung()
            ? 'Verkauf konnte nicht gespeichert werden.'
            : 'Verkauf konnte nicht abgeschlossen werden.',
          error.message,
        );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private focusFirstInvalidField(): void {
    afterNextRender(
      () =>
        this.elementRef?.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      { injector: this.injector },
    );
  }

  private createLineForm(): SaleLineForm {
    return new FormGroup({
      target: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      quantity: new FormControl(1, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(1)],
      }),
      unitSalePrice: new FormControl(0, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0.01)],
      }),
    });
  }
  private createAdditionalCostForm(
    value: Partial<{ category: SaleCostCategory; description: string; amount: number }> = {},
  ): AdditionalCostForm {
    return new FormGroup(
      {
        category: new FormControl<SaleCostCategory>(value.category ?? 'packaging', {
          nonNullable: true,
        }),
        description: new FormControl(value.description ?? '', { nonNullable: true }),
        amount: new FormControl(value.amount ?? 0, {
          nonNullable: true,
          validators: [Validators.required, Validators.min(0)],
        }),
      },
      { validators: this.otherCostDescriptionRequired() },
    );
  }
  private recordSalePayload(): RecordSaleInput {
    const raw = this.form.getRawValue();
    const additionalCosts = raw.additionalCosts.map((cost) => ({
      category: cost.category,
      description: cost.description.trim() || null,
      amount: cost.amount,
    }));
    return {
      platform: raw.platform,
      saleDate: raw.saleDate,
      platformFee: raw.platformFee,
      shippingCost: raw.shippingCost,
      shippingRevenue: raw.shippingRevenue,
      shippingMode: raw.shippingMode === 'unknown' ? undefined : raw.shippingMode,
      additionalCosts,
      packagingCost: this.costTotalFor('packaging'),
      otherCosts: Number(
        additionalCosts
          .filter((cost) => cost.category !== 'packaging')
          .reduce((sum, cost) => sum + cost.amount, 0)
          .toFixed(2),
      ),
      externalOrderId: raw.externalOrderId.trim() || null,
      buyerNotes: raw.buyerNotes.trim() || null,
      lines: this.lines.controls.map((line) => {
        const target = this.targetForLine(line);
        if (!target) throw new Error('Bitte wählen Sie für jede Position einen Artikel.');
        const value = line.getRawValue();
        return target.kind === 'catalog_product'
          ? {
              catalogProductId: target.catalogProductId,
              titleSnapshot: target.title,
              quantity: value.quantity,
              unitSalePrice: value.unitSalePrice,
            }
          : {
              inventoryItemId: target.inventoryItemId,
              titleSnapshot: target.title,
              quantity: value.quantity,
              unitSalePrice: value.unitSalePrice,
            };
      }),
    };
  }

  private validatedLegacyInput(
    reconciliation: LegacySaleReconciliation,
    input: RecordSaleInput,
  ): RecordSaleInput {
    const line = input.lines[0];
    if (
      input.lines.length !== 1 ||
      line?.inventoryItemId !== reconciliation.inventoryItemId ||
      line.quantity !== 1
    ) {
      throw new Error('Der historische Verkaufsnachtrag ist unvollständig oder wurde verändert.');
    }
    return input;
  }
  private legacyUpdatePayload(): CreateSalePayload {
    const raw = this.form.getRawValue();
    const target = this.targetForLine(this.lines.at(0));
    if (!target || target.kind !== 'inventory_item')
      throw new Error('Bestehende Mengenverkäufe können nicht nachträglich geändert werden.');
    return {
      inventory_item_id: target.inventoryItemId,
      platform: raw.platform,
      sale_price: this.grossRevenue(),
      sale_date: raw.saleDate,
      platform_fee: raw.platformFee,
      shipping_cost: raw.shippingCost,
      packaging_cost: this.costTotalFor('packaging'),
      other_costs: this.costTotalExcept('packaging'),
      external_order_id: raw.externalOrderId.trim() || null,
      buyer_notes: raw.buyerNotes.trim() || null,
    };
  }
  private fillExistingSale(sale: Sale): void {
    this.hasExplicitShippingMode = true;
    const sources = sale.lines?.length
      ? sale.lines.map((line) => ({
          target: line.catalog_product_id
            ? this.targetValue({
                kind: 'catalog_product',
                catalogProductId: line.catalog_product_id,
                title: line.title_snapshot,
                availableQuantity: line.quantity,
              })
            : this.targetValue({
                kind: 'inventory_item',
                inventoryItemId: line.inventory_item_id ?? '',
                title: line.title_snapshot,
              }),
          quantity: line.quantity,
          unitSalePrice: line.unit_sale_price,
        }))
      : sale.inventory_item_id
        ? [
            {
              target: this.targetValue({
                kind: 'inventory_item',
                inventoryItemId: sale.inventory_item_id,
                title: sale.inventory_item?.title ?? 'Artikel',
              }),
              quantity: 1,
              unitSalePrice: sale.sale_price,
            },
          ]
        : [];
    this.lines.clear();
    sources.forEach((source) => {
      const line = this.createLineForm();
      line.setValue(source);
      this.updateQuantityValidator(line);
      this.lines.push(line);
    });
    if (this.lines.length === 0) this.addLine();
    this.additionalCosts.clear();
    if (sale.cost_entries?.length) {
      sale.cost_entries.forEach((cost) => {
        this.additionalCosts.push(
          this.createAdditionalCostForm({
            category: cost.category,
            description: cost.description ?? '',
            amount: cost.amount,
          }),
        );
      });
    } else {
      if ((sale.packaging_cost ?? 0) > 0) {
        this.additionalCosts.push(
          this.createAdditionalCostForm({ category: 'packaging', amount: sale.packaging_cost }),
        );
      }
      if ((sale.other_costs ?? 0) > 0) {
        this.additionalCosts.push(
          this.createAdditionalCostForm({
            category: 'other',
            description: 'Übernommene Altdaten-Kosten',
            amount: sale.other_costs,
          }),
        );
      }
    }
    this.form.patchValue({
      platform: sale.platform,
      saleDate: sale.sale_date,
      platformFee: sale.platform_fee ?? 0,
      shippingCost: sale.shipping_cost ?? 0,
      shippingRevenue: sale.shipping_revenue ?? 0,
      shippingMode: sale.shipping_mode ?? 'unknown',
      packagingCost: sale.packaging_cost ?? 0,
      otherCosts: sale.other_costs ?? 0,
      externalOrderId: sale.external_order_id ?? '',
      buyerNotes: sale.buyer_notes ?? '',
    });
  }
  private setLineTarget(index: number, target: SaleTarget): void {
    const line = this.lines.at(index);
    line.controls.target.setValue(this.targetValue(target));
    line.controls.quantity.setValue(1);
    this.updateQuantityValidator(line);
  }
  private updateQuantityValidator(line: SaleLineForm): void {
    const available = this.availableQuantity(line);
    line.controls.quantity.setValidators([
      Validators.required,
      Validators.min(1),
      ...(available === null ? [] : [Validators.max(available)]),
    ]);
    line.controls.quantity.updateValueAndValidity();
  }
  private lineCost(line: SaleLineForm): number {
    const target = this.targetForLine(line);
    const quantity = line.controls.quantity.value;
    if (!target) return 0;
    if (target.kind === 'catalog_product')
      return (
        (this.stockService
          .positions()
          .find((position) => position.catalog_product_id === target.catalogProductId)
          ?.oldest_available_unit_cost ?? 0) * quantity
      );
    const item = this.inventoryService.items().find((entry) => entry.id === target.inventoryItemId);
    return (item?.total_item_cost ?? item?.allocated_purchase_cost ?? 0) * quantity;
  }
  private additionalCostTotal(): number {
    return Number(
      this.additionalCosts.controls
        .reduce((sum, cost) => sum + cost.controls.amount.value, 0)
        .toFixed(2),
    );
  }
  private costTotalFor(category: SaleCostCategory): number {
    return Number(
      this.additionalCosts.controls
        .filter((cost) => cost.controls.category.value === category)
        .reduce((sum, cost) => sum + cost.controls.amount.value, 0)
        .toFixed(2),
    );
  }
  private costTotalExcept(category: SaleCostCategory): number {
    return Number(
      this.additionalCosts.controls
        .filter((cost) => cost.controls.category.value !== category)
        .reduce((sum, cost) => sum + cost.controls.amount.value, 0)
        .toFixed(2),
    );
  }
  private otherCostDescriptionRequired(): ValidatorFn {
    return (control) => {
      const value = control.value as { category?: SaleCostCategory; description?: string };
      return value.category === 'other' && !value.description?.trim()
        ? { otherCostDescriptionRequired: true }
        : null;
    };
  }
  private applyShippingDefault(platform: string): void {
    if (this.hasExplicitShippingMode) return;
    this.isApplyingShippingDefault = true;
    try {
      this.form.controls.shippingMode.setValue(this.shippingDefaultFor(platform));
    } finally {
      this.isApplyingShippingDefault = false;
    }
  }
  private shippingDefaultFor(platform: string): ShippingMode {
    if (platform === 'vinted') return 'platform_prepaid';
    if (platform === 'kleinanzeigen' || platform === 'direct') return 'pickup';
    return 'seller_arranged';
  }
  private enforceShippingMode(mode: ShippingFormMode): void {
    if (mode === 'seller_arranged' || mode === 'unknown') {
      this.form.controls.shippingRevenue.enable({ emitEvent: false });
      this.form.controls.shippingCost.enable({ emitEvent: false });
      return;
    }
    this.form.patchValue({ shippingRevenue: 0, shippingCost: 0 }, { emitEvent: false });
    this.form.controls.shippingRevenue.disable({ emitEvent: false });
    this.form.controls.shippingCost.disable({ emitEvent: false });
  }
  private preselectedTarget(): SaleTarget | null {
    const item = this.inventoryService
      .items()
      .find((entry) => entry.id === this.preselectedItemId());
    return item ? { kind: 'inventory_item', inventoryItemId: item.id, title: item.title } : null;
  }
  private targetValue(target: SaleTarget): string {
    return target.kind === 'catalog_product'
      ? `catalog:${target.catalogProductId}`
      : `inventory:${target.inventoryItemId}`;
  }
  private parseTarget(value: string): SaleTarget | null {
    if (value.startsWith('catalog:')) {
      const id = value.slice(8);
      const position = this.stockService
        .positions()
        .find((entry) => entry.catalog_product_id === id);
      return position
        ? {
            kind: 'catalog_product',
            catalogProductId: id,
            title: position.title,
            availableQuantity: position.available_quantity,
          }
        : null;
    }
    if (value.startsWith('inventory:')) {
      const id = value.slice(10);
      const item = this.inventoryService.items().find((entry) => entry.id === id);
      return item ? { kind: 'inventory_item', inventoryItemId: id, title: item.title } : null;
    }
    return null;
  }
  private localToday(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
