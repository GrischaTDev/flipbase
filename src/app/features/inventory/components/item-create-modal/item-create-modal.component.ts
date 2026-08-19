import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule, X, Plus, Boxes, Sparkles, Camera, Barcode, Image, Trash2, Crop } from 'lucide-angular';
import { InventoryService, CreateItemPayload } from '../../../../core/services/inventory.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { MediaService } from '../../../../core/services/media.service';
import { AiAssistantService, AiVisualScanResult } from '../../../../core/services/ai-assistant.service';
import { BarcodeLookupService } from '../../../../core/services/barcode-lookup.service';
import { BarcodeScannerComponent } from '../../../../shared/components/barcode-scanner/barcode-scanner.component';
import { AiPhotoScannerModalComponent } from '../../../../shared/components/ai-photo-scanner-modal/ai-photo-scanner-modal.component';
import { ImageCropperModalComponent, CroppedImageResult } from '../../../../shared/components/image-cropper-modal/image-cropper-modal.component';
import { DatePipe } from '@angular/common';
import { ItemCondition, ItemStatus } from '../../../../core/models/reflip.models';

import { CustomSelectComponent, SelectOption } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';

@Component({
  selector: 'app-item-create-modal',
  imports: [ModalDialogDirective, 
    ReactiveFormsModule,
    DatePipe,
    LucideAngularModule,
    BarcodeScannerComponent,
    AiPhotoScannerModalComponent,
    ImageCropperModalComponent,
    CustomSelectComponent,
  ],
  templateUrl: './item-create-modal.component.html',
  styleUrl: './item-create-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemCreateModalComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly mediaService = inject(MediaService);
  readonly purchaseService = inject(PurchaseService);
  readonly aiService = inject(AiAssistantService);
  readonly barcodeLookup = inject(BarcodeLookupService);

  readonly conditionOptions: SelectOption<ItemCondition>[] = [
    { value: 'new', label: 'Neu / OVP' },
    { value: 'like_new', label: 'Wie neu' },
    { value: 'very_good', label: 'Sehr gut' },
    { value: 'used', label: 'Gebraucht' },
    { value: 'heavily_used', label: 'Stark gebraucht' },
    { value: 'defective', label: 'Defekt / Ersatzteil' },
  ];

  readonly statusOptions: SelectOption<ItemStatus>[] = [
    { value: 'received', label: 'Auf Lager', badgeClass: 'bg-blue-400' },
    { value: 'ready', label: 'Bereit', badgeClass: 'bg-amber-400' },
    { value: 'listed', label: 'Gelistet', badgeClass: 'bg-emerald-400' },
    { value: 'sold', label: 'Verkauft', badgeClass: 'bg-purple-400' },
    { value: 'reserved', label: 'Reserviert', badgeClass: 'bg-slate-400' },
    { value: 'defective', label: 'Defekt / Ersatzteil', badgeClass: 'bg-rose-400' },
  ];

  readonly close = output<void>();
  readonly created = output<void>();

  readonly closeIcon = X;
  readonly plusIcon = Plus;
  readonly boxesIcon = Boxes;
  readonly sparklesIcon = Sparkles;
  readonly cameraIcon = Camera;
  readonly barcodeIcon = Barcode;
  readonly imageIcon = Image;
  readonly trashIcon = Trash2;
  readonly cropIcon = Crop;

  readonly isSubmitting = signal<boolean>(false);
  readonly isAiLoading = signal<boolean>(false);
  readonly isScanningBarcode = signal<boolean>(false);
  readonly isScanningPhoto = signal<boolean>(false);
  readonly isCropperOpen = signal<boolean>(false);
  readonly selectedImageFile = signal<File | null>(null);
  readonly selectedImageDataUrl = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly form = new FormGroup({
    purchase_id: new FormControl<string | null>(null),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    category: new FormControl(''),
    brand: new FormControl(''),
    model: new FormControl(''),
    condition: new FormControl<ItemCondition>('very_good', { nonNullable: true, validators: [Validators.required] }),
    status: new FormControl<ItemStatus>('received', { nonNullable: true }),
    sku: new FormControl(''),
    ean: new FormControl(''),
    description: new FormControl(''),
    condition_notes: new FormControl(''),
    allocated_purchase_cost: new FormControl<number>(0, { nonNullable: true, validators: [Validators.min(0)] }),
    expected_value: new FormControl<number | null>(null, { validators: [Validators.min(0)] }),
  });

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

  onPhotoScanned(res: AiVisualScanResult): void {
    this.isScanningPhoto.set(false);
    this.form.patchValue({
      title: res.title,
      brand: res.brand || this.form.get('brand')?.value,
      model: res.model || this.form.get('model')?.value,
      category: res.category || this.form.get('category')?.value,
      condition: res.condition || this.form.get('condition')?.value,
      expected_value: res.estimatedMarketValue || this.form.get('expected_value')?.value,
      condition_notes: res.conditionNotes || this.form.get('condition_notes')?.value,
    });
  }

  async onBarcodeScanned(ean: string): Promise<void> {
    this.isScanningBarcode.set(false);
    this.form.patchValue({ ean });

    const info = await this.barcodeLookup.lookupByEan(ean);
    if (info) {
      this.form.patchValue({
        title: info.title || this.form.get('title')?.value,
        brand: info.brand || this.form.get('brand')?.value,
        category: info.category || this.form.get('category')?.value,
        expected_value: info.estimatedPrice || this.form.get('expected_value')?.value,
      });
    }
  }

  prefillWithAiResult(res: AiVisualScanResult): void {
    this.form.patchValue({
      title: res.title,
      brand: res.brand || '',
      model: res.model || '',
      category: res.category || '',
      condition: res.condition || 'very_good',
      expected_value: res.estimatedMarketValue || null,
      condition_notes: res.conditionNotes || '',
    });
  }

  onImageCropped(result: CroppedImageResult): void {
    this.selectedImageFile.set(result.file);
    this.selectedImageDataUrl.set(result.dataUrl);
    this.isCropperOpen.set(false);
  }

  removeSelectedImage(): void {
    this.selectedImageFile.set(null);
    this.selectedImageDataUrl.set(null);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const val = this.form.getRawValue();
    const payload: CreateItemPayload = {
      purchase_id: val.purchase_id || undefined,
      title: val.title.trim(),
      category: val.category?.trim() || undefined,
      brand: val.brand?.trim() || undefined,
      model: val.model?.trim() || undefined,
      condition: val.condition,
      status: val.status,
      sku: val.sku?.trim() || undefined,
      ean: val.ean?.trim() || undefined,
      description: val.description?.trim() || undefined,
      allocated_purchase_cost: val.allocated_purchase_cost,
      expected_value: val.expected_value || undefined,
    };

    const { data: createdItem, error } = await this.inventoryService.createItem(payload);

    if (createdItem && this.selectedImageFile()) {
      try {
        await this.mediaService.uploadItemMedia(createdItem.id, this.selectedImageFile()!, true);
      } catch (uploadErr) {
        console.warn('Image upload error on item create:', uploadErr);
      }
    }

    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.created.emit();
      this.close.emit();
    }
  }
}
