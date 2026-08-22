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
  LucideBoxes as Boxes,
  LucideSparkles as Sparkles,
  LucideCamera as Camera,
  LucideBarcode as Barcode,
  LucideImage as Image,
  LucideTrash2 as Trash2,
  LucideCrop as Crop,
} from '@lucide/angular';
import { InventoryService, CreateItemPayload } from '../../../../core/services/inventory.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { MediaService } from '../../../../core/services/media.service';
import {
  AiAssistantService,
  AiVisualScanResult,
} from '../../../../core/services/ai-assistant.service';
import { BarcodeLookupService } from '../../../../core/services/barcode-lookup.service';
import { BarcodeScannerComponent } from '../../../../shared/components/barcode-scanner/barcode-scanner.component';
import { AiPhotoScannerModalComponent } from '../../../../shared/components/ai-photo-scanner-modal/ai-photo-scanner-modal.component';
import {
  ImageCropperModalComponent,
  CroppedImageResult,
} from '../../../../shared/components/image-cropper-modal/image-cropper-modal.component';
import { InventoryItem, ItemCondition, ItemStatus } from '../../../../core/models/flipbase.models';

import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { LoggerService } from '../../../../core/services/logger.service';

@Component({
  selector: 'app-item-create-modal',
  imports: [
    ModalDialogDirective,
    ReactiveFormsModule,
    LucideDynamicIcon,
    BarcodeScannerComponent,
    AiPhotoScannerModalComponent,
    ImageCropperModalComponent,
    CustomSelectComponent,
  ],
  templateUrl: './item-create-modal.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemCreateModalComponent {
  /**
   * Vorgaben fuer die eigenen Auswahlfelder.
   *
   * Die Liste haengt am Bestand und aendert sich zur Laufzeit, deshalb ein
   * berechneter Wert. Ein natives Auswahlfeld klappt eine Liste auf, die das
   * Betriebssystem zeichnet - hell und mit fremder Schrift; deshalb
   * uebernimmt `app-custom-select`.
   */
  readonly einkaufsOptionen = computed<SelectOption<string>[]>(() => [
    { value: '', label: '-- Kein Einkauf zugeordnet --' },
    ...this.purchaseService.purchases().map((p) => ({
      value: p.id,
      label: `${p.title} (${new Date(p.purchase_date).toLocaleDateString('de-DE')})`,
    })),
  ]);

  private readonly inventoryService = inject(InventoryService);
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
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
    { value: 'reserved', label: 'Reserviert', badgeClass: 'bg-fb-neutral' },
    { value: 'defective', label: 'Defekt / Ersatzteil', badgeClass: 'bg-rose-400' },
  ];

  readonly closed = output<void>();
  readonly created = output<void>();

  /**
   * Der zu bearbeitende Artikel - fehlt er, wird ein neuer angelegt.
   *
   * Bewusst derselbe Dialog fuer beides: Zwei Formulare mit denselben Feldern
   * laufen mit der Zeit auseinander, und dann fehlt im einen ein Feld, das im
   * anderen laengst da ist.
   */
  readonly item = input<InventoryItem | null>(null);

  readonly istBearbeitung = computed(() => this.item() !== null);

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
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    category: new FormControl(''),
    brand: new FormControl(''),
    model: new FormControl(''),
    condition: new FormControl<ItemCondition>('very_good', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    status: new FormControl<ItemStatus>('received', { nonNullable: true }),
    sku: new FormControl(''),
    ean: new FormControl(''),
    description: new FormControl(''),
    condition_notes: new FormControl(''),
    allocated_purchase_cost: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.min(0)],
    }),
    expected_value: new FormControl<number | null>(null, { validators: [Validators.min(0)] }),
    /**
     * Anzahl gleicher Stuecke.
     *
     * Jedes Stueck wird ein eigener Artikel - so verlangt es die Einzeldifferenz
     * nach § 25a, und nur so kann jedes Stueck seinen eigenen Zustand, Preis und
     * Verkauf haben. Das Feld erspart lediglich das mehrfache Ausfuellen.
     */
    anzahl: new FormControl<number>(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(200)],
    }),
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
      // Der geschaetzte Marktwert wird bewusst nicht uebernommen: Er entsteht
      // aus einer festen Vorgabe und ein paar Aufschlaegen, nicht aus
      // Marktdaten. Als ausgefuelltes Feld sieht er aus wie eine Recherche -
      // und genau dieses Feld traegt spaeter die Margenrechnung.
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

  constructor() {
    effect(() => {
      const vorhandener = this.item();
      if (!vorhandener) return;

      this.form.patchValue({
        purchase_id: vorhandener.purchase_id ?? null,
        title: vorhandener.title,
        category: vorhandener.category ?? '',
        brand: vorhandener.brand ?? '',
        model: vorhandener.model ?? '',
        condition: vorhandener.condition,
        status: vorhandener.status,
        sku: vorhandener.sku ?? '',
        ean: vorhandener.ean ?? '',
        description: vorhandener.description ?? '',
        condition_notes: vorhandener.condition_notes ?? '',
        allocated_purchase_cost: vorhandener.allocated_purchase_cost ?? 0,
        expected_value: vorhandener.expected_value ?? null,
      });
    });
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

    const vorhandener = this.item();

    if (vorhandener) {
      const { error: aenderFehler } = await this.inventoryService.updateItem(vorhandener.id, {
        ...payload,
        // Der Titel ist Pflicht, die uebrigen Felder duerfen bewusst geleert
        // werden - deshalb null statt undefined, sonst bliebe der alte Wert
        // stehen und ein geloeschtes Feld waere nicht loeschbar.
        category: payload.category ?? null,
        brand: payload.brand ?? null,
        model: payload.model ?? null,
        sku: payload.sku ?? null,
        ean: payload.ean ?? null,
        description: payload.description ?? null,
        condition_notes: this.form.getRawValue().condition_notes?.trim() || null,
        expected_value: payload.expected_value ?? null,
      });

      if (this.selectedImageFile()) {
        await this.mediaService.uploadItemMedia(vorhandener.id, this.selectedImageFile()!, true);
      }

      this.isSubmitting.set(false);

      if (aenderFehler) {
        this.errorMessage.set(aenderFehler.message);
      } else {
        this.created.emit();
        this.closed.emit();
      }
      return;
    }

    // Mehrfach anlegen: je Stueck ein eigener Artikel mit eigener Nummer.
    const anzahl = Math.max(1, Math.min(200, this.form.getRawValue().anzahl || 1));
    let letzterFehler: Error | null = null;
    let ersterArtikel: InventoryItem | null = null;

    for (let i = 0; i < anzahl; i++) {
      const { data, error: fehler } = await this.inventoryService.createItem(payload);
      if (fehler) {
        letzterFehler = fehler;
        break;
      }
      if (!ersterArtikel) ersterArtikel = data;
    }

    const createdItem = ersterArtikel;
    const error = letzterFehler;

    if (createdItem && this.selectedImageFile()) {
      try {
        await this.mediaService.uploadItemMedia(createdItem.id, this.selectedImageFile()!, true);
      } catch (uploadErr) {
        this.logger.warn('Image upload error on item create:', uploadErr);
      }
    }

    this.isSubmitting.set(false);

    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.created.emit();
      this.closed.emit();
    }
  }
}
