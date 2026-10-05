import { SALES_LABELS, SALES_HELP } from '../../../../core/config/sales-table.config';
import { ArticlePickerComponent } from '../../../../shared/components/article-picker/article-picker.component';
import type { ArticlePickerEntry } from '../../../../shared/components/article-picker/article-picker.models';
import { isArticleSelectable } from '../../../../shared/components/article-picker/article-picker-selection';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { ItemConditionLabelPipe } from '../../../../shared/pipes/item-condition-label.pipe';
import {
  buildSaleArticleEntries,
  remainingLineQuantity,
  selectLinkedSaleItems,
} from '../../utils/sale-article-selection';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
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
  LucidePlus as Plus,
  LucideSearch as Search,
  LucideTrendingUp as TrendingUp,
  LucideTrash2 as Trash2,
} from '@lucide/angular';
import { SALE_PLATFORM_OPTIONS } from '../../../../core/config/sale-platform-options';
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
import { CatalogService } from '../../../../core/services/catalog.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { calculateSaleMetrics } from '../../../../core/utils/sale-metrics';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { WorkspaceContextLockService } from '../../../../core/services/workspace-context-lock.service';
import type {
  ExternalSaleEntryDraft,
  ExternalSaleEntrySubmit,
} from '../../models/external-sale-entry.models';

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
    DecimalPipe,
    CustomSelectComponent,
    DatePickerComponent,
    ButtonComponent,
    CardComponent,
    TableActionButtonComponent,
    TwoColumnLayoutComponent,
    NumberInputComponent,
    TextFieldComponent,
    ArticlePickerComponent,
    ProductThumbnailComponent,
  ],
  templateUrl: './sale-create-modal.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleCreateModalComponent {
  readonly salesLabels = SALES_LABELS;
  readonly salesHelp = SALES_HELP;
  readonly saleTarget = input<SaleTarget | null>(null);
  readonly legacyReconciliation = input<LegacySaleReconciliation | null>(null);
  readonly preselectedItemId = input<string | null>(null);
  readonly sale = input<Sale | null>(null);
  readonly showActions = input(true);
  readonly externalDraft = input<ExternalSaleEntryDraft | null>(null);
  readonly externalSubmit = input<ExternalSaleEntrySubmit | null>(null);
  private previousExternalDraft: ExternalSaleEntryDraft | null = null;
  private readonly externalOutcomeBlocked = signal(false);
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
  private readonly catalogService = inject(CatalogService, { optional: true });
  private readonly purchaseService = inject(PurchaseService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef, { optional: true });
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceContext = inject(WorkspaceContextLockService);
  private readonly releaseWorkspaceLock = this.workspaceContext.acquire();

  readonly removeIcon = Trash2;
  readonly plusIcon = Plus;
  readonly searchIcon = Search;
  readonly trendingIcon = TrendingUp;
  readonly isSubmitting = signal(false);
  readonly isPersisted = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isLoadingStock = signal(false);
  readonly stockLoadError = signal<string | null>(null);
  private stockLoadRequestId = 0;
  readonly istBearbeitung = computed(() => this.sale() !== null);
  readonly absendeBeschriftung = computed(() =>
    this.isSubmitting()
      ? 'Speichere…'
      : this.istBearbeitung()
        ? 'Änderungen speichern'
        : 'Verkauf abschließen',
  );

  readonly plattformOptionen: SelectOption<string>[] = SALE_PLATFORM_OPTIONS.map(
    ({ value, label }) => ({ value, label }),
  );
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
        .filter((position) => position.available_quantity > 0 && !position.archived_at)
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

  readonly articlePickerOpen = signal(false);
  readonly articlePickerLineIndex = signal<number | null>(null);
  private articlePickerReturnFocus: HTMLElement | null = null;
  private readonly articleConditionLabels = new ItemConditionLabelPipe();
  readonly selectionLoading = computed(() => {
    const workspaceId = this.workspaceService?.currentWorkspace()?.id;
    if (!workspaceId) return false;
    return (
      this.isLoadingStock() ||
      !!this.inventoryService.isLoading?.() ||
      !!this.purchaseService?.isLoading?.() ||
      !!this.catalogService?.isLoading?.() ||
      this.inventoryService.loadedWorkspaceId?.() !== workspaceId ||
      this.purchaseService?.loadedWorkspaceId?.() !== workspaceId ||
      this.catalogService?.loadedWorkspaceId?.() !== workspaceId
    );
  });
  readonly selectionError = computed(
    () =>
      this.stockLoadError() ??
      this.inventoryService.loadError?.()?.message ??
      this.purchaseService?.loadError?.()?.message ??
      this.catalogService?.loadError?.()?.message ??
      null,
  );
  readonly saleArticleEntries = computed(() => {
    const workspaceId = this.workspaceService?.currentWorkspace()?.id ?? null;
    const products = this.catalogService?.products() ?? [];
    const items = this.availableItems();
    const entries = buildSaleArticleEntries(
      workspaceId,
      products,
      items,
      this.purchaseService?.purchases?.() ?? [],
      this.stockService.loadedWorkspaceId?.() === workspaceId ? this.stockService.positions() : [],
      new Set(),
    );
    return entries.map((entry) => {
      const condition = entry.id.startsWith('inventory:')
        ? items.find((item) => `inventory:${item.id}` === entry.id)?.condition
        : products.find((product) => product.id === entry.imageKey)?.condition;
      return {
        ...entry,
        conditionLabel: condition ? this.articleConditionLabels.transform(condition) : null,
      };
    });
  });
  readonly articlePickerEntries = computed(() => {
    this.formValue();
    const replacing = this.articlePickerLineIndex();
    const draft = this.externalDraft();
    if (draft && replacing !== null) {
      const sourceLineId = draft.lines[replacing]?.sourceLineId;
      const required = draft.lines
        .filter((line) => line.sourceLineId === sourceLineId)
        .reduce((sum, line) => sum + line.quantity, 0);
      return this.saleArticleEntries().map((entry) => {
        const used = this.lines.controls.reduce(
          (sum, line, index) =>
            draft.lines[index]?.sourceLineId !== sourceLineId &&
            line.controls.target.value === entry.id
              ? sum + line.controls.quantity.value
              : sum,
          0,
        );
        return {
          ...entry,
          disabledReason:
            entry.disabledReason ??
            (typeof entry.availableQuantity !== 'number' ||
            entry.availableQuantity - used < required
              ? 'Nicht genügend verfügbarer Bestand'
              : null),
        };
      });
    }
    const used = new Set(
      this.lines.controls
        .filter((_line, index) => index !== replacing)
        .map((line) => line.controls.target.value),
    );
    return this.saleArticleEntries().map((entry) => ({
      ...entry,
      disabledReason:
        entry.disabledReason ?? (used.has(entry.id) ? 'Bereits im Verkauf enthalten' : null),
    }));
  });
  readonly articleImageUrls = computed<Readonly<Record<string, string>>>(() => {
    const urls = { ...(this.catalogService?.imageUrls?.() ?? {}) };
    const lineProducts = new Map(
      (this.purchaseService?.purchases?.() ?? [])
        .flatMap((purchase) => purchase.purchase_lines ?? [])
        .map((line) => [line.id, line.catalog_product_id]),
    );
    for (const item of this.availableItems()) {
      const productId = item.purchase_line_id ? lineProducts.get(item.purchase_line_id) : null;
      if (productId && urls[productId]) urls[item.id] = urls[productId];
    }
    return urls;
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
    platformFee: new FormControl<number | null>(0, {
      nonNullable: true,
      validators: [Validators.min(0)],
    }),
    shippingCost: new FormControl<number | null>(0, {
      nonNullable: true,
      validators: [Validators.min(0)],
    }),
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
  readonly availableItems = computed(() => {
    const workspaceId = this.workspaceService?.currentWorkspace()?.id ?? null;
    return selectLinkedSaleItems(
      workspaceId,
      this.inventoryService.items().filter(isSellableInventoryItem),
      this.purchaseService?.purchases() ?? [],
      this.catalogService?.products() ?? [],
      !!workspaceId &&
        this.purchaseService?.loadedWorkspaceId() === workspaceId &&
        this.catalogService?.loadedWorkspaceId() === workspaceId,
    );
  });
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly hasSelectedSaleLines = computed(() => {
    this.formValue();
    return this.lines.controls.some((line) => !!line.controls.target.value);
  });
  readonly versandAuswahl = computed<SelectOption<ShippingFormMode>[]>(() => {
    this.formValue();
    const options: SelectOption<ShippingFormMode>[] = [...this.versandOptionen];
    if (this.form.controls.shippingMode.value === 'unknown') {
      options.push({
        value: 'unknown',
        label: this.externalDraft() ? 'Versandart nicht angegeben' : 'Nicht bekannt (Altdaten)',
      });
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
    const lineCosts = this.lines.controls.map((line) => this.lineCost(line));
    const costOfGoods = lineCosts.some((cost) => cost === null)
      ? null
      : lineCosts.reduce<number>((sum, cost) => sum + (cost ?? 0), 0);
    const additionalCosts = this.additionalCostTotal();
    const metrics = calculateSaleMetrics({
      itemRevenue: this.totalPrice(),
      buyerShippingRevenue: raw.shippingRevenue,
      costOfGoodsSold: costOfGoods,
      platformFees: raw.platformFee ?? 0,
      sellerShippingCost: raw.shippingCost ?? 0,
      extraCosts: [{ amount: additionalCosts }],
    });
    const costsConfirmed =
      !this.externalDraft() || (raw.platformFee !== null && raw.shippingCost !== null);
    const totalCosts =
      costOfGoods === null || !costsConfirmed
        ? null
        : Number((costOfGoods + metrics.sellingCosts).toFixed(2));
    return {
      costOfGoods,
      sellingCosts: costsConfirmed ? metrics.sellingCosts : null,
      totalCosts,
      profit: costsConfirmed ? metrics.resultAfterDirectCosts : null,
      margin: costsConfirmed ? metrics.marginPercent : null,
    };
  });

  private isApplyingShippingDefault = false;
  private hasExplicitShippingMode = false;

  constructor() {
    this.destroyRef.onDestroy(this.releaseWorkspaceLock);
    this.destroyRef.onDestroy(() => this.stockLoadRequestId++);
    effect(() => {
      const workspaceId = this.workspaceService?.currentWorkspace()?.id;
      if (!workspaceId) return;
      // Die Erfassung muss auch direkt nach dem Anmelden funktionieren.
      // Ladezustände dürfen diesen Effekt nicht erneut auslösen.
      untracked(() => {
        void this.loadStockPositions();
        if (this.purchaseService?.loadedWorkspaceId() !== workspaceId) {
          void this.purchaseService?.loadPurchases(workspaceId);
        }
        if (this.catalogService?.loadedWorkspaceId() !== workspaceId) {
          void this.catalogService?.loadProducts(workspaceId);
        }
      });
    });
    this.form.controls.platform.valueChanges.subscribe((platform) =>
      this.applyShippingDefault(platform),
    );
    this.form.controls.shippingMode.valueChanges.subscribe((mode) => {
      if (!this.isApplyingShippingDefault) this.hasExplicitShippingMode = true;
      this.enforceShippingMode(mode);
    });
    this.enforceShippingMode(this.form.controls.shippingMode.value);
    effect(() => {
      this.formValue();
      this.stockService.positions();
      this.saleArticleEntries();
      const ready = !this.selectionLoading() && !this.selectionError();
      untracked(() => {
        if (this.workspaceService?.currentWorkspace() && ready) this.validateSaleTargets();
        else this.lines.controls.forEach((line) => this.updateQuantityValidator(line));
      });
    });
    effect(() => {
      const draft = this.externalDraft();
      if (draft) {
        untracked(() => this.fillExternalDraft(draft));
        return;
      }
      if (this.previousExternalDraft) untracked(() => this.resetExternalDraft());
      const existing = this.sale();
      if (existing) {
        untracked(() => this.fillExistingSale(existing));
        return;
      }
      const target = this.saleTarget() ?? this.preselectedTarget();
      if (target && !this.lines.at(0).controls.target.value) this.setLineTarget(0, target);
    });
  }

  canSave(): boolean {
    const external = this.externalDraft();
    return (
      !this.isSubmitting() &&
      !this.isPersisted() &&
      !this.isLoadingStock() &&
      !this.stockLoadError() &&
      (!external ||
        (!!this.externalSubmit() &&
          !this.externalOutcomeBlocked() &&
          this.form.valid &&
          this.hasConfirmedExternalCosts() &&
          this.externalSourceMatches(external))) &&
      (!this.workspaceService?.currentWorkspace() ||
        (!this.selectionLoading() && !this.selectionError()))
    );
  }

  async loadStockPositions(): Promise<void> {
    const workspaceId = this.workspaceService?.currentWorkspace()?.id;
    if (!workspaceId) return;
    const requestId = ++this.stockLoadRequestId;
    this.isLoadingStock.set(true);
    this.stockLoadError.set(null);
    try {
      await this.stockService.loadPositions(workspaceId);
      if (
        requestId !== this.stockLoadRequestId ||
        this.workspaceService?.currentWorkspace()?.id !== workspaceId
      )
        return;
      const error = this.stockService.loadError();
      if (error) {
        this.stockLoadError.set(error.message || 'Der Bestand konnte nicht geladen werden.');
        return;
      }
      // Vorbelegte Positionen erhalten erst nach dem Laden ihre Mengenobergrenze.
      this.lines.controls.forEach((line) => this.updateQuantityValidator(line));
    } catch (cause: unknown) {
      if (
        requestId !== this.stockLoadRequestId ||
        this.workspaceService?.currentWorkspace()?.id !== workspaceId
      )
        return;
      this.stockLoadError.set(
        cause instanceof Error ? cause.message : 'Der Bestand konnte nicht geladen werden.',
      );
    } finally {
      if (requestId === this.stockLoadRequestId) this.isLoadingStock.set(false);
    }
  }

  async reloadSaleSources(): Promise<void> {
    const workspaceId = this.workspaceService?.currentWorkspace()?.id;
    if (!workspaceId) return;
    await Promise.all([
      this.loadStockPositions(),
      this.inventoryService.loadInventory(workspaceId),
      this.purchaseService?.loadPurchases(workspaceId),
      this.catalogService?.loadProducts(workspaceId),
    ]);
  }

  openArticlePicker(index: number | null = null): void {
    if (this.externalDraft() && index === null) return;
    if (this.istBearbeitung() || this.legacyReconciliation() || this.isSubmitting()) return;
    if (!this.workspaceService?.currentWorkspace()) return;
    const active = this.elementRef?.nativeElement.ownerDocument.activeElement;
    this.articlePickerReturnFocus = active instanceof HTMLElement ? active : null;
    this.articlePickerLineIndex.set(index);
    this.articlePickerOpen.set(true);
  }

  closeArticlePicker(): void {
    this.articlePickerOpen.set(false);
    const previous = this.articlePickerReturnFocus;
    afterNextRender(
      () => {
        if (previous?.isConnected) previous.focus();
      },
      { injector: this.injector },
    );
  }

  onArticlesSelected(entries: readonly ArticlePickerEntry[]): void {
    if (this.istBearbeitung() || this.legacyReconciliation() || this.isSubmitting()) return;
    if (this.selectionLoading() || this.selectionError()) return;
    const current = new Map(this.articlePickerEntries().map((entry) => [entry.id, entry]));
    const selected = [...new Set(entries.map((entry) => entry.id))];
    const replacing = this.articlePickerLineIndex();
    if (!selected.length || (replacing !== null && selected.length !== 1)) return;
    const targets: SaleTarget[] = [];
    for (const id of selected) {
      const entry = current.get(id);
      const target = this.parseTarget(id);
      if (!entry || !isArticleSelectable(entry) || !target) {
        this.errorMessage.set(
          'Die Auswahl ist nicht mehr verfügbar. Bitte prüfe den aktuellen Bestand.',
        );
        return;
      }
      targets.push(target);
    }
    if (replacing !== null && !this.lines.controls[replacing]) return;
    if (replacing !== null && this.lines.at(replacing).controls.target.value === selected[0]) {
      this.closeArticlePicker();
      return;
    }
    for (const target of targets) {
      let index = replacing ?? this.lines.controls.findIndex((line) => !line.controls.target.value);
      if (index === -1) {
        this.addLine();
        index = this.lines.length - 1;
      }
      this.setLineTarget(index, target);
    }
    this.form.markAsDirty();
    this.errorMessage.set(null);
    this.closeArticlePicker();
  }

  articleTitle(line: SaleLineForm): string {
    const index = this.lines.controls.indexOf(line);
    const recorded = this.sale()?.lines?.[index];
    if (recorded) return recorded.title_snapshot;
    const entry = this.saleArticleEntries().find(
      (candidate) => candidate.id === line.controls.target.value,
    );
    return (
      entry?.title ??
      this.targetForLine(line)?.title ??
      this.externalDraft()?.lines[index]?.title ??
      (index === 0 ? this.saleTarget()?.title : null) ??
      'Artikel auswählen'
    );
  }

  articleVariantLabel(line: SaleLineForm): string | null {
    const entry = this.saleArticleEntries().find(
      (candidate) => candidate.id === line.controls.target.value,
    );
    if (!entry) return null;
    const details = [
      entry.size ? `Größe ${entry.size}` : null,
      entry.color,
      entry.conditionLabel,
    ].filter(Boolean);
    return details.length ? details.join(' · ') : null;
  }

  articleLabel(line: SaleLineForm): string {
    const title = this.articleTitle(line);
    const variant = this.articleVariantLabel(line);
    return variant ? `${title} · ${variant}` : title;
  }

  articleImage(line: SaleLineForm): string | null {
    const entry = this.saleArticleEntries().find(
      (candidate) => candidate.id === line.controls.target.value,
    );
    return entry ? (this.articleImageUrls()[entry.imageKey] ?? null) : null;
  }

  onArticleImageFailed(imageKey: string): void {
    if (this.catalogService?.products().some((product) => product.id === imageKey)) {
      this.catalogService.invalidateProductImage(imageKey);
    }
  }

  private validateSaleTargets(): void {
    if (this.istBearbeitung() || this.legacyReconciliation()) return;
    const entries = new Map(this.saleArticleEntries().map((entry) => [entry.id, entry]));
    for (const line of this.lines.controls) {
      const entry = entries.get(line.controls.target.value);
      const otherErrors = { ...line.controls.target.errors };
      delete otherErrors['unavailable'];
      const errors =
        entry && isArticleSelectable(entry) ? otherErrors : { ...otherErrors, unavailable: true };
      line.controls.target.setErrors(Object.keys(errors).length ? errors : null, {
        emitEvent: false,
      });
      this.updateQuantityValidator(line);
    }
  }

  addLine(): void {
    if (this.externalDraft()) return;
    this.lines.push(this.createLineForm());
  }
  addAdditionalCost(): void {
    this.additionalCosts.push(this.createAdditionalCostForm());
  }
  removeAdditionalCost(index: number): void {
    this.additionalCosts.removeAt(index);
  }
  removeLine(index: number): void {
    if (
      this.externalDraft() ||
      this.istBearbeitung() ||
      this.legacyReconciliation() ||
      this.isSubmitting()
    )
      return;
    if (!this.lines.controls[index]) return;
    if (this.lines.length === 1) {
      const line = this.lines.at(0);
      line.reset({ target: '', quantity: 1, unitSalePrice: 0 });
      this.updateQuantityValidator(line);
      this.form.markAsDirty();
      return;
    }
    this.lines.removeAt(index);
    this.form.markAsDirty();
  }
  onTargetChange(index: number, value: string): void {
    if (this.istBearbeitung() || this.legacyReconciliation()) return;
    const line = this.lines.at(index);
    const draft = this.externalDraft();
    if (draft) {
      const sourceLineId = draft.lines[index]?.sourceLineId;
      if (!sourceLineId) return;
      this.lines.controls.forEach((entry, current) => {
        if (draft.lines[current]?.sourceLineId === sourceLineId) {
          entry.controls.target.setValue(value);
          this.updateQuantityValidator(entry);
        }
      });
      return;
    }
    line.controls.target.setValue(value);
    this.updateQuantityValidator(line);
  }
  targetForLine(line: SaleLineForm): SaleTarget | null {
    return this.parseTarget(line.controls.target.value);
  }
  availableQuantity(line: SaleLineForm): number | null {
    if (this.istBearbeitung()) return line.controls.quantity.value;
    if (this.legacyReconciliation()) return 1;
    const target = this.targetForLine(line);
    if (!target) return null;
    const capacity = target.kind === 'catalog_product' ? target.availableQuantity : 1;
    return remainingLineQuantity(
      capacity,
      this.lines.controls.map((entry) => entry.getRawValue()),
      line.controls.target.value,
      this.lines.controls.indexOf(line),
    );
  }

  async onSubmit(): Promise<void> {
    if (this.isPersisted() || this.isSubmitting()) return;
    if ((this.externalDraft() || this.workspaceService?.currentWorkspace()) && !this.canSave())
      return;
    if (this.workspaceService?.currentWorkspace()) this.validateSaleTargets();
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
      if (this.externalDraft()) {
        const submit = this.externalSubmit();
        if (!submit) throw new Error('Die externe Verkaufserfassung ist nicht verfügbar.');
        const result = await submit(input);
        if (result.status === 'rejected') {
          this.errorMessage.set(result.message);
          return;
        }
        if (result.status !== 'saved') {
          this.externalOutcomeBlocked.set(result.status === 'outcome_unknown');
          this.errorMessage.set(
            result.status === 'review_changed'
              ? 'Die Bestellung wurde geändert. Prüfe die aktuellen Angaben vor einer erneuten Buchung.'
              : 'Der Buchungsausgang ist unklar. Prüfe zuerst den Buchungsstatus.',
          );
          return;
        }
        this.isPersisted.set(true);
        if (this.destroyRef.destroyed) return;
        this.created.emit();
        this.closed.emit();
        return;
      }
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
      if (this.externalDraft()) {
        this.externalOutcomeBlocked.set(true);
        this.errorMessage.set('Der Buchungsausgang ist unklar. Prüfe zuerst den Buchungsstatus.');
        return;
      }
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
        (
          this.elementRef?.nativeElement.querySelector<HTMLElement>(
            '[data-sale-target-invalid="true"] button',
          ) ?? this.elementRef?.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')
        )?.focus(),
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
      platformFee: raw.platformFee ?? 0,
      shippingCost: raw.shippingCost ?? 0,
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
        if (!target) throw new Error('Bitte wähle für jede Position einen Artikel.');
        const value = line.getRawValue();
        return target.kind === 'catalog_product'
          ? {
              catalogProductId: target.catalogProductId,
              titleSnapshot: this.articleLabel(line),
              quantity: value.quantity,
              unitSalePrice: value.unitSalePrice,
            }
          : {
              inventoryItemId: target.inventoryItemId,
              titleSnapshot: this.articleLabel(line),
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
      platform_fee: raw.platformFee ?? 0,
      shipping_cost: raw.shippingCost ?? 0,
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
      line.controls.target.disable({ emitEvent: false });
      line.controls.quantity.disable({ emitEvent: false });
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
  private hasConfirmedExternalCosts(): boolean {
    const validAmount = (value: number | null) =>
      value !== null &&
      Number.isFinite(value) &&
      value >= 0 &&
      Number.isSafeInteger(Math.round(value * 100)) &&
      value <= 9999999999.99 &&
      Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
    return (
      validAmount(this.form.controls.platformFee.value) &&
      validAmount(this.form.controls.shippingCost.value) &&
      this.additionalCosts.controls.every((cost) => validAmount(cost.controls.amount.value))
    );
  }
  private externalSourceMatches(draft: ExternalSaleEntryDraft): boolean {
    if (
      this.sale() ||
      this.legacyReconciliation() ||
      draft.lines.length === 0 ||
      draft.lines.length > 400 ||
      draft.lines.length !== this.lines.length
    )
      return false;
    const raw = this.form.getRawValue();
    if (
      raw.platform !== draft.platform ||
      raw.saleDate !== draft.saleDate ||
      raw.externalOrderId !== draft.externalOrderId ||
      raw.shippingRevenue !== draft.shippingRevenue
    )
      return false;
    const targets = new Map<string, string>();
    return this.lines.controls.every((line, index) => {
      const source = draft.lines[index];
      const value = line.getRawValue();
      const available = this.availableQuantity(line);
      if (
        !source.sourceLineId ||
        value.quantity !== source.quantity ||
        value.unitSalePrice !== source.unitSalePrice ||
        !Number.isSafeInteger(source.quantity) ||
        source.quantity < 1 ||
        source.unitSalePrice <= 0 ||
        !this.targetForLine(line) ||
        available === null ||
        available < value.quantity
      )
        return false;
      const previous = targets.get(source.sourceLineId);
      if (previous && previous !== value.target) return false;
      targets.set(source.sourceLineId, value.target);
      return true;
    });
  }
  private fillExternalDraft(draft: ExternalSaleEntryDraft): void {
    const previous = this.previousExternalDraft;
    if (previous?.revision === draft.revision && previous.externalOrderId === draft.externalOrderId)
      return;
    const compatible =
      previous?.externalOrderId === draft.externalOrderId && previous.platform === draft.platform;
    const selected = new Map<string, string>();
    if (compatible && previous)
      previous.lines.forEach((source, index) => {
        const value = this.lines.controls[index]?.controls.target.value ?? '';
        if (selected.has(source.sourceLineId) && selected.get(source.sourceLineId) !== value)
          selected.set(source.sourceLineId, '');
        else if (!selected.has(source.sourceLineId)) selected.set(source.sourceLineId, value);
      });
    this.hasExplicitShippingMode = true;
    this.lines.clear({ emitEvent: false });
    draft.lines.forEach((source) => {
      const line = this.createLineForm();
      line.setValue(
        {
          target: selected.has(source.sourceLineId)
            ? (selected.get(source.sourceLineId) ?? '')
            : source.target
              ? this.targetValue(source.target)
              : '',
          quantity: source.quantity,
          unitSalePrice: source.unitSalePrice,
        },
        { emitEvent: false },
      );
      line.controls.quantity.disable({ emitEvent: false });
      line.controls.unitSalePrice.disable({ emitEvent: false });
      this.lines.push(line, { emitEvent: false });
    });
    this.form.patchValue(
      {
        platform: draft.platform,
        saleDate: draft.saleDate,
        externalOrderId: draft.externalOrderId,
        shippingRevenue: draft.shippingRevenue,
      },
      { emitEvent: false },
    );
    for (const control of [
      this.form.controls.platform,
      this.form.controls.saleDate,
      this.form.controls.externalOrderId,
      this.form.controls.shippingRevenue,
    ])
      control.disable({ emitEvent: false });
    this.form.controls.platformFee.setValidators([Validators.required, Validators.min(0)]);
    this.form.controls.shippingCost.setValidators([Validators.required, Validators.min(0)]);
    this.form.controls.shippingCost.enable({ emitEvent: false });
    if (!compatible) {
      this.form.patchValue(
        { platformFee: null, shippingCost: null, shippingMode: 'unknown', buyerNotes: '' },
        { emitEvent: false },
      );
      this.additionalCosts.clear({ emitEvent: false });
      this.form.markAsPristine();
    }
    this.previousExternalDraft = draft;
    this.externalOutcomeBlocked.set(false);
    this.errorMessage.set(null);
    this.form.controls.platformFee.updateValueAndValidity({ emitEvent: false });
    this.form.controls.shippingCost.updateValueAndValidity({ emitEvent: false });
    this.form.updateValueAndValidity();
  }
  private resetExternalDraft(): void {
    this.previousExternalDraft = null;
    this.externalOutcomeBlocked.set(false);
    this.hasExplicitShippingMode = false;
    this.form.controls.platformFee.setValidators([Validators.min(0)]);
    this.form.controls.shippingCost.setValidators([Validators.min(0)]);
    for (const control of [
      this.form.controls.platform,
      this.form.controls.saleDate,
      this.form.controls.externalOrderId,
      this.form.controls.shippingRevenue,
    ])
      control.enable({ emitEvent: false });
    this.lines.clear({ emitEvent: false });
    this.lines.push(this.createLineForm(), { emitEvent: false });
    this.additionalCosts.clear({ emitEvent: false });
    this.form.reset({
      platform: 'kleinanzeigen',
      saleDate: this.localToday(),
      platformFee: 0,
      shippingCost: 0,
      shippingRevenue: 0,
      shippingMode: 'pickup',
      externalOrderId: '',
      buyerNotes: '',
    });
    this.enforceShippingMode('pickup');
  }
  private setLineTarget(index: number, target: SaleTarget): void {
    if (this.externalDraft()) {
      this.onTargetChange(index, this.targetValue(target));
      return;
    }
    const line = this.lines.at(index);
    line.controls.target.setValue(this.targetValue(target));
    line.controls.quantity.setValue(1);
    if (this.legacyReconciliation()) {
      line.controls.target.disable({ emitEvent: false });
      line.controls.quantity.disable({ emitEvent: false });
    }
    this.updateQuantityValidator(line);
  }
  private updateQuantityValidator(line: SaleLineForm): void {
    const available = this.availableQuantity(line);
    line.controls.quantity.setValidators([
      Validators.required,
      Validators.min(1),
      (control) => (Number.isSafeInteger(control.value) ? null : { integer: true }),
      ...(available === null ? [] : [Validators.max(available)]),
    ]);
    line.controls.quantity.updateValueAndValidity({ emitEvent: false });
  }
  private lineCost(line: SaleLineForm): number | null {
    const target = this.targetForLine(line);
    const quantity = line.controls.quantity.value;
    if (!target) return null;
    const item =
      target.kind === 'inventory_item'
        ? this.inventoryService.items().find((entry) => entry.id === target.inventoryItemId)
        : undefined;
    const unitCost =
      target.kind === 'catalog_product'
        ? this.stockService
            .positions()
            .find((position) => position.catalog_product_id === target.catalogProductId)
            ?.oldest_available_unit_cost
        : item?.allocated_purchase_cost == null
          ? null
          : (item.total_item_cost ?? item.allocated_purchase_cost);
    return typeof unitCost === 'number' && Number.isFinite(unitCost) && unitCost >= 0
      ? unitCost * quantity
      : null;
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
    if (this.externalDraft()) {
      this.form.controls.shippingRevenue.disable({ emitEvent: false });
      this.form.controls.shippingCost.enable({ emitEvent: false });
      return;
    }
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
