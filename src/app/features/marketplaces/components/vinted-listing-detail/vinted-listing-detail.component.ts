import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { VintedListingCategoryService } from '../../services/vinted-listing-category.service';
import { VintedCategoryFieldStore } from '../../services/vinted-category-field.store';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { VintedListingBrandDialogComponent } from '../vinted-listing-brand-dialog/vinted-listing-brand-dialog.component';
import type { VintedListingBrandSelection } from '../../models/vinted-listing-brand-selection';
import { emptyVintedListingContent } from '../../models/vinted-listing-content';
import { applyVintedListingEdit } from '../../models/vinted-listing-edit-form';
import { CurrencyPipe } from '@angular/common';
import { VintedListingPriceDialogComponent } from '../vinted-listing-price-dialog/vinted-listing-price-dialog.component';
import { createVintedListingPriceEditor } from '../../services/vinted-listing-price-editor';
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
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { AttributePickerComponent } from '../../../../shared/components/attribute-picker/attribute-picker.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import type { ProductImageDraft } from '../../../../core/models/product-media.models';
import { ProductMediaEditorComponent } from '../../../../shared/components/product-media-editor/product-media-editor.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ProductGalleryComponent } from '../../../../shared/components/product-gallery/product-gallery.component';
import { VintedListingAgeComponent } from '../vinted-listing-age/vinted-listing-age.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import type { VintedListingDescription } from '../../models/vinted-listing-description';
import {
  parseVintedListingReadPriceCents,
  vintedListingEditOptions,
  vintedListingBrandValue,
  vintedListingEditSelection,
  withVintedListingBrand,
  vintedListingPriceText,
  type VintedListingEditField,
  type VintedListingEditSnapshot,
} from '../../models/vinted-listing-edit-form';
import {
  storedVintedListingEdit,
  applyStoredVintedListingEdit,
} from '../../models/vinted-stored-listing-edit';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingMetricsComponent } from '../vinted-listings/vinted-listing-metrics.component';
import { createVintedListingMetricDisplay } from '../vinted-listings/vinted-listing-metric-display';
import { vintedPublicationBadge } from '../../models/vinted-publication-state';

import { VintedListingExtraFieldsComponent } from '../vinted-listing-extra-fields/vinted-listing-extra-fields.component';
import {
  vintedListingExtraFieldErrors,
  withVintedListingExtraValues,
} from '../../models/vinted-listing-catalog-fields';
@Component({
  selector: 'app-vinted-listing-detail',
  imports: [
    VintedListingPriceDialogComponent,
    CurrencyPipe,
    CategoryPickerComponent,
    ReactiveFormsModule,
    ButtonComponent,
    BadgeComponent,
    AttributePickerComponent,
    CardComponent,
    CustomSelectComponent,
    EntryPageLayoutComponent,
    ProductMediaEditorComponent,
    TwoColumnLayoutComponent,
    NoticeBannerComponent,
    ProductGalleryComponent,
    VintedListingAgeComponent,
    TextFieldComponent,
    VintedListingMetricsComponent,
    VintedListingBrandDialogComponent,
    VintedListingExtraFieldsComponent,
  ],
  providers: [VintedListingCategoryService],
  templateUrl: './vinted-listing-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedListingDetailComponent {
  readonly publicationBadge = vintedPublicationBadge;
  readonly store = inject(MarketplaceAccountStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly builder = inject(FormBuilder);
  private readonly injector = inject(Injector);
  private readonly toast = inject(ToastService);
  private readonly categoryApi = inject(VintedListingCategoryService);
  private readonly categoryFields = inject(VintedCategoryFieldStore);
  private readonly workspace = inject(WorkspaceService);
  readonly workspaceId = computed(() => this.workspace.currentWorkspace()?.id ?? null);
  readonly categoryLoading = signal(false);
  private readonly categoryEdit = signal<VintedListingEditSnapshot | null>(null);
  readonly editingSnapshot = computed(() => this.categoryEdit() ?? this.current());
  private readonly sellingCategories = new Map<
    number,
    { id: number; title: string; path: string }
  >();
  readonly categorySource = computed(() => {
    const connectionId = this.connectionId();
    this.sellingCategories.clear();
    const source = this.categoryApi.source(connectionId, (category) => {
      if (this.connectionId() === connectionId) this.sellingCategories.set(category.id, category);
    });
    return {
      ...source,
      getById: async (id: string) => {
        const content = this.editingSnapshot()?.content;
        // Den bereits gespeicherten Kategorienamen sofort anzeigen; der Verkaufsbaum
        // wird erst für eine ausdrücklich geöffnete Suche benötigt.
        if (
          content?.categoryId != null &&
          id === String(content.categoryId) &&
          content.categoryLabel
        ) {
          const parts = content.categoryLabel.split(' > ');
          return {
            id,
            parentId: null,
            name: parts.at(-1)!,
            fullName: content.categoryLabel,
            level: parts.length,
            isLeaf: true,
            isDeprecated: false,
          };
        }
        return source.getById(id);
      },
    };
  });
  private readonly priceReturnLink = viewChild('priceReturnLink', {
    read: ElementRef<HTMLElement>,
  });
  private readonly priceChangeTrigger = viewChild('priceChangeTrigger', {
    read: ElementRef<HTMLElement>,
  });
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly connectionId = computed(() => this.params().get('connectionId') ?? '');
  readonly entryId = computed(() => this.params().get('entryId') ?? '');
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  /** Die Inseratliste öffnet mit `?edit=1` direkt die Bearbeiten-Maske. */
  private readonly editRequested = computed(() => this.queryParams().get('edit') === '1');
  private readonly loadedEntry = signal<MarketplaceEntry | null>(null);
  private readonly loadedSelection = signal(-1);
  readonly entry = computed(() => {
    const entry = this.loadedEntry();
    return this.store.canManage() &&
      this.store.selectedConnection()?.connectionId === this.connectionId() &&
      this.loadedSelection() === this.store.selectionVersion() &&
      entry?.id === this.entryId()
      ? entry
      : null;
  });
  /** In der Bearbeitung geänderte Fotoreihenfolge; `null`, solange nichts geändert wurde. */
  private readonly arrangedPhotos = signal<readonly string[] | null>(null);
  readonly photos = computed(() => {
    const entry = this.entry();
    // Änderungen verwenden die gespeicherten Anbieteradressen, nicht private Originaladressen.
    const current = this.editing() ? this.current() : null;
    if (current) return this.arrangedPhotos() ?? current.photoUrls;
    return entry?.imageUrls?.length ? entry.imageUrls : entry?.imageUrl ? [entry.imageUrl] : [];
  });
  /** Die gespeicherte Fotoreihenfolge wird beim Speichern vom Anbieter erneut geprüft. */
  readonly canArrangePhotos = computed(
    () => this.editing() && this.current() !== null && !this.busy(),
  );
  /** Vorhandene Fotos für den gemeinsamen Bildeditor; der Schlüssel ist die Vinted-Adresse. */
  readonly photoDrafts = computed<readonly ProductImageDraft[]>(() =>
    this.photos().map((url, index) => {
      const entry = this.entry();
      const originalIndex = entry?.providerImageUrls?.indexOf(url) ?? -1;
      return {
        key: url,
        media: null,
        file: null,
        fileName: 'Foto ' + (index + 1),
        previewUrl: originalIndex < 0 ? url : (entry?.imageUrls?.[originalIndex] ?? url),
      };
    }),
  );
  readonly selectedPhoto = signal<string | null>(null);
  readonly description = signal<VintedListingDescription | null>(null);
  readonly loading = signal(true);
  readonly editing = signal(false);
  readonly busy = signal(false);
  private readonly priceEditor = createVintedListingPriceEditor({
    store: this.store,
    entry: () => this.entry(),
    busy: this.busy,
    blocked: () => this.editing(),
    priceRead: (price) => this.loadedEntry.update((entry) => (entry ? { ...entry, price } : entry)),
    closed: () => this.restorePriceFocus(),
  });
  readonly changingPrice = this.priceEditor.open;
  readonly priceError = this.priceEditor.error;
  readonly priceForm = this.priceEditor.form;
  readonly priceControl = this.priceEditor.control;

  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly metricDisplay = createVintedListingMetricDisplay(this.store, () =>
    this.entry() ? [this.entry()!] : [],
  );
  readonly form = this.builder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(2000)]],
    price: ['', [Validators.required, Validators.pattern(/^\d{1,6}(?:[,.]\d{1,2})?$/)]],
    categoryId: [''],
    accessory_department: [''],
    brand: [''],
    size: [''],
    condition: [''],
    package: [''],
    // Mehrfachauswahl als Bezeichnungen, getrennt wie in der gemeinsamen Auswahlbox.
    color: [''],
    material: [''],
  });
  /** Gespeicherte Angaben und lokale Auswahlwerte der laufenden Bearbeitung. */
  readonly current = signal<VintedListingEditSnapshot | null>(null);
  private initialFields: ReturnType<typeof this.form.getRawValue> | null = null;
  readonly choiceFields = computed(() =>
    (
      [
        ['accessory_department', 'Zielgruppe'],
        ['brand', 'Marke'],
        ['size', 'Größe'],
        ['condition', 'Zustand'],
        ['package', 'Paketgröße'],
      ] as const
    ).flatMap(([field, label]) => {
      const options = this.options(field);
      return options.length ? [{ field, label, options }] : [];
    }),
  );
  /** Merkmale des Artikels; die Paketgröße steht bei Preis und Versand. */
  readonly articleChoiceFields = computed(() =>
    this.choiceFields().filter((choice) => choice.field !== 'package' && choice.field !== 'brand'),
  );
  /** Die Marke wird gesucht; Vinteds Formular kennt nur die bisherige und vorgeschlagene Marken. */
  readonly brandScope = computed(() => JSON.stringify([this.connectionId(), this.entryId()]));
  /** Ob die Kategorie bei Vinted eine Marke hat; Bücher oder Videospiele haben keine. */
  readonly brandAvailable = computed(
    () => this.editingSnapshot()?.schema.fields.some((field) => field.field === 'brand') ?? true,
  );
  /** Zusatzfelder der Kategorie aus dem Vinted-Katalog, etwa Rocklänge oder Maße. */
  readonly extraFields = computed(() =>
    this.categoryFields.extraFields(this.editingSnapshot()?.content.categoryId),
  );
  private readonly extraValues = signal<{
    readonly categoryId: number;
    readonly values: Readonly<Record<string, string>>;
  } | null>(null);
  /** Zusatzangaben des Inserats mit den Änderungen dieser Bearbeitung. */
  readonly extraAttributes = computed(() => {
    const snapshot = this.editingSnapshot();
    const changed = this.extraValues();
    return withVintedListingExtraValues(
      snapshot?.content.attributes ?? {},
      changed && changed.categoryId === snapshot?.content.categoryId ? changed.values : {},
    );
  });
  readonly extraErrors = computed(() =>
    vintedListingExtraFieldErrors(this.extraFields(), this.extraAttributes()),
  );
  changeExtras(values: Readonly<Record<string, string>>): void {
    const categoryId = this.editingSnapshot()?.content.categoryId;
    if (!this.editing() || this.busy() || !categoryId) return;
    this.extraValues.set({ categoryId, values });
  }
  private readonly brandValue = signal('');
  readonly brandLabel = computed(
    () =>
      this.options('brand').find((option) => option.value && option.value === this.brandValue())
        ?.label ?? '',
  );
  /** Ein getippter Name ohne Treffer aus der Suche ist noch keine Vinted-Marke. */
  readonly brandPending = signal(false);
  readonly packageChoice = computed(
    () => this.choiceFields().find((choice) => choice.field === 'package') ?? null,
  );
  readonly canSave = computed(
    () =>
      this.editing() &&
      this.entry() !== null &&
      !this.categoryLoading() &&
      !this.brandPending() &&
      Object.keys(this.extraErrors()).length === 0 &&
      this.form.controls.categoryId.value ===
        String(this.editingSnapshot()?.content.categoryId ?? ''),
  );
  readonly editStatus = computed(() => (this.busy() ? 'Wird bei Vinted gespeichert …' : ''));
  readonly multipleFields = computed(() =>
    (
      [
        ['color', 'Farben', 2],
        ['material', 'Material', 3],
      ] as const
    ).flatMap(([field, label, max]) => {
      const options = this.multipleOptions(field).map((option) => option.label);
      return options.length ? [{ field, label, max, options }] : [];
    }),
  );
  private requestVersion = 0;
  private requestKey = '';
  private routeKey = '';
  private selected = false;
  private destroyed = false;

  constructor() {
    this.form.controls.categoryId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      void this.changeCategory(id);
    });
    this.destroy.onDestroy(() => {
      this.destroyed = true;
      this.requestVersion++;
    });
    effect(() => {
      const connectionId = this.connectionId();
      const entryId = this.entryId();
      const accounts = this.store.connections();
      const selected = this.store.selectedConnection();
      const selection = this.store.selectionVersion();
      const loading = this.store.loading();
      const routeKey = JSON.stringify([connectionId, entryId]);
      untracked(() => {
        if (this.routeKey !== routeKey) {
          this.routeKey = routeKey;
          this.selected = false;
          this.requestKey = '';
          this.reset();
        }
        if (!accounts.length) return;
        if (!accounts.some((account) => account.connectionId === connectionId)) {
          void this.router.navigate(['/marketplaces/vinted/listings']);
          return;
        }
        if (selected?.connectionId !== connectionId) {
          if (loading) return;
          if (!this.selected) void this.store.selectConnection(connectionId);
          else void this.router.navigate(['/marketplaces/vinted/listings']);
          return;
        }
        this.selected = true;
        const key = JSON.stringify([connectionId, entryId, selection]);
        if (key === this.requestKey) return;
        this.requestKey = key;
        this.reset();
        this.loadedSelection.set(selection);
        const version = this.requestVersion;
        const known = this.store.snapshot()?.publications.items.find((item) => item.id === entryId);
        if (known) this.showEntry(known, version);
        else void this.load(version, connectionId, entryId);
      });
    });
    effect(() => {
      // Echte Auswahlwerte der Kategorie früh laden, damit Bearbeiten sofort vollständig öffnet.
      const categoryId = this.entry()?.listingContent?.categoryId;
      const connectionId = this.connectionId();
      untracked(() => void this.categoryFields.load(connectionId, categoryId));
    });
    effect(() => {
      if (!this.editRequested() || this.loading() || !this.entry()) return;
      untracked(() => {
        // Parameter sofort entfernen, damit ein Neuladen die Maske nicht erneut öffnet.
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { edit: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        const entry = this.entry();
        void this.categoryFields
          .load(this.connectionId(), entry?.listingContent?.categoryId)
          .finally(() => {
            if (this.entry() === entry) this.edit();
          });
      });
    });
    effect(() => {
      const snapshot = this.store.snapshot();
      const id = this.entryId();
      const selected = this.loadedSelection();
      const version = this.store.selectionVersion();
      untracked(() => {
        if (!snapshot || snapshot.connectionId !== this.connectionId() || selected !== version)
          return;
        const item = snapshot.publications.items.find((entry) => entry.id === id);
        if (!item || !this.loadedEntry()) return;
        this.loadedEntry.set(item);
        const description = this.store.cachedListingDescription(this.connectionId(), item);
        if (description) this.description.set(description);
      });
    });
  }

  private reset(): void {
    this.requestVersion++;
    this.loadedEntry.set(null);
    this.selectedPhoto.set(null);
    this.description.set(null);
    this.loading.set(true);
    this.editing.set(false);
    this.priceEditor.reset();
    this.busy.set(false);
    this.error.set(null);
    this.notice.set(null);
    this.form.reset();
    this.current.set(null);
    this.initialFields = null;
    this.arrangedPhotos.set(null);
  }
  private options(field: VintedListingEditField): SelectOption[] {
    const current = this.editingSnapshot();
    if (!current) return [];
    const options = vintedListingEditOptions(current.schema, field);
    // Ein bei Vinted leeres Merkmal darf leer bleiben; ein gesetztes wird nicht stillschweigend entfernt.
    return options.length && !vintedListingEditSelection(current)[field]?.length
      ? [{ value: '', label: 'Nicht angegeben' }, ...options]
      : [...options];
  }
  /** Übernimmt Reihenfolge und Auswahl aus dem Bildeditor; nur bekannte Vinted-Fotos zählen. */
  onPhotoDraftsChanged(drafts: readonly ProductImageDraft[]): void {
    const current = this.current();
    if (!current || !this.canArrangePhotos()) return;
    const next = drafts.map((draft) => draft.key).filter((url) => current.photoUrls.includes(url));
    if (next.length < 1 || new Set(next).size !== next.length) return;
    const unchanged =
      next.length === current.photoUrls.length &&
      next.every((url, index) => url === current.photoUrls[index]);
    this.arrangedPhotos.set(unchanged ? null : next);
  }
  private multipleOptions(field: 'color' | 'material'): readonly SelectOption[] {
    const current = this.editingSnapshot();
    return current ? vintedListingEditOptions(current.schema, field) : [];
  }
  /** Gewählte Kennungen als Bezeichnungen für die Auswahlbox. */
  private labelsOf(field: 'color' | 'material', values: readonly string[]): string {
    const options = this.multipleOptions(field);
    return values
      .flatMap((value) => options.find((option) => option.value === value)?.label ?? [])
      .join(' · ');
  }
  private isCurrent(version: number): boolean {
    return (
      !this.destroyed &&
      version === this.requestVersion &&
      this.store.canManage() &&
      this.loadedSelection() === this.store.selectionVersion() &&
      this.store.selectedConnection()?.connectionId === this.connectionId()
    );
  }
  private showEntry(entry: MarketplaceEntry | null, version: number): void {
    if (!this.isCurrent(version)) return;
    this.loadedEntry.set(entry);
    this.selectedPhoto.set(entry?.imageUrls?.[0] ?? entry?.imageUrl ?? null);
    this.loading.set(false);
    if (!entry) return;
    const description = this.store.cachedListingDescription(this.connectionId(), entry);
    if (description) this.description.set(description);
  }
  private async load(version: number, connectionId: string, entryId: string): Promise<void> {
    try {
      this.showEntry(await this.store.readPublication(connectionId, entryId), version);
    } catch {
      if (this.isCurrent(version)) this.error.set('Das Inserat konnte nicht geladen werden.');
    } finally {
      if (this.isCurrent(version)) this.loading.set(false);
    }
  }
  cancelEdit(): void {
    if (this.busy()) return;
    this.requestVersion++;
    this.editing.set(false);
    this.current.set(null);
    this.initialFields = null;
    this.error.set(null);
    this.arrangedPhotos.set(null);
  }
  openPriceChange(): void {
    this.priceEditor.show();
    if (this.changingPrice()) this.notice.set(null);
  }
  closePriceChange(): void {
    this.priceEditor.close();
  }
  private restorePriceFocus(): void {
    const saving = this.busy();
    afterNextRender(
      () => {
        if (saving) this.priceReturnLink()?.nativeElement.querySelector('a')?.focus();
        else this.priceChangeTrigger()?.nativeElement.querySelector('button')?.focus();
      },
      { injector: this.injector },
    );
  }
  async savePrice(): Promise<void> {
    await this.priceEditor.save();
  }
  /** Öffnet ausschließlich den gespeicherten Stand; der Anbieter wird erst beim Speichern gelesen. */
  edit(): void {
    const entry = this.entry();
    if (this.busy() || this.editing() || this.changingPrice() || !entry) return;
    this.error.set(null);
    this.notice.set(null);
    const current = storedVintedListingEdit(
      entry,
      this.description()?.description ?? null,
      this.categoryFields.fields(this.connectionId(), entry.listingContent?.categoryId),
    );
    this.current.set(current);
    this.categoryEdit.set(null);
    this.categoryLoading.set(false);
    this.arrangedPhotos.set(null);
    const selection = current ? vintedListingEditSelection(current) : null;
    this.form.reset(
      {
        // Dieselbe Grundlage wie der Vergleich beim Speichern; sonst gilt ein unveränderter Text als
        // geändert und eine abweichende Quelle (Kontoabgleich statt Inhalt) meldet einen Konflikt.
        title: current?.content.title ?? entry.title,
        description:
          current?.content.description ??
          this.description()?.description ??
          entry.listingContent?.description ??
          '',
        price:
          current?.content.priceCents !== null && current?.content.priceCents !== undefined
            ? vintedListingPriceText(current.content.priceCents)
            : entry.price === null
              ? ''
              : vintedListingPriceText(Math.round(entry.price * 100)),
        categoryId: String(current?.content.categoryId ?? ''),
        accessory_department: selection?.accessory_department ?? '',
        brand: selection?.brand ?? '',
        size: selection?.size ?? '',
        condition: selection?.condition ?? '',
        package: selection?.package ?? '',
        color: selection ? this.labelsOf('color', selection.color) : '',
        material: selection ? this.labelsOf('material', selection.material) : '',
      },
      { emitEvent: false },
    );
    this.initialFields = this.form.getRawValue();
    this.extraValues.set(null);
    this.brandValue.set(this.form.controls.brand.value);
    this.brandPending.set(false);
    this.editing.set(true);
  }
  private async changeCategory(id: string): Promise<void> {
    if (!this.editing() || this.busy()) return;
    const current = this.current();
    if (!current) return;
    if (id === String(current.content.categoryId)) {
      const initial = this.initialFields;
      if (initial)
        this.form.patchValue(
          {
            accessory_department: initial.accessory_department,
            brand: initial.brand,
            size: initial.size,
            condition: initial.condition,
            package: initial.package,
            color: initial.color,
            material: initial.material,
          },
          { emitEvent: false },
        );
      this.brandValue.set(this.form.controls.brand.value);
      this.brandPending.set(false);
      this.categoryEdit.set(null);
      this.categoryLoading.set(false);
      this.error.set(null);
      return;
    }
    const version = this.requestVersion;
    const category = this.sellingCategories.get(Number(id));
    this.categoryLoading.set(true);
    this.error.set(null);
    try {
      if (!category) throw new Error('Suche die gewünschte Kategorie und wähle sie aus.');
      const schema = await this.categoryApi.read(this.connectionId(), category.id, {
        categoryLabel: category.title,
      });
      if (!this.isCurrent(version) || this.form.controls.categoryId.value !== id) return;
      this.categoryEdit.set({
        ...current,
        schema,
        content: {
          ...emptyVintedListingContent(),
          title: current.content.title,
          description: current.content.description,
          priceCents: current.content.priceCents,
          categoryId: category.id,
          categoryLabel: category.path,
        },
      });
      this.form.patchValue(
        {
          accessory_department: '',
          brand: '',
          size: '',
          condition: '',
          package: '',
          color: '',
          material: '',
        },
        { emitEvent: false },
      );
      this.brandValue.set('');
      this.brandPending.set(false);
    } catch (error) {
      if (this.isCurrent(version) && this.form.controls.categoryId.value === id)
        this.error.set(
          error instanceof Error ? error.message : 'Die Kategorie konnte nicht geladen werden.',
        );
    } finally {
      if (this.isCurrent(version) && this.form.controls.categoryId.value === id)
        this.categoryLoading.set(false);
    }
  }
  editBrand(label: string): void {
    if (!this.editing()) return;
    this.brandPending.set(label !== this.brandLabel());
  }
  selectBrand(selection: VintedListingBrandSelection): void {
    if (!this.editing() || this.busy()) return;
    this.current.update((snapshot) => snapshot && withVintedListingBrand(snapshot, selection));
    this.categoryEdit.update((snapshot) => snapshot && withVintedListingBrand(snapshot, selection));
    const value = vintedListingBrandValue(selection);
    this.form.controls.brand.setValue(value);
    this.form.controls.brand.markAsDirty();
    this.brandValue.set(value);
    this.brandPending.set(false);
  }
  async save(): Promise<void> {
    if (this.form.invalid || this.busy() || !this.canSave()) {
      this.form.markAllAsTouched();
      return;
    }
    const version = this.requestVersion;
    this.busy.set(true);
    this.error.set(null);
    try {
      const current = this.current();
      const fields = this.form.getRawValue();
      if (!current) {
        const fresh = await this.store.readListingEdit(this.connectionId(), this.entryId());
        if (!this.isCurrent(version)) return;
        const initial = this.initialFields;
        const priceCents = parseVintedListingReadPriceCents(fresh.price);
        const basic = {
          title: fields.title === initial?.title ? fresh.title : fields.title,
          description:
            fields.description === initial?.description ? fresh.description : fields.description,
          price:
            fields.price === initial?.price && priceCents !== null
              ? vintedListingPriceText(priceCents)
              : fields.price,
        };
        await this.store.saveListingEdit(this.connectionId(), this.entryId(), basic);
        if (!this.isCurrent(version)) return;
        this.editing.set(false);
        this.loadedEntry.update((entry) =>
          entry
            ? {
                ...entry,
                title: basic.title,
                text: basic.description,
                textState: 'loaded',
                price: Number(basic.price.replace(',', '.')),
              }
            : entry,
        );
        this.description.set({ description: basic.description, cacheState: 'unconfirmed' });
        this.notice.set(null);
        this.toast.success('Inserat erfolgreich geändert');
        return;
      }
      const fresh = await this.store.readListingContent(this.connectionId(), this.entryId());
      if (!this.isCurrent(version)) return;
      const categoryEdit = this.categoryEdit();
      let content;
      if (categoryEdit && categoryEdit.content.categoryId !== current.content.categoryId) {
        const initial = this.initialFields;
        if (!initial) throw new Error('Lade das Inserat erneut.');
        const merged = applyStoredVintedListingEdit(current, fresh, {
          ...initial,
          title: fields.title,
          description: fields.description,
          price: fields.price,
        });
        const many = (field: 'color' | 'material') =>
          fields[field]
            .split(' · ')
            .filter(Boolean)
            .map((label) => {
              const options = vintedListingEditOptions(categoryEdit.schema, field).filter(
                (choice) => choice.label === label,
              );
              if (options.length !== 1) throw new Error('Die Auswahl ist nicht eindeutig.');
              return options[0].value;
            });
        content = applyVintedListingEdit(
          { ...fresh, ...categoryEdit },
          {
            title: merged.title,
            description: merged.description,
            price: vintedListingPriceText(merged.priceCents ?? 0),
          },
          { ...fields, color: many('color'), material: many('material') },
        );
      } else {
        content = applyStoredVintedListingEdit(current, fresh, fields);
      }
      const extras = this.extraValues();
      if (extras && extras.categoryId === content.categoryId)
        content = {
          ...content,
          attributes: withVintedListingExtraValues(content.attributes, extras.values),
        };
      const arranged = this.arrangedPhotos();
      const photos = arranged ? { base: current.photoUrls, desired: arranged } : undefined;
      await this.store.saveListingContent(
        this.connectionId(),
        this.entryId(),
        fresh.content,
        content,
        ...(photos ? [photos] : []),
      );
      if (!this.isCurrent(version)) return;
      this.editing.set(false);
      this.current.set(null);
      this.loadedEntry.update((entry) =>
        entry
          ? {
              ...entry,
              listingContent: content,
              title: content.title,
              text: content.description,
              textState: 'loaded',
              price: (content.priceCents ?? 0) / 100,
              brand: content.brandLabel || null,
              size: content.sizeLabel || null,
              status: content.conditionLabel || entry.status,
              ...(photos
                ? {
                    providerImageUrls: [...photos.desired],
                    imageUrl: photos.desired[0] ?? null,
                    imageUrls: [...photos.desired],
                  }
                : {}),
            }
          : entry,
      );
      this.arrangedPhotos.set(null);
      this.selectedPhoto.set(photos?.desired[0] ?? this.selectedPhoto());
      this.description.set({ description: content.description, cacheState: 'unconfirmed' });
      this.notice.set(null);
      this.toast.success('Inserat erfolgreich geändert');
    } catch (error) {
      if (this.isCurrent(version))
        this.error.set(
          error instanceof Error ? error.message : 'Die Änderung konnte nicht bestätigt werden.',
        );
    } finally {
      if (this.isCurrent(version)) this.busy.set(false);
    }
  }
}
