import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import {
  validateFavoriteOffer,
  type ListingFavoriteDiscount,
} from '../../models/vinted-favorite-messages';
import { VintedFavoriteMessageApiService } from '../../services/vinted-favorite-message-api.service';
import { VintedFavoriteDiscountFieldComponent } from '../vinted-favorite-discount-field/vinted-favorite-discount-field.component';

@Component({
  selector: 'app-vinted-listing-favorite-discount-dialog',
  imports: [
    ButtonComponent,
    ModalShellComponent,
    NoticeBannerComponent,
    VintedFavoriteDiscountFieldComponent,
  ],
  templateUrl: './vinted-listing-favorite-discount-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingFavoriteDiscountDialogComponent implements OnInit {
  private readonly api = inject(VintedFavoriteMessageApiService);
  private readonly destroy = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  readonly entry = input.required<MarketplaceEntry>();
  readonly closed = output<void>();
  readonly settings = signal<ListingFavoriteDiscount | null>(null);
  readonly discountPercent = signal<number | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly priceCents = computed(() => {
    const entry = this.entry();
    return entry.price === null
      ? (entry.listingContent?.priceCents ?? null)
      : Math.round(entry.price * 100);
  });
  readonly canSave = computed(() => {
    const settings = this.settings();
    const percent = this.discountPercent();
    return (
      settings?.enabled &&
      percent !== settings.discountPercent &&
      (percent === null || validateFavoriteOffer({ type: 'percentage', value: percent }))
    );
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    const entry = this.entry();
    if (this.loading() || !entry.externalId) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const settings = await this.api.readListingDiscount(entry, entry.externalId);
      if (this.destroy.destroyed) return;
      this.settings.set(settings);
      this.discountPercent.set(settings.discountPercent);
    } catch {
      if (!this.destroy.destroyed) this.error.set('Der Rabatt konnte nicht geladen werden.');
    } finally {
      if (!this.destroy.destroyed) this.loading.set(false);
    }
  }

  close(): void {
    if (!this.saving()) this.closed.emit();
  }

  async save(): Promise<void> {
    const entry = this.entry();
    if (this.saving() || !this.canSave() || !entry.externalId) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.saveListingDiscount(entry, entry.externalId, this.discountPercent());
      if (this.destroy.destroyed) return;
      this.toast.success('Rabatt gespeichert', entry.title);
      this.closed.emit();
    } catch {
      if (!this.destroy.destroyed) this.error.set('Der Rabatt konnte nicht gespeichert werden.');
    } finally {
      if (!this.destroy.destroyed) this.saving.set(false);
    }
  }
}
