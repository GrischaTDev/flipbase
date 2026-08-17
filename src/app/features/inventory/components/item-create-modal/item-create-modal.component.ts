import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule, X, Plus, Boxes, Sparkles } from 'lucide-angular';
import { InventoryService, CreateItemPayload } from '../../../../core/services/inventory.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { AiAssistantService } from '../../../../core/services/ai-assistant.service';
import { DatePipe } from '@angular/common';
import { ItemCondition, ItemStatus } from '../../../../core/models/reflip.models';

@Component({
  selector: 'app-item-create-modal',
  imports: [ReactiveFormsModule, DatePipe, LucideAngularModule],
  templateUrl: './item-create-modal.component.html',
  styleUrl: './item-create-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemCreateModalComponent {
  private readonly inventoryService = inject(InventoryService);
  readonly purchaseService = inject(PurchaseService);
  readonly aiService = inject(AiAssistantService);

  readonly close = output<void>();
  readonly created = output<void>();

  readonly closeIcon = X;
  readonly plusIcon = Plus;
  readonly boxesIcon = Boxes;
  readonly sparklesIcon = Sparkles;

  readonly isSubmitting = signal<boolean>(false);
  readonly isAiLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  async onAiAutofill(): Promise<void> {
    const rawTitle = this.form.get('title')?.value;
    if (!rawTitle || !rawTitle.trim()) return;

    this.isAiLoading.set(true);
    const ai = await this.aiService.identifyProduct(rawTitle);
    this.isAiLoading.set(false);

    this.form.patchValue({
      title: ai.cleanTitle,
      brand: ai.brand || this.form.get('brand')?.value,
      model: ai.model || this.form.get('model')?.value,
      category: ai.category || this.form.get('category')?.value,
      condition: ai.condition || this.form.get('condition')?.value,
      expected_value: ai.estimatedMarketPrice || this.form.get('expected_value')?.value,
    });
  }

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    category: new FormControl(''),
    brand: new FormControl(''),
    model: new FormControl(''),
    condition: new FormControl<ItemCondition>('used', { nonNullable: true }),
    status: new FormControl<ItemStatus>('received', { nonNullable: true }),
    allocated_purchase_cost: new FormControl<number>(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    expected_value: new FormControl<number | null>(null),
    purchase_id: new FormControl<string | null>(null),
    sku: new FormControl(''),
    ean: new FormControl(''),
    description: new FormControl(''),
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const f = this.form.getRawValue();
    const payload: CreateItemPayload = {
      title: f.title,
      category: f.category || null,
      brand: f.brand || null,
      model: f.model || null,
      condition: f.condition,
      status: f.status,
      allocated_purchase_cost: f.allocated_purchase_cost,
      expected_value: f.expected_value || null,
      purchase_id: f.purchase_id || null,
      sku: f.sku || null,
      ean: f.ean || null,
      description: f.description || null,
    };

    const { error } = await this.inventoryService.createItem(payload);
    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.created.emit();
      this.close.emit();
    }
  }
}
