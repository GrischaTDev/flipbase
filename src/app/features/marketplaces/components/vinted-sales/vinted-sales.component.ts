import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  BadgeComponent,
  type BadgeTone,
} from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';

@Component({
  selector: 'app-vinted-sales',
  imports: [
    CurrencyPipe,
    DatePipe,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    ProductThumbnailComponent,
  ],
  templateUrl: './vinted-sales.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedSalesComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly page = computed(() => this.store.snapshot()?.sales);
  readonly groups = computed(() => {
    const entries = this.page()?.items ?? [];
    return [
      {
        label: 'Aktuelle Verkaufsvorgänge',
        history: false,
        items: entries.filter((entry) => entry.saleState !== 'relisted'),
      },
      {
        label: 'Wieder eingestellte Stornierungen',
        history: true,
        items: entries.filter((entry) => entry.saleState === 'relisted'),
      },
    ];
  });
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
      case 'relisted':
        return { label: 'Wieder eingestellt', tone: 'neutral' };
      default:
        return { label: entry.status ?? 'Status noch nicht bestätigt', tone: 'neutral' };
    }
  }
}
