import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  LucideClock,
  LucideDynamicIcon,
  LucideExternalLink,
  LucideRuler,
  LucideShieldCheck,
  LucideSparkles,
  LucideTag,
} from '@lucide/angular';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { FeedItem, safeVintedImage, safeVintedLink } from '../../models/deal-monitor.model';

@Component({
  selector: 'app-deal-card',
  imports: [
    CardComponent,
    BadgeComponent,
    ButtonComponent,
    LucideDynamicIcon,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
  ],
  templateUrl: './deal-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class DealCardComponent {
  readonly item = input.required<FeedItem>();
  readonly featured = input(false);
  private readonly failedImages = signal<ReadonlySet<string>>(new Set());
  readonly images = computed(() =>
    [...new Set(this.item().image_urls.map(safeVintedImage))]
      .filter((url): url is string => url !== null && !this.failedImages().has(url))
      .slice(0, 3),
  );
  readonly icons = {
    brand: LucideTag,
    condition: LucideSparkles,
    size: LucideRuler,
    protection: LucideShieldCheck,
    discovered: LucideClock,
    external: LucideExternalLink,
  };
  readonly link = computed(() => safeVintedLink(this.item().url));
  readonly referenceLabel = computed(() =>
    this.item().reference_scope === 'category_brand_condition'
      ? 'Kategorie, Marke & Zustand'
      : this.item().reference_scope === 'category_condition'
        ? 'Kategorie & Zustand'
        : 'Historischer Vergleich',
  );

  imageFailed(url: string): void {
    this.failedImages.update((failed) => new Set([...failed, url]));
  }
}
