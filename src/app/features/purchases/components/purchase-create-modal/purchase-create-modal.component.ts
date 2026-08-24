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
import {
  LucideDynamicIcon,
  LucideX as X,
  LucidePlus as Plus,
  LucideShoppingBag as ShoppingBag,
  LucidePackage as Package,
  LucideLayers as Layers,
  LucideBoxes as Boxes,
  LucidePlusCircle as PlusCircle,
  LucideTrash2 as Trash2,
  LucideTruck as Truck,
} from '@lucide/angular';
import {
  beschreibePurchaseProblem,
  CreatePurchasePayload,
  CreatePurchaseResult,
  PurchaseService,
} from '../../../../core/services/purchase.service';
import { SourcesService } from '../../../../core/services/sources.service';
import { SuppliersService } from '../../../../core/services/suppliers.service';
import { InboundTrackingService } from '../../../../core/services/inbound-tracking.service';
import {
  PurchaseType,
  ItemCondition,
  TrackingCarrier,
} from '../../../../core/models/flipbase.models';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { Purchase } from '../../../../core/models/flipbase.models';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';

interface ExtraCostEntry {
  type: string;
  amount: number;
  description: string;
}

@Component({
  selector: 'app-purchase-create-modal',
  imports: [
    ModalDialogDirective,
    ReactiveFormsModule,
    LucideDynamicIcon,
    NumberInputComponent,
    CustomSelectComponent,
    DatePickerComponent,
  ],
  templateUrl: './purchase-create-modal.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCreateModalComponent {
  private readonly purchaseService = inject(PurchaseService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  readonly sourcesService = inject(SourcesService);
  readonly suppliersService = inject(SuppliersService);
  readonly trackingService = inject(InboundTrackingService);

  readonly closed = output<void>();
  readonly created = output<void>();

  /** Der zu bearbeitende Einkauf - fehlt er, wird ein neuer angelegt. */
  readonly purchase = input<Purchase | null>(null);

  readonly istBearbeitung = computed(() => this.purchase() !== null);

  readonly closeIcon = X;
  readonly plusIcon = Plus;
  readonly plusCircleIcon = PlusCircle;
  readonly trashIcon = Trash2;
  readonly bagIcon = ShoppingBag;
  readonly packageIcon = Package;
  readonly layersIcon = Layers;
  readonly boxesIcon = Boxes;
  readonly truckIcon = Truck;

  /**
   * Die Zustaende als Liste statt als feste Auswahlfeld-Eintraege.
   *
   * Ein natives Auswahlfeld klappt eine Liste auf, die das Betriebssystem
   * zeichnet - in seinen Farben, nicht in denen der Anwendung. Deshalb
   * uebernimmt `app-custom-select`, und die Eintraege kommen von hier.
   */
  readonly kostenartOptionen: SelectOption<string>[] = [
    { value: 'shipping', label: 'Versand' },
    { value: 'travel', label: 'Fahrtkosten / Sprit' },
    { value: 'packaging', label: 'Verpackungsmaterial' },
    { value: 'transport', label: 'Spedition / Transport' },
    { value: 'customs', label: 'Zoll' },
    { value: 'import', label: 'Zoll / Importabgaben' },
    { value: 'fee', label: 'Gebühren' },
    { value: 'other', label: 'Sonstiges' },
  ];

  /** Quellen und Lieferanten kommen aus den Stammdaten und aendern sich zur Laufzeit. */
  readonly quellenOptionen = computed<SelectOption<string | null>[]>(() => [
    { value: null, label: '-- Quelle wählen --' },
    ...this.sourcesService.sources().map((q) => ({ value: q.id, label: q.name })),
  ]);

  readonly lieferantenOptionen = computed<SelectOption<string | null>[]>(() => [
    { value: null, label: '-- Optional: Lieferant wählen --' },
    ...this.suppliersService.suppliers().map((l) => ({ value: l.id, label: l.name })),
  ]);

  readonly dienstleisterOptionen = computed<SelectOption<string | null>[]>(() => [
    { value: null, label: 'Auto-Erkennung' },
    ...this.trackingService.carrierOptions.map((c) => ({ value: c.value, label: c.label })),
  ]);

  readonly zustandsOptionen: SelectOption<string>[] = [
    { value: 'new', label: 'Neu / OVP' },
    { value: 'like_new', label: 'Wie neu' },
    { value: 'very_good', label: 'Sehr gut' },
    { value: 'used', label: 'Gebraucht' },
    { value: 'heavily_used', label: 'Stark gebraucht' },
    { value: 'defective', label: 'Defekt / Ersatzteil' },
  ];

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  // Quick add states
  readonly isAddingSource = signal<boolean>(false);
  readonly isAddingSupplier = signal<boolean>(false);
  readonly newSourceName = signal<string>('');
  readonly newSupplierName = signal<string>('');

  // Additional costs list
  readonly extraCosts = signal<ExtraCostEntry[]>([]);

  readonly form = new FormGroup({
    type: new FormControl<PurchaseType>('single', { nonNullable: true }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    source_id: new FormControl<string | null>(null),
    supplier_id: new FormControl<string | null>(null),
    purchase_date: new FormControl<string>(new Date().toISOString().split('T')[0], {
      nonNullable: true,
      validators: [Validators.required],
    }),
    purchase_price: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    tracking_number: new FormControl<string>(''),
    tracking_carrier: new FormControl<TrackingCarrier | null>(null),
    original_url: new FormControl<string>(''),
    notes: new FormControl<string>(''),
    // Single item specific fields
    single_item_condition: new FormControl<ItemCondition>('used', { nonNullable: true }),
    single_item_expected_value: new FormControl<number | null>(null),
  });

  addCostRow(): void {
    this.extraCosts.update((costs) => [...costs, { type: 'shipping', amount: 0, description: '' }]);
  }

  removeCostRow(index: number): void {
    this.extraCosts.update((costs) => costs.filter((_, i) => i !== index));
  }

  updateCostField(index: number, field: keyof ExtraCostEntry, value: string | number | null): void {
    this.extraCosts.update((costs) =>
      costs.map((cost, currentIndex) => {
        if (currentIndex !== index) return cost;
        if (field === 'amount') return { ...cost, amount: Number(value) || 0 };
        return { ...cost, [field]: String(value ?? '') };
      }),
    );
  }

  async saveNewSource(): Promise<void> {
    const name = this.newSourceName().trim();
    if (!name) return;
    let ergebnis: Awaited<ReturnType<SourcesService['createSource']>>;
    try {
      ergebnis = await this.sourcesService.createSource(name);
    } catch (ursache: unknown) {
      ergebnis = { data: null, error: this.alsError(ursache) };
    }
    const { data, error } = ergebnis;
    if (error || !data) {
      const ursache = error ?? new Error('Die Quelle wurde nicht zurückgegeben.');
      this.errorMessage.set(ursache.message);
      this.meldeFehlerWennNichtSynchronisiert('Quelle konnte nicht angelegt werden.', ursache);
      return;
    }
    this.form.patchValue({ source_id: data.id });
    this.newSourceName.set('');
    this.isAddingSource.set(false);
    this.toast.success('Quelle wurde angelegt.');
  }

  async saveNewSupplier(): Promise<void> {
    const name = this.newSupplierName().trim();
    if (!name) return;
    let ergebnis: Awaited<ReturnType<SuppliersService['createSupplier']>>;
    try {
      ergebnis = await this.suppliersService.createSupplier(name);
    } catch (ursache: unknown) {
      ergebnis = { data: null, error: this.alsError(ursache) };
    }
    const { data, error } = ergebnis;
    if (error || !data) {
      const ursache = error ?? new Error('Der Lieferant wurde nicht zurückgegeben.');
      this.errorMessage.set(ursache.message);
      this.meldeFehlerWennNichtSynchronisiert('Lieferant konnte nicht angelegt werden.', ursache);
      return;
    }
    this.form.patchValue({ supplier_id: data.id });
    this.newSupplierName.set('');
    this.isAddingSupplier.set(false);
    this.toast.success('Lieferant wurde angelegt.');
  }

  onTrackingNumberInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (val && val.trim()) {
      const detected = this.trackingService.autoDetectCarrier(val);
      this.form.patchValue({ tracking_carrier: detected });
    }
  }

  /**
   * Der Einkauf, dessen Angaben bereits im Formular stehen.
   *
   * Bewusst kein Signal: Der Einkauf kommt als abgeleiteter Wert herein und
   * wird neu berechnet, sobald sich anderswo etwas am Bestand aendert. Ohne
   * diese Bremse haette jede solche Neuberechnung das Formular
   * zurueckgesetzt - mitten im Tippen.
   */
  private befuelltFuer: string | null = null;

  constructor() {
    effect(() => {
      const vorhandener = this.purchase();
      if (!vorhandener || this.befuelltFuer === vorhandener.id) return;
      this.befuelltFuer = vorhandener.id;

      this.form.patchValue({
        type: vorhandener.type,
        title: vorhandener.title,
        source_id: vorhandener.source_id ?? null,
        supplier_id: vorhandener.supplier_id ?? null,
        purchase_date: vorhandener.purchase_date,
        purchase_price: vorhandener.purchase_price,
        original_url: vorhandener.original_url ?? '',
        notes: vorhandener.notes ?? '',
        tracking_number: vorhandener.tracking_number ?? '',
        tracking_carrier: vorhandener.tracking_carrier ?? null,
      });

      // Ohne die vorhandenen Zeilen waere das Speichern ein Loeschen: Der
      // Dialog schickt immer die vollstaendige Liste.
      this.extraCosts.set(
        (vorhandener.costs ?? []).map((k) => ({
          type: k.type,
          amount: Number(k.amount),
          description: k.description ?? '',
        })),
      );
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const f = this.form.getRawValue();
    const payload: CreatePurchasePayload = {
      type: f.type,
      title: f.title,
      source_id: f.source_id,
      supplier_id: f.supplier_id,
      purchase_date: f.purchase_date,
      purchase_price: f.purchase_price,
      tracking_number: f.tracking_number?.trim() || null,
      tracking_carrier:
        f.tracking_carrier ||
        (f.tracking_number ? this.trackingService.autoDetectCarrier(f.tracking_number) : null),
      original_url: f.original_url || null,
      notes: f.notes || null,
      initial_costs: this.extraCosts().filter((c) => c.amount > 0),
      single_item_condition: f.single_item_condition,
      single_item_expected_value: f.single_item_expected_value || undefined,
    };

    const vorhandener = this.purchase();
    let speicherergebnis: { error: Error | null };
    let anlegeergebnis: CreatePurchaseResult | null = null;
    try {
      if (vorhandener) {
        speicherergebnis = await this.speichereAenderung(vorhandener.id, payload);
      } else {
        anlegeergebnis = await this.purchaseService.createPurchase(payload);
        speicherergebnis = { error: anlegeergebnis.error };
      }
    } catch (ursache: unknown) {
      speicherergebnis = { error: this.alsError(ursache) };
    }
    this.isSubmitting.set(false);
    const { error } = speicherergebnis;

    if (anlegeergebnis?.status === 'partial') {
      const ungemeldeteProbleme = anlegeergebnis.problems.filter(
        (problem) => !problem.reportedBySyncStatus,
      );
      if (ungemeldeteProbleme.length > 0) {
        this.toast.warning(
          'Einkauf wurde angelegt, aber nicht vollständig.',
          ungemeldeteProbleme.map(beschreibePurchaseProblem).join('\n'),
        );
      }
      this.created.emit();
      this.closed.emit();
      return;
    }

    if (error) {
      this.errorMessage.set(error.message);
      if (!anlegeergebnis?.reportedBySyncStatus) {
        this.meldeFehlerWennNichtSynchronisiert(
          vorhandener
            ? 'Einkauf konnte nicht gespeichert werden.'
            : 'Einkauf konnte nicht angelegt werden.',
          error,
        );
      }
    } else {
      this.toast.success(vorhandener ? 'Einkauf wurde gespeichert.' : 'Einkauf wurde angelegt.');
      this.created.emit();
      this.closed.emit();
    }
  }

  /**
   * Uebernimmt die Aenderungen an einem vorhandenen Einkauf.
   *
   * Zwei Schritte, weil die Zusatzkosten in einer eigenen Tabelle stehen. Die
   * Kosten kommen nur dran, wenn die Stammangaben durchgingen - sonst stuenden
   * neue Kostenzeilen an einem Einkauf, dessen Aenderung gescheitert ist.
   */
  private async speichereAenderung(
    id: string,
    payload: CreatePurchasePayload,
  ): Promise<{ error: Error | null }> {
    const { error } = await this.purchaseService.updatePurchase(id, {
      type: payload.type,
      title: payload.title,
      purchase_date: payload.purchase_date,
      purchase_price: payload.purchase_price,
      source_id: payload.source_id ?? null,
      supplier_id: payload.supplier_id ?? null,
      original_url: payload.original_url ?? null,
      notes: payload.notes ?? null,
      tracking_number: payload.tracking_number ?? null,
      tracking_carrier: payload.tracking_carrier ?? null,
    });
    if (error) return { error };

    return this.purchaseService.ersetzeZusatzkosten(id, this.extraCosts());
  }

  private meldeFehlerWennNichtSynchronisiert(title: string, error: Error): void {
    const zentralGemeldet = this.syncStatus
      .fehler()
      .some((eintrag) => error.message === `${eintrag.vorgang} fehlgeschlagen: ${eintrag.meldung}`);
    if (!zentralGemeldet) this.toast.error(title, error.message);
  }

  private alsError(ursache: unknown): Error {
    return ursache instanceof Error ? ursache : new Error('Die Aktion ist fehlgeschlagen.');
  }
}
