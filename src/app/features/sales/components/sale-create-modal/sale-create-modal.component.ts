import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import {
  LucideDynamicIcon,
  LucideX as X,
  LucidePlus as Plus,
  LucideTrendingUp as TrendingUp,
  LucideDollarSign as DollarSign,
  LucideCalendar as Calendar,
  LucideTag as Tag,
  LucideShieldCheck as ShieldCheck,
} from '@lucide/angular';
import { SalesService, CreateSalePayload } from '../../../../core/services/sales.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { ProfitEngineService } from '../../../../core/services/profit-engine.service';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { Sale } from '../../../../core/models/flipbase.models';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';

interface SaleSubmitResult {
  readonly data?: Sale | null;
  readonly error: Error | null;
  readonly status?: 'success' | 'partial' | 'error';
  readonly problems?: readonly {
    readonly kind: 'inventory_status' | 'sale_return_status';
    readonly error: Error;
    readonly reportedBySyncStatus: boolean;
  }[];
}

@Component({
  selector: 'app-sale-create-modal',
  imports: [
    ModalDialogDirective,
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
  /**
   * Vorgaben fuer die eigenen Auswahlfelder.
   *
   * Die Liste haengt am Bestand und aendert sich zur Laufzeit, deshalb ein
   * berechneter Wert. Ein natives Auswahlfeld klappt eine Liste auf, die das
   * Betriebssystem zeichnet - hell und mit fremder Schrift; deshalb
   * uebernimmt `app-custom-select`.
   */
  readonly artikelOptionen = computed<SelectOption<string>[]>(() => [
    { value: '', label: '-- Artikel aus Inventar auswählen --' },
    ...this.availableItems().map((item) => ({
      value: item.id,
      label: `${item.title} (EK: ${(item.total_item_cost ?? 0).toFixed(2).replace('.', ',')} €)`,
    })),
  ]);

  readonly plattformOptionen: SelectOption<string>[] = [
    { value: 'kleinanzeigen', label: 'Kleinanzeigen (0% Gebühr)' },
    { value: 'ebay', label: 'eBay (~11% Gebühr)' },
    { value: 'vinted', label: 'Vinted (0% Verkäufer)' },
    { value: 'direct', label: 'Direktverkauf (0%)' },
    { value: 'other', label: 'Andere' },
  ];

  readonly preselectedItemId = input<string | null>(null);

  private readonly salesService = inject(SalesService);
  readonly inventoryService = inject(InventoryService);
  private readonly profitEngine = inject(ProfitEngineService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);

  readonly closed = output<void>();
  readonly created = output<void>();

  /** Der zu bearbeitende Verkauf - fehlt er, wird ein neuer gebucht. */
  readonly sale = input<Sale | null>(null);

  readonly istBearbeitung = computed(() => this.sale() !== null);

  /** Beschriftung der Absende-Schaltflaeche - im Template gehoert keine Logik. */
  readonly absendeBeschriftung = computed(() => {
    if (this.isSubmitting()) return 'Speichere...';
    return this.istBearbeitung() ? 'Änderungen speichern' : 'Verkauf abschließen';
  });

  readonly closeIcon = X;
  readonly plusIcon = Plus;
  readonly trendingIcon = TrendingUp;
  readonly dollarIcon = DollarSign;
  readonly calendarIcon = Calendar;
  readonly tagIcon = Tag;
  readonly shieldIcon = ShieldCheck;

  readonly isSubmitting = signal<boolean>(false);
  readonly isPersisted = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = new FormGroup({
    inventory_item_id: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    platform: new FormControl<string>('kleinanzeigen', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    sale_price: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.01)],
    }),
    sale_date: new FormControl<string>(new Date().toISOString().split('T')[0], {
      nonNullable: true,
      validators: [Validators.required],
    }),
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
    return list.filter(
      (item) => (item.status !== 'sold' && item.status !== 'archived') || item.id === preId,
    );
  });

  // Currently selected item for live math
  readonly selectedItem = computed(() => {
    const currentId = this.form.get('inventory_item_id')?.value || this.preselectedItemId();
    return this.inventoryService.items().find((i) => i.id === currentId) || null;
  });

  // Live Calculations
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

    // Bearbeitung: Werte des vorhandenen Verkaufs uebernehmen.
    effect(() => {
      const vorhandener = this.sale();
      if (!vorhandener) return;

      this.form.patchValue({
        inventory_item_id: vorhandener.inventory_item_id ?? '',
        platform: vorhandener.platform,
        sale_price: vorhandener.sale_price,
        sale_date: vorhandener.sale_date,
        platform_fee: vorhandener.platform_fee ?? 0,
        shipping_cost: vorhandener.shipping_cost ?? 0,
        packaging_cost: vorhandener.packaging_cost ?? 0,
        other_costs: vorhandener.other_costs ?? 0,
        external_order_id: vorhandener.external_order_id ?? '',
        buyer_notes: vorhandener.buyer_notes ?? '',
      });
    });
  }

  updateLiveCalculation(): void {
    const f = this.form.getRawValue();
    const item = this.inventoryService.items().find((i) => i.id === f.inventory_item_id);

    const itemBaseCost = item ? (item.total_item_cost ?? item.allocated_purchase_cost) : 0;
    const saleFees =
      (f.platform_fee || 0) +
      (f.shipping_cost || 0) +
      (f.packaging_cost || 0) +
      (f.other_costs || 0);
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
    if (this.form.invalid || this.isPersisted()) return;

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

    const vorhandener = this.sale();
    let ergebnis: SaleSubmitResult;
    try {
      ergebnis = vorhandener
        ? await this.salesService.updateSale(vorhandener.id, payload)
        : await this.salesService.createSale(payload);
    } catch (ursache: unknown) {
      ergebnis = {
        error:
          ursache instanceof Error
            ? ursache
            : new Error('Der Verkauf konnte nicht gespeichert werden.'),
        status: 'error',
      };
    } finally {
      this.isSubmitting.set(false);
    }

    if (ergebnis.error) {
      this.errorMessage.set(ergebnis.error.message);
      if (ergebnis.status === 'partial') {
        const ungemeldeteProbleme = (ergebnis.problems ?? []).filter(
          (problem) => !problem.reportedBySyncStatus,
        );
        if (ergebnis.data && ungemeldeteProbleme.length > 0) {
          this.toast.warning(
            'Verkauf wurde mit Einschränkungen abgeschlossen.',
            beschreibeTeilprobleme(ungemeldeteProbleme),
          );
        }
        if (ergebnis.data) {
          this.isPersisted.set(true);
          this.created.emit();
          this.closed.emit();
        }
        return;
      }
      if (!this.syncStatus.istZentralGemeldet(ergebnis.error)) {
        this.toast.error(
          vorhandener
            ? 'Verkauf konnte nicht gespeichert werden.'
            : 'Verkauf konnte nicht abgeschlossen werden.',
          ergebnis.error.message,
        );
      }
      return;
    }

    this.isPersisted.set(true);
    this.toast.success(vorhandener ? 'Verkauf wurde gespeichert.' : 'Verkauf wurde abgeschlossen.');
    this.created.emit();
    this.closed.emit();
  }
}

function beschreibeTeilprobleme(
  problems: readonly { readonly kind: 'inventory_status' | 'sale_return_status' }[],
): string {
  if (problems.some((problem) => problem.kind === 'inventory_status')) {
    return 'Der Artikelstatus wird automatisch nachgeholt.';
  }
  return 'Der Retourenvermerk wird automatisch nachgeholt.';
}
