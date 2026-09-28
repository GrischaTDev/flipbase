import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';

@Component({
  selector: 'app-vinted-listing-detail',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    ButtonComponent,
    CardComponent,
    NoticeBannerComponent,
    ProductThumbnailComponent,
    TextFieldComponent,
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
  readonly connectionId = this.route.snapshot.paramMap.get('connectionId') ?? '';
  readonly entryId = this.route.snapshot.paramMap.get('entryId') ?? '';
  readonly entry = signal<MarketplaceEntry | null>(null);
  readonly photos = computed(() => {
    const entry = this.entry();
    return entry?.imageUrls?.length ? entry.imageUrls : entry?.imageUrl ? [entry.imageUrl] : [];
  });
  readonly selectedPhoto = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadingDescription = signal(false);
  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly form = this.builder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(2000)]],
    price: ['', [Validators.required, Validators.pattern(/^\d{1,6}(?:[,.]\d{1,2})?$/)]],
  });
  private requested = false;
  private selected = false;
  private destroyed = false;

  constructor() {
    this.destroy.onDestroy(() => {
      this.destroyed = true;
    });
    effect(() => {
      const accounts = this.store.connections();
      const selected = this.store.selectedConnection();
      if (!accounts.length) return;
      if (!accounts.some((account) => account.connectionId === this.connectionId)) {
        void this.router.navigate(['/marketplaces/vinted/listings']);
        return;
      }
      if (!this.selected && selected?.connectionId !== this.connectionId) {
        void this.store.selectConnection(this.connectionId);
        return;
      }
      if (selected?.connectionId !== this.connectionId) {
        void this.router.navigate(['/marketplaces/vinted/listings']);
        return;
      }
      this.selected = true;
      if (this.requested) return;
      this.requested = true;
      void this.load();
    });
  }

  private async load(): Promise<void> {
    try {
      const entry = await this.store.readPublication(this.connectionId, this.entryId);
      if (!this.destroyed) {
        this.entry.set(entry);
        this.selectedPhoto.set(entry?.imageUrl ?? null);
        if (
          entry &&
          entry.textState !== 'loaded' &&
          this.store.selectedConnection()?.status === 'connected'
        )
          void this.loadDescription();
      }
    } catch {
      if (!this.destroyed) this.error.set('Das Inserat konnte nicht geladen werden.');
    } finally {
      if (!this.destroyed) this.loading.set(false);
    }
  }

  private async loadDescription(): Promise<void> {
    this.loadingDescription.set(true);
    try {
      const fields = await this.store.readListingEdit(this.connectionId, this.entryId);
      if (!this.destroyed && this.store.selectedConnection()?.connectionId === this.connectionId)
        this.entry.update((entry) =>
          entry ? { ...entry, text: fields.description, textState: 'loaded' } : entry,
        );
    } catch {
      // Gespeicherte Artikeldaten bleiben auch bei einem vorübergehenden Browserfehler nutzbar.
    } finally {
      if (!this.destroyed) this.loadingDescription.set(false);
    }
  }

  async edit(): Promise<void> {
    if (this.busy() || !this.entry()) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const fields = await this.store.readListingEdit(this.connectionId, this.entryId);
      if (this.destroyed || this.store.selectedConnection()?.connectionId !== this.connectionId)
        return;
      this.form.setValue(fields);
      this.editing.set(true);
    } catch (error) {
      if (!this.destroyed)
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Das Bearbeitungsformular konnte nicht geöffnet werden.',
        );
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.busy() || !this.editing()) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const fields = this.form.getRawValue();
      await this.store.saveListingEdit(this.connectionId, this.entryId, fields);
      if (this.destroyed) return;
      this.editing.set(false);
      this.entry.update((entry) =>
        entry
          ? {
              ...entry,
              title: fields.title,
              text: fields.description,
              textState: 'loaded',
              price: Number(fields.price.replace(',', '.')),
            }
          : entry,
      );
      this.notice.set(
        'Die Änderung wurde bei Vinted bestätigt. Aktualisiere die Kontodaten für alle Ansichten.',
      );
    } catch (error) {
      if (!this.destroyed)
        this.error.set(
          error instanceof Error ? error.message : 'Die Änderung konnte nicht bestätigt werden.',
        );
    } finally {
      if (!this.destroyed) this.busy.set(false);
    }
  }
}
