import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideDynamicIcon,
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
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { BrandPickerComponent } from '../../../../shared/components/brand-picker/brand-picker.component';
import { InventoryItem, ItemCondition, ItemStatus } from '../../../../core/models/flipbase.models';

import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { LoggerService } from '../../../../core/services/logger.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceContextLockService } from '../../../../core/services/workspace-context-lock.service';
import { normalizeGtin } from '../../../../shared/utils/gtin';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';

interface MehrfachAnlageErgebnis {
  readonly status: 'success' | 'partial' | 'failed';
  readonly gesamt: number;
  readonly angelegt: readonly InventoryItem[];
  readonly fehler: readonly Error[];
}

type ItemCreatePayload = CreateItemPayload & {
  readonly categoryId: string | null;
  readonly brandId: string | null;
};

@Component({
  selector: 'app-item-create-modal',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    LucideDynamicIcon,
    BarcodeScannerComponent,
    AiPhotoScannerModalComponent,
    ImageCropperModalComponent,
    CustomSelectComponent,
    CategoryPickerComponent,
    BrandPickerComponent,
    ModalShellComponent,
    CardComponent,
    ButtonComponent,
    TextFieldComponent,
    NumberInputComponent,
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
  readonly catalogService = inject(CatalogService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceContext = inject(WorkspaceContextLockService);
  private readonly releaseWorkspaceLock = this.workspaceContext.acquire();
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);

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
  readonly presentation = input<'dialog' | 'page'>('dialog');

  readonly istBearbeitung = computed(() => this.item() !== null);

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
  /** Erkannte Texte (Titel, Barcode, Foto) – nur Vorschläge, nie automatisch gespeichert. */
  readonly categorySuggestion = signal<string | null>(null);
  readonly brandSuggestion = signal<string | null>(null);

  readonly form = new FormGroup({
    purchase_id: new FormControl<string | null>(null),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    category_id: new FormControl<string | null>(null),
    brand_id: new FormControl<string | null>(null),
    model: new FormControl(''),
    condition: new FormControl<ItemCondition>('very_good', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    status: new FormControl<ItemStatus>('received', { nonNullable: true }),
    sku: new FormControl(''),
    ean: new FormControl('', {
      nonNullable: true,
      validators: [
        (control) => {
          const value = control.value.trim();
          return value && !normalizeGtin(value) ? { invalidGtin: true } : null;
        },
      ],
    }),
    description: new FormControl(''),
    condition_notes: new FormControl(''),
    allocated_purchase_cost: new FormControl<number | null>(0, {
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

  hasUnsavedChanges(): boolean {
    return this.form.dirty;
  }

  isSaving(): boolean {
    return this.isSubmitting();
  }

  async onAiAutofill(): Promise<void> {
    const rawTitle = this.form.get('title')?.value;
    if (!rawTitle || !rawTitle.trim()) return;

    this.isAiLoading.set(true);
    const ai = await this.aiService.identifyProduct(rawTitle);
    this.isAiLoading.set(false);

    this.form.patchValue({
      title: ai.cleanTitle,
      model: ai.model || this.form.get('model')?.value,
      condition: ai.condition || this.form.get('condition')?.value,
      // Der geschaetzte Marktwert wird bewusst nicht uebernommen: Er entsteht
      // aus einer festen Vorgabe und ein paar Aufschlaegen, nicht aus
      // Marktdaten. Als ausgefuelltes Feld sieht er aus wie eine Recherche -
      // und genau dieses Feld traegt spaeter die Margenrechnung.
    });
    this.schlageKategorieUndMarkeVor(ai.category, ai.brand);
  }

  onPhotoScanned(res: AiVisualScanResult): void {
    this.isScanningPhoto.set(false);
    this.form.patchValue({
      title: res.title,
      model: res.model || this.form.get('model')?.value,
      condition: res.condition || this.form.get('condition')?.value,
      expected_value: res.estimatedMarketValue || this.form.get('expected_value')?.value,
      condition_notes: res.conditionNotes || this.form.get('condition_notes')?.value,
    });
    this.schlageKategorieUndMarkeVor(res.category, res.brand);
  }

  async onBarcodeScanned(ean: string): Promise<void> {
    this.isScanningBarcode.set(false);
    const normalized = normalizeGtin(ean);
    if (!normalized) {
      this.errorMessage.set(
        'Keine gültige EAN/GTIN erkannt. Bitte 8, 12, 13 oder 14 Ziffern eingeben.',
      );
      return;
    }
    this.errorMessage.set(null);
    this.form.patchValue({ ean: normalized });

    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (workspaceId) await this.catalogService.loadProducts(workspaceId);
    const matches = this.catalogService.products().filter((product) => product.ean === normalized);
    if (matches.length === 1) {
      const product = matches[0];
      const current = this.form.getRawValue();
      this.form.patchValue({
        title: current.title.trim() ? current.title : product.title,
        model: current.model?.trim() ? current.model : (product.model ?? ''),
        brand_id: current.brand_id ?? product.brand_id ?? null,
        category_id: current.category_id ?? product.category_id ?? null,
      });
      return;
    }

    const info = await this.barcodeLookup.lookupByEan(normalized);
    if (info) {
      this.form.patchValue({
        title: info.title || this.form.get('title')?.value,
        expected_value: info.estimatedPrice || this.form.get('expected_value')?.value,
      });
      this.schlageKategorieUndMarkeVor(info.category, info.brand);
    }
  }

  prefillWithAiResult(res: AiVisualScanResult): void {
    this.form.patchValue({
      title: res.title,
      brand_id: this.form.controls.brand_id.value,
      model: res.model || '',
      category_id: this.form.controls.category_id.value,
      condition: res.condition || 'very_good',
      expected_value: res.estimatedMarketValue || null,
      condition_notes: res.conditionNotes || '',
    });
    this.schlageKategorieUndMarkeVor(res.category, res.brand);
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
    this.destroyRef.onDestroy(this.releaseWorkspaceLock);
    effect(() => {
      const vorhandener = this.item();
      if (!vorhandener) return;

      this.form.patchValue({
        purchase_id: vorhandener.purchase_id ?? null,
        title: vorhandener.title,
        category_id: vorhandener.category_id ?? null,
        brand_id: vorhandener.brand_id ?? null,
        model: vorhandener.model ?? '',
        condition: vorhandener.condition,
        status: vorhandener.status,
        sku: vorhandener.sku ?? '',
        ean: vorhandener.ean ?? '',
        description: vorhandener.description ?? '',
        condition_notes: vorhandener.condition_notes ?? '',
        allocated_purchase_cost: vorhandener.allocated_purchase_cost,
        expected_value: vorhandener.expected_value ?? null,
      });
      if (vorhandener.source_package_line_id) this.form.controls.purchase_id.disable();
      else this.form.controls.purchase_id.enable();
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const val = this.form.getRawValue();
    const payload: ItemCreatePayload = {
      purchase_id: this.item()?.source_package_line_id
        ? this.item()!.purchase_id
        : val.purchase_id || undefined,
      title: val.title.trim(),
      categoryId: val.category_id ?? null,
      brandId: val.brand_id ?? null,
      model: val.model?.trim() || undefined,
      condition: val.condition,
      status: val.status,
      sku: val.sku?.trim() || undefined,
      ean: normalizeGtin(val.ean) ?? undefined,
      description: val.description?.trim() || undefined,
      allocated_purchase_cost: val.allocated_purchase_cost,
      expected_value: val.expected_value ?? undefined,
    };

    const vorhandener = this.item();

    if (vorhandener) {
      const { error: aenderFehler } = await this.inventoryService.updateItem(vorhandener.id, {
        ...payload,
        // Der Titel ist Pflicht, die uebrigen Felder duerfen bewusst geleert
        // werden - deshalb null statt undefined, sonst bliebe der alte Wert
        // stehen und ein geloeschtes Feld waere nicht loeschbar.
        categoryId: payload.categoryId ?? null,
        brandId: payload.brandId ?? null,
        model: payload.model ?? null,
        sku: payload.sku ?? null,
        ean: payload.ean ?? null,
        description: payload.description ?? null,
        condition_notes: this.form.getRawValue().condition_notes?.trim() || null,
        expected_value: payload.expected_value ?? null,
      });

      if (aenderFehler) {
        this.isSubmitting.set(false);
        this.errorMessage.set(aenderFehler.message);
        this.meldeFehlerWennNichtSynchronisiert(
          'Artikel konnte nicht aktualisiert werden.',
          aenderFehler,
        );
        return;
      }

      let bildFehler: Error | null = null;
      if (this.selectedImageFile()) {
        try {
          const { error } = await this.mediaService.uploadItemMedia(
            vorhandener.id,
            this.selectedImageFile()!,
            true,
          );
          bildFehler = error;
        } catch (uploadErr) {
          this.logger.warn('Image upload error on item update:', uploadErr);
          bildFehler = this.alsError(uploadErr);
        }
      }
      this.isSubmitting.set(false);

      if (bildFehler) {
        if (!this.syncStatus.istZentralGemeldet(bildFehler)) {
          this.toast.warning(
            'Artikel wurde aktualisiert.',
            'Das Bild konnte nicht hochgeladen werden.',
          );
        }
      } else {
        this.toast.success('Artikel wurde aktualisiert.');
      }
      this.created.emit();
      this.closed.emit();
      return;
    }

    // Mehrfach anlegen: je Stueck ein eigener Artikel mit eigener Nummer.
    const anzahl = Math.max(1, Math.min(200, this.form.getRawValue().anzahl || 1));
    const angelegteArtikel: InventoryItem[] = [];
    const anlegeFehler: Error[] = [];
    const fehlerAktion = this.syncStatus.neueFehlerAktion();
    let unerwarteterFehler: Error | null = null;

    try {
      for (let i = 0; i < anzahl; i++) {
        const { data, error: fehler } = await this.inventoryService.createItem(
          payload,
          fehlerAktion,
        );
        if (data) angelegteArtikel.push(data);
        if (fehler) anlegeFehler.push(fehler);
        if (!data && !fehler)
          anlegeFehler.push(new Error('Der Artikel wurde nicht zurückgegeben.'));
      }
    } catch (ursache) {
      unerwarteterFehler = this.alsError(ursache);
    } finally {
      this.syncStatus.beendeFehlerAktion(fehlerAktion);
      this.isSubmitting.set(false);
    }

    if (unerwarteterFehler) {
      this.errorMessage.set(unerwarteterFehler.message);
      this.meldeFehlerWennNichtSynchronisiert(
        'Artikel konnte nicht gespeichert werden.',
        unerwarteterFehler,
      );
      return;
    }

    const mehrfachErgebnis: MehrfachAnlageErgebnis = {
      status:
        anlegeFehler.length === 0
          ? 'success'
          : angelegteArtikel.length === 0
            ? 'failed'
            : 'partial',
      gesamt: anzahl,
      angelegt: angelegteArtikel,
      fehler: anlegeFehler,
    };

    let bildFehler: Error | null = null;
    const ersterArtikel = mehrfachErgebnis.angelegt[0];
    if (mehrfachErgebnis.status === 'success' && ersterArtikel && this.selectedImageFile()) {
      try {
        const { error: uploadFehler } = await this.mediaService.uploadItemMedia(
          ersterArtikel.id,
          this.selectedImageFile()!,
          true,
        );
        bildFehler = uploadFehler;
      } catch (uploadErr) {
        this.logger.warn('Image upload error on item create:', uploadErr);
        bildFehler = this.alsError(uploadErr);
      }
    }

    const lokaleAnlegeFehler = mehrfachErgebnis.fehler.filter(
      (error) => !this.syncStatus.istZentralGemeldet(error),
    );

    if (mehrfachErgebnis.status === 'failed') {
      const error = lokaleAnlegeFehler[0] ?? mehrfachErgebnis.fehler[0];
      this.errorMessage.set(error.message);
      if (anzahl > 1 && lokaleAnlegeFehler.length > 0) {
        this.toast.warning(
          `0 von ${anzahl} Artikeln wurden angelegt.`,
          this.beschreibeFehlgeschlageneArtikel(lokaleAnlegeFehler.length),
        );
        return;
      }
      this.meldeFehlerWennNichtSynchronisiert('Artikel konnte nicht gespeichert werden.', error);
      return;
    }

    if (mehrfachErgebnis.status === 'partial') {
      const gespeichert = mehrfachErgebnis.angelegt.length;
      const fehlgeschlagen = lokaleAnlegeFehler.length;
      const title =
        gespeichert === 1
          ? `1 von ${mehrfachErgebnis.gesamt} Artikeln wurde angelegt.`
          : `${gespeichert} von ${mehrfachErgebnis.gesamt} Artikeln wurden angelegt.`;
      const fehlerText =
        fehlgeschlagen === 1
          ? '1 Artikel konnte nicht angelegt werden.'
          : `${fehlgeschlagen} Artikel konnten nicht angelegt werden.`;
      const bildText = this.selectedImageFile() ? ' Das Bild wurde nicht hochgeladen.' : '';
      if (fehlgeschlagen > 0) {
        this.toast.warning(title, `${fehlerText}${bildText}`);
      }
      this.created.emit();
      this.closed.emit();
      return;
    }

    if (bildFehler) {
      if (!this.syncStatus.istZentralGemeldet(bildFehler)) {
        this.toast.warning(
          anzahl > 1 ? `${anzahl} Artikel wurden angelegt.` : 'Artikel wurde angelegt.',
          'Das Bild konnte nicht hochgeladen werden.',
        );
      }
    } else {
      this.toast.success(
        anzahl > 1 ? `${anzahl} Artikel wurden angelegt.` : 'Artikel wurde angelegt.',
      );
    }
    this.created.emit();
    this.closed.emit();
  }

  private schlageKategorieUndMarkeVor(category?: string | null, brand?: string | null): void {
    if (category?.trim() && !this.form.controls.category_id.value)
      this.categorySuggestion.set(category.trim());
    if (brand?.trim() && !this.form.controls.brand_id.value) this.brandSuggestion.set(brand.trim());
  }

  private meldeFehlerWennNichtSynchronisiert(title: string, error: Error): void {
    if (!this.syncStatus.istZentralGemeldet(error)) this.toast.error(title, error.message);
  }

  private beschreibeFehlgeschlageneArtikel(anzahl: number): string {
    return anzahl === 1
      ? '1 Artikel konnte nicht angelegt werden.'
      : `${anzahl} Artikel konnten nicht angelegt werden.`;
  }

  private alsError(ursache: unknown): Error {
    return ursache instanceof Error ? ursache : new Error('Die Aktion ist fehlgeschlagen.');
  }
}
