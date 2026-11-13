import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import {
  BadgeComponent,
  type BadgeTone,
} from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedShippingLabelStore } from '../../services/vinted-shipping-label.store';
import { VintedShippingLabelActionsComponent } from '../vinted-shipping-label-actions/vinted-shipping-label-actions.component';

@Component({
  selector: 'app-vinted-sales',
  imports: [
    CurrencyPipe,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    ProductThumbnailComponent,
    VintedShippingLabelActionsComponent,
  ],
  templateUrl: './vinted-sales.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedSalesComponent {
  readonly store = inject(MarketplaceAccountStore);
  private readonly shippingLabels = inject(VintedShippingLabelStore);
  constructor() {
    // Versandscheine gibt es nur für Cloud-Konten; sie gehören zum gewählten Konto.
    effect(() => {
      const connection = this.store.selectedConnection();
      if (connection?.executionMode !== 'cloud') return;
      const scope = { workspaceId: connection.workspaceId, connectionId: connection.connectionId };
      untracked(() => void this.shippingLabels.load(scope));
    });
  }
  readonly page = computed(() => this.store.snapshot()?.sales);
  readonly entries = computed(() =>
    (this.page()?.items ?? []).filter((entry) => entry.saleState !== 'relisted'),
  );
  details(entry: MarketplaceEntry): string {
    if (entry.isBundle || (entry.itemCount ?? 0) > 1)
      return entry.itemCount ? `Paket mit ${entry.itemCount} Artikeln` : 'Artikelpaket';
    return [entry.brand, entry.size].filter(Boolean).join(' \u00b7 ') || 'Einzelartikel';
  }
  badge(entry: MarketplaceEntry): { label: string; tone: BadgeTone } {
    switch (entry.saleState) {
      case 'sold':
        return { label: 'Verkauft', tone: 'info' };
      case 'shipped':
        return { label: 'Versendet', tone: 'info' };
      case 'completed':
        return { label: 'Abgeschlossen', tone: 'success' };
      case 'cancelled':
        return { label: 'Storniert', tone: 'critical' };
      default:
        return { label: entry.status ?? 'Status noch nicht bestätigt', tone: 'neutral' };
    }
  }
}
