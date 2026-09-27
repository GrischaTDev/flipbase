import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  LucideClock,
  LucideDynamicIcon,
  LucideEye,
  LucideExternalLink,
  LucideHeart,
  LucideRuler,
  LucideShare2,
  LucideSparkles,
  LucideTag,
} from '@lucide/angular';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { FeedItem, safeVintedImage, safeVintedLink } from '../../models/deal-monitor.model';
import { DealFavoritesService } from '../../services/deal-favorites.service';
import { shareVintedListing } from '../../utils/share-vinted-listing';

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
  readonly inspect = output<FeedItem>();

  private readonly favoritesService = inject(DealFavoritesService);
  private readonly failedImages = signal<ReadonlySet<string>>(new Set());
  readonly shareMessage = signal<string | null>(null);

  readonly isFavorite = computed(() => this.favoritesService.isFavorite(this.item().id));

  readonly images = computed(() =>
    [...new Set(this.item().image_urls.map(safeVintedImage))]
      .filter((url): url is string => url !== null && !this.failedImages().has(url))
      .slice(0, 3),
  );
  readonly icons = {
    brand: LucideTag,
    condition: LucideSparkles,
    size: LucideRuler,
    discovered: LucideClock,
    external: LucideExternalLink,
    heart: LucideHeart,
    share: LucideShare2,
    eye: LucideEye,
  };
  readonly link = computed(() => safeVintedLink(this.item().url));

  imageFailed(url: string): void {
    this.failedImages.update((failed) => new Set([...failed, url]));
  }

  toggleFavorite(event?: Event): void {
    event?.stopPropagation();
    this.favoritesService.toggle(this.item());
  }

  openDetail(event?: Event): void {
    event?.stopPropagation();
    this.inspect.emit(this.item());
  }

  async share(): Promise<void> {
    const result = await shareVintedListing(this.item());
    this.shareMessage.set(
      result === 'copied'
        ? 'Link kopiert.'
        : result === 'unavailable'
          ? 'Teilen ist hier nicht verfügbar.'
          : null,
    );
  }
}
