import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { FeedItem, safeVintedImage, safeVintedLink } from '../../models/deal-monitor.model';

@Component({
  selector: 'app-deal-card',
  imports: [CardComponent, BadgeComponent, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './deal-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class DealCardComponent {
  readonly item = input.required<FeedItem>();
  readonly featured = input(false);
  readonly imageFailed = signal(false);
  readonly image = computed(() => safeVintedImage(this.item().image_urls[0]));
  readonly link = computed(() => safeVintedLink(this.item().url));
  readonly referenceLabel = computed(() =>
    this.item().reference_scope === 'category_brand_condition'
      ? 'Kategorie, Marke & Zustand'
      : this.item().reference_scope === 'category_condition'
        ? 'Kategorie & Zustand'
        : 'Historischer Vergleich',
  );
}
