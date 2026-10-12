import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
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
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import type { VintedListingCurrentContent } from '../../models/vinted-listing-category-fields';
import type { VintedListingDescription } from '../../models/vinted-listing-description';
import {
  applyVintedListingEdit,
  vintedListingEditOptions,
  vintedListingEditSelection,
  vintedListingPriceText,
  type VintedListingEditField,
} from '../../models/vinted-listing-edit-form';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingMetricsComponent } from '../vinted-listings/vinted-listing-metrics.component';
import { createVintedListingMetricDisplay } from '../vinted-listings/vinted-listing-metric-display';

@Component({
  selector: 'app-vinted-listing-detail',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    ButtonComponent,
    AttributePickerComponent,
    CardComponent,
    CustomSelectComponent,
    EntryPageLayoutComponent,
    ProductMediaEditorComponent,
    TwoColumnLayoutComponent,
    NoticeBannerComponent,
    ProductThumbnailComponent,
    TextFieldComponent,
    VintedListingMetricsComponent,
  ],
  templateUrl: './vinted-listing-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedListingDetailComponent {
  readonly store = inject(MarketplaceAccountStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly builder = inject(FormBuilder);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly connectionId = computed(() => this.params().get('connectionId') ?? '');
  readonly entryId = computed(() => this.params().get('entryId') ?? '');
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
    // Maßgeblich für Änderungen sind die Fotos, die Vinted beim Lesen der Maske geliefert hat.
    const current = this.editing() ? this.current() : null;
    if (current) return this.arrangedPhotos() ?? current.photoUrls;
    return entry?.imageUrls?.length ? entry.imageUrls : entry?.imageUrl ? [entry.imageUrl] : [];
  });
  /** Fotos lassen sich erst auf dem gelesenen Vinted-Stand ändern. */
  readonly canArrangePhotos = computed(
    () => this.editing() && this.current() !== null && !this.busy(),
  );
  /** Vorhandene Fotos für den gemeinsamen Bildeditor; der Schlüssel ist die Vinted-Adresse. */
  readonly photoDrafts = computed<readonly ProductImageDraft[]>(() =>
    this.photos().map((url, index) => ({
      key: url,
      media: null,
      file: null,
      fileName: 'Foto ' + (index + 1),
      previewUrl: url,
    })),
  );
  readonly selectedPhoto = signal<string | null>(null);
  readonly description = signal<VintedListingDescription | null>(null);
  readonly loading = signal(true);
  readonly loadingDescription = signal(false);
  readonly descriptionError = signal(false);
  readonly editing = signal(false);
  /** Der aktuelle Vinted-Stand wird nach dem Öffnen der Maske im Hintergrund gelesen. */
  readonly loadingCurrent = signal(false);
  /** Ohne vollständigen Stand: Titel, Beschreibung und Preis sind von Vinted bestätigt gelesen. */
  private readonly basicReady = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly metricDisplay = createVintedListingMetricDisplay(this.store, () =>
    this.entry() ? [this.entry()!] : [],
  );
  readonly form = this.builder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(2000)]],
    price: ['', [Validators.required, Validators.pattern(/^\d{1,6}(?:[,.]\d{1,2})?$/)]],
    brand: [''],
    size: [''],
    condition: [''],
    package: [''],
    // Mehrfachauswahl als Bezeichnungen, getrennt wie in der gemeinsamen Auswahlbox.
    color: [''],
    material: [''],
  });
  /** Frisch gelesener Vinted-Stand, auf dem die laufende Bearbeitung beruht. */
  readonly current = signal<VintedListingCurrentContent | null>(null);
  readonly choiceFields = computed(() =>
    (
      [
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
    this.choiceFields().filter((choice) => choice.field !== 'package'),
  );
  readonly packageChoice = computed(
    () => this.choiceFields().find((choice) => choice.field === 'package') ?? null,
  );
  /** Gespeichert werden darf erst auf einem von Vinted gelesenen Stand. */
  readonly canSave = computed(
    () =>
      this.editing() && !this.loadingCurrent() && (this.current() !== null || this.basicReady()),
  );
  readonly editStatus = computed(() =>
    this.loadingCurrent()
      ? 'Aktueller Stand wird von Vinted geladen …'
      : this.busy()
        ? 'Wird bei Vinted gespeichert …'
        : '',
  );
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
    this.loadingDescription.set(false);
    this.descriptionError.set(false);
    this.editing.set(false);
    this.loadingCurrent.set(false);
    this.basicReady.set(false);
    this.busy.set(false);
    this.error.set(null);
    this.notice.set(null);
    this.form.reset();
    this.current.set(null);
    this.arrangedPhotos.set(null);
  }
  private options(field: VintedListingEditField): SelectOption[] {
    const current = this.current();
    if (!current) return [];
    const options = vintedListingEditOptions(current.schema, field);
    // Ein bei Vinted leeres Merkmal darf leer bleiben; ein gesetztes wird nicht stillschweigend entfernt.
    return options.length && !vintedListingEditSelection(current)[field].length
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
    const current = this.current();
    return current ? vintedListingEditOptions(current.schema, field) : [];
  }
  /** Gewählte Kennungen als Bezeichnungen für die Auswahlbox. */
  private labelsOf(field: 'color' | 'material', values: readonly string[]): string {
    const options = this.multipleOptions(field);
    return values
      .flatMap((value) => options.find((option) => option.value === value)?.label ?? [])
      .join(' · ');
  }
  /** Bezeichnungen der Auswahlbox zurück in Vinteds Kennungen; Unbekanntes entfällt. */
  private valuesOf(field: 'color' | 'material', labels: string): string[] {
    const options = this.multipleOptions(field);
    return labels
      .split(' · ')
      .flatMap((label) => options.find((option) => option.label === label)?.value ?? []);
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
    else if (this.store.selectedConnection()?.status === 'connected') void this.loadDescription();
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
  async loadDescription(): Promise<void> {
    if (this.loadingDescription() || this.description() !== null || !this.entry()) return;
    const version = this.requestVersion;
    this.loadingDescription.set(true);
    this.descriptionError.set(false);
    try {
      const description = await this.store.readListingDescription(
        this.connectionId(),
        this.entryId(),
      );
      if (this.isCurrent(version)) this.description.set(description);
    } catch {
      if (this.isCurrent(version)) this.descriptionError.set(true);
    } finally {
      if (this.isCurrent(version)) this.loadingDescription.set(false);
    }
  }
  /** Unberührte Felder übernehmen den gelesenen Stand; Eingaben des Nutzers bleiben erhalten. */
  private fillUntouched(values: Partial<ReturnType<typeof this.form.getRawValue>>): void {
    for (const [name, value] of Object.entries(values) as [
      keyof typeof this.form.controls,
      string,
    ][]) {
      const control = this.form.controls[name];
      if (control.pristine) control.setValue(value);
    }
  }
  cancelEdit(): void {
    if (this.busy()) return;
    this.requestVersion++;
    this.editing.set(false);
    this.loadingCurrent.set(false);
    this.error.set(null);
    this.arrangedPhotos.set(null);
  }
  /**
   * Öffnet die Maske sofort mit den gespeicherten Angaben. Der aktuelle Vinted-Stand mit allen
   * Auswahlfeldern wird im Hintergrund gelesen; gespeichert werden kann erst danach.
   */
  async edit(): Promise<void> {
    const entry = this.entry();
    if (this.busy() || this.editing() || this.loadingDescription() || !entry) return;
    const version = this.requestVersion;
    this.error.set(null);
    this.notice.set(null);
    this.current.set(null);
    this.basicReady.set(false);
    this.form.reset({
      title: entry.title,
      description: this.description()?.description ?? '',
      price: entry.price === null ? '' : vintedListingPriceText(Math.round(entry.price * 100)),
      brand: '',
      size: '',
      condition: '',
      package: '',
      color: '',
      material: '',
    });
    this.editing.set(true);
    this.loadingCurrent.set(true);
    try {
      let current: VintedListingCurrentContent;
      try {
        current = await this.store.readListingContent(this.connectionId(), this.entryId());
      } catch {
        // Kann die vollständige Maske nicht sicher gelesen werden, bleibt die bisherige
        // Bearbeitung von Titel, Beschreibung und Preis erhalten.
        const fields = await this.store.readListingEdit(this.connectionId(), this.entryId());
        if (!this.isCurrent(version) || !this.editing()) return;
        this.fillUntouched(fields);
        this.basicReady.set(true);
        this.notice.set(
          'Vinted hat nicht alle Angaben dieses Inserats geliefert. Du kannst Titel, Beschreibung und Preis ändern; alles andere bleibt unverändert.',
        );
        return;
      }
      if (!this.isCurrent(version) || !this.editing()) return;
      const selection = vintedListingEditSelection(current);
      this.arrangedPhotos.set(null);
      this.selectedPhoto.set(current.photoUrls[0] ?? null);
      this.current.set(current);
      this.fillUntouched({
        color: this.labelsOf('color', selection.color),
        material: this.labelsOf('material', selection.material),
        title: current.content.title,
        description: current.content.description,
        price: vintedListingPriceText(current.content.priceCents ?? 0),
        brand: selection.brand,
        size: selection.size,
        condition: selection.condition,
        package: selection.package,
      });
    } catch (error) {
      if (this.isCurrent(version)) {
        this.editing.set(false);
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Das Bearbeitungsformular konnte nicht geöffnet werden.',
        );
      }
    } finally {
      if (this.isCurrent(version)) this.loadingCurrent.set(false);
    }
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
        const basic = { title: fields.title, description: fields.description, price: fields.price };
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
        this.notice.set('Die Änderung wurde bei Vinted bestätigt.');
        return;
      }
      const content = applyVintedListingEdit(current, fields, {
        brand: fields.brand ?? '',
        size: fields.size ?? '',
        condition: fields.condition ?? '',
        package: fields.package ?? '',
        color: this.valuesOf('color', fields.color),
        material: this.valuesOf('material', fields.material),
      });
      const arranged = this.arrangedPhotos();
      const photos = arranged ? { base: current.photoUrls, desired: arranged } : undefined;
      await this.store.saveListingContent(
        this.connectionId(),
        this.entryId(),
        current.content,
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
              title: content.title,
              text: content.description,
              textState: 'loaded',
              price: (content.priceCents ?? 0) / 100,
              brand: content.brandLabel || null,
              size: content.sizeLabel || null,
              status: content.conditionLabel || entry.status,
              ...(photos
                ? { imageUrl: photos.desired[0] ?? null, imageUrls: [...photos.desired] }
                : {}),
            }
          : entry,
      );
      this.arrangedPhotos.set(null);
      this.selectedPhoto.set(photos?.desired[0] ?? this.selectedPhoto());
      this.description.set({ description: content.description, cacheState: 'unconfirmed' });
      this.notice.set('Die Änderung wurde bei Vinted bestätigt.');
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
