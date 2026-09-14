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
  LucideChevronLeft,
  LucideChevronRight,
  LucideClock,
  LucideDynamicIcon,
  LucideEye,
  LucideExternalLink,
  LucideHeart,
  LucideRuler,
  LucideShieldCheck,
  LucideSparkles,
  LucideTag,
} from '@lucide/angular';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { FeedItem, safeVintedImage, safeVintedLink } from '../../models/deal-monitor.model';
import { DealFavoritesService } from '../../services/deal-favorites.service';

@Component({
  selector: 'app-deal-detail-modal',
  imports: [
    ModalShellComponent,
    BadgeComponent,
    ButtonComponent,
    LucideDynamicIcon,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
  ],
  templateUrl: './deal-detail-modal.component.html',
  styleUrl: './deal-detail-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DealDetailModalComponent {
  readonly item = input.required<FeedItem>();
  readonly closed = output<void>();

  private readonly favoritesService = inject(DealFavoritesService);

  readonly activeImageIndex = signal<number>(0);
  private readonly failedImages = signal<ReadonlySet<string>>(new Set());

  readonly validImages = computed(() =>
    [...new Set(this.item().image_urls.map(safeVintedImage))].filter(
      (url): url is string => url !== null && !this.failedImages().has(url),
    ),
  );

  readonly activeImage = computed(() => {
    const images = this.validImages();
    if (images.length === 0) return null;
    const index = this.activeImageIndex();
    return images[index] ?? images[0] ?? null;
  });

  readonly isFavorite = computed(() => this.favoritesService.isFavorite(this.item().id));
  readonly link = computed(() => safeVintedLink(this.item().url));

  readonly referenceLabel = computed(() =>
    this.item().reference_scope === 'category_brand_condition'
      ? 'Kategorie, Marke & Zustand'
      : this.item().reference_scope === 'category_condition'
        ? 'Kategorie & Zustand'
        : 'Historischer Vergleich',
  );

  readonly icons = {
    brand: LucideTag,
    condition: LucideSparkles,
    size: LucideRuler,
    protection: LucideShieldCheck,
    discovered: LucideClock,
    external: LucideExternalLink,
    heart: LucideHeart,
    eye: LucideEye,
    prev: LucideChevronLeft,
    next: LucideChevronRight,
  };

  imageFailed(url: string): void {
    this.failedImages.update((failed) => new Set([...failed, url]));
  }

  selectImage(index: number): void {
    this.activeImageIndex.set(index);
  }

  prevImage(): void {
    const total = this.validImages().length;
    if (total <= 1) return;
    this.activeImageIndex.update((current) => (current - 1 + total) % total);
  }

  nextImage(): void {
    const total = this.validImages().length;
    if (total <= 1) return;
    this.activeImageIndex.update((current) => (current + 1) % total);
  }

  toggleFavorite(): void {
    this.favoritesService.toggle(this.item());
  }
}
