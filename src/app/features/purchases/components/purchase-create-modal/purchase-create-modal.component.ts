import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  X,
  Plus,
  ShoppingBag,
  Package,
  Layers,
  Boxes,
  PlusCircle,
  Trash2,
  Truck,
} from 'lucide-angular';
import { PurchaseService, CreatePurchasePayload } from '../../../../core/services/purchase.service';
import { SourcesService } from '../../../../core/services/sources.service';
import { SuppliersService } from '../../../../core/services/suppliers.service';
import { InboundTrackingService } from '../../../../core/services/inbound-tracking.service';
import { PurchaseType, ItemCondition, TrackingCarrier } from '../../../../core/models/reflip.models';

interface ExtraCostEntry {
  type: string;
  amount: number;
  description: string;
}

@Component({
  selector: 'app-purchase-create-modal',
  imports: [ReactiveFormsModule, LucideAngularModule],
  templateUrl: './purchase-create-modal.component.html',
  styleUrl: './purchase-create-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCreateModalComponent {
  private readonly purchaseService = inject(PurchaseService);
  readonly sourcesService = inject(SourcesService);
  readonly suppliersService = inject(SuppliersService);
  readonly trackingService = inject(InboundTrackingService);

  readonly close = output<void>();
  readonly created = output<void>();

  readonly closeIcon = X;
  readonly plusIcon = Plus;
  readonly plusCircleIcon = PlusCircle;
  readonly trashIcon = Trash2;
  readonly bagIcon = ShoppingBag;
  readonly packageIcon = Package;
  readonly layersIcon = Layers;
  readonly boxesIcon = Boxes;
  readonly truckIcon = Truck;

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
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    source_id: new FormControl<string | null>(null),
    supplier_id: new FormControl<string | null>(null),
    purchase_date: new FormControl<string>(new Date().toISOString().split('T')[0], { nonNullable: true, validators: [Validators.required] }),
    purchase_price: new FormControl<number>(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    tracking_number: new FormControl<string>(''),
    tracking_carrier: new FormControl<TrackingCarrier | null>(null),
    original_url: new FormControl<string>(''),
    notes: new FormControl<string>(''),
    // Single item specific fields
    single_item_condition: new FormControl<ItemCondition>('used', { nonNullable: true }),
    single_item_expected_value: new FormControl<number | null>(null),
  });

  addCostRow(): void {
    this.extraCosts.update((costs) => [
      ...costs,
      { type: 'shipping', amount: 0, description: '' },
    ]);
  }

  removeCostRow(index: number): void {
    this.extraCosts.update((costs) => costs.filter((_, i) => i !== index));
  }

  updateCostField(index: number, field: keyof ExtraCostEntry, value: any): void {
    this.extraCosts.update((costs) =>
      costs.map((c, i) => (i === index ? { ...c, [field]: field === 'amount' ? Number(value) || 0 : value } : c))
    );
  }

  async saveNewSource(): Promise<void> {
    const name = this.newSourceName().trim();
    if (!name) return;
    const { data } = await this.sourcesService.createSource(name);
    if (data) {
      this.form.patchValue({ source_id: data.id });
      this.newSourceName.set('');
      this.isAddingSource.set(false);
    }
  }

  async saveNewSupplier(): Promise<void> {
    const name = this.newSupplierName().trim();
    if (!name) return;
    const { data } = await this.suppliersService.createSupplier(name);
    if (data) {
      this.form.patchValue({ supplier_id: data.id });
      this.newSupplierName.set('');
      this.isAddingSupplier.set(false);
    }
  }

  onTrackingNumberInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (val && val.trim()) {
      const detected = this.trackingService.autoDetectCarrier(val);
      this.form.patchValue({ tracking_carrier: detected });
    }
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
      tracking_carrier: f.tracking_carrier || (f.tracking_number ? this.trackingService.autoDetectCarrier(f.tracking_number) : null),
      original_url: f.original_url || null,
      notes: f.notes || null,
      initial_costs: this.extraCosts().filter((c) => c.amount > 0),
      single_item_condition: f.single_item_condition,
      single_item_expected_value: f.single_item_expected_value || undefined,
    };

    const { error } = await this.purchaseService.createPurchase(payload);
    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.created.emit();
      this.close.emit();
    }
  }
}
