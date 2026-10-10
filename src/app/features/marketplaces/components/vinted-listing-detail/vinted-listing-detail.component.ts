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
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
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
    CardComponent,
    CustomCheckboxComponent,
    CustomSelectComponent,
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
  readonly photos = computed(() => {
    const entry = this.entry();
    return entry?.imageUrls?.length ? entry.imageUrls : entry?.imageUrl ? [entry.imageUrl] : [];
  });
  readonly selectedPhoto = signal<string | null>(null);
  readonly description = signal<VintedListingDescription | null>(null);
  readonly loading = signal(true);
  readonly loadingDescription = signal(false);
  readonly descriptionError = signal(false);
  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly metricDisplay = createVintedListingMetricDisplay(this.store, () =>
    this.entry() ? [this.entry()!] : [],
  );
  readonly form = this.builder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.required, Validators.maxLength(2000)]],
    price: ['', [Validators.required, Validators.pattern(/^\d{1,6}(?:[,.]\d{1,2})?$/)]],
    brand: [''],
    size: [''],
    condition: [''],
    package: [''],
  });
  /** Frisch gelesener Vinted-Stand, auf dem die laufende Bearbeitung beruht. */
  readonly current = signal<VintedListingCurrentContent | null>(null);
  readonly colors = signal<readonly string[]>([]);
  readonly materials = signal<readonly string[]>([]);
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
  readonly multipleFields = computed(() =>
    (
      [
        ['color', 'Farben', 2, this.colors()],
        ['material', 'Material', 3, this.materials()],
      ] as const
    ).flatMap(([field, label, max, selected]) => {
      const options = this.options(field);
      return options.length ? [{ field, label, max, options, selected }] : [];
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
    this.busy.set(false);
    this.error.set(null);
    this.notice.set(null);
    this.form.reset();
    this.current.set(null);
    this.colors.set([]);
    this.materials.set([]);
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
  toggle(field: 'color' | 'material', value: string, checked: boolean, max: number): void {
    const selected = field === 'color' ? this.colors : this.materials;
    selected.update((values) =>
      checked
        ? values.includes(value) || values.length >= max
          ? values
          : [...values, value]
        : values.filter((entry) => entry !== value),
    );
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
  async edit(): Promise<void> {
    if (this.busy() || !this.entry()) return;
    const version = this.requestVersion;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const current = await this.store.readListingContent(this.connectionId(), this.entryId());
      if (!this.isCurrent(version)) return;
      const selection = vintedListingEditSelection(current);
      this.current.set(current);
      this.colors.set(selection.color);
      this.materials.set(selection.material);
      this.form.setValue({
        title: current.content.title,
        description: current.content.description,
        price: vintedListingPriceText(current.content.priceCents ?? 0),
        brand: selection.brand,
        size: selection.size,
        condition: selection.condition,
        package: selection.package,
      });
      this.editing.set(true);
    } catch (error) {
      if (this.isCurrent(version))
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Das Bearbeitungsformular konnte nicht geöffnet werden.',
        );
    } finally {
      if (this.isCurrent(version)) this.busy.set(false);
    }
  }
  async save(): Promise<void> {
    if (this.form.invalid || this.busy() || !this.editing()) {
      this.form.markAllAsTouched();
      return;
    }
    const version = this.requestVersion;
    this.busy.set(true);
    this.error.set(null);
    try {
      const current = this.current();
      if (!current) return;
      const fields = this.form.getRawValue();
      const content = applyVintedListingEdit(current, fields, {
        brand: fields.brand ?? '',
        size: fields.size ?? '',
        condition: fields.condition ?? '',
        package: fields.package ?? '',
        color: this.colors(),
        material: this.materials(),
      });
      await this.store.saveListingContent(
        this.connectionId(),
        this.entryId(),
        current.content,
        content,
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
            }
          : entry,
      );
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
