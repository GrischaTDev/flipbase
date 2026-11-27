import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { LucideExternalLink, LucideHeart } from '@lucide/angular';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  FRESH_ARTICLE_MS,
  FeedItem,
  safeVintedImage,
  safeVintedLink,
} from '../../models/deal-monitor.model';
import { DealFavoritesService } from '../../services/deal-favorites.service';
import { FeedClockService } from '../../services/feed-clock.service';
import { discoveryAge } from '../../utils/discovery-date';

@Component({
  selector: 'app-deal-card',
  imports: [CardComponent, BadgeComponent, ButtonComponent, CurrencyPipe, DatePipe],
  templateUrl: './deal-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class DealCardComponent {
  readonly item = input.required<FeedItem>();
  readonly inspect = output<FeedItem>();

  readonly favoritesService = inject(DealFavoritesService);
  private readonly failedImages = signal<ReadonlySet<string>>(new Set());

  readonly isFavorite = computed(() => this.favoritesService.isFavorite(this.item()));

  readonly images = computed(() =>
    [...new Set(this.item().image_urls.map(safeVintedImage))].filter(
      (url): url is string => url !== null && !this.failedImages().has(url),
    ),
  );
  readonly icons = {
    external: LucideExternalLink,
    heart: LucideHeart,
  };
  private readonly clock = inject(FeedClockService);
  readonly discoveredLabel = computed(() =>
    discoveryAge(this.item().first_seen_at, this.clock.now()),
  );
  readonly isFresh = computed(() => {
    const discoveredAt = Date.parse(this.item().first_seen_at);
    return (
      !Number.isNaN(discoveredAt) && this.clock.now().getTime() - discoveredAt < FRESH_ARTICLE_MS
    );
  });
  readonly link = computed(() => safeVintedLink(this.item().url));

  imageFailed(url: string): void {
    this.failedImages.update((failed) => new Set([...failed, url]));
  }

  toggleFavorite(event?: Event): void {
    event?.stopPropagation();
    void this.favoritesService.toggle(this.item());
  }

  openDetail(event?: Event): void {
    event?.stopPropagation();
    this.inspect.emit(this.item());
  }
}
