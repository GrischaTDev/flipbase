import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  LucideHeart,
  LucideSlidersHorizontal,
  LucideTrash2,
  LucideDynamicIcon,
} from '@lucide/angular';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { DealCardComponent } from '../../components/deal-card/deal-card.component';
import { DealDetailModalComponent } from '../../components/deal-detail-modal/deal-detail-modal.component';
import { DealFavoritesService } from '../../services/deal-favorites.service';
import { FeedItem } from '../../models/deal-monitor.model';
import { matchesSize } from '../../utils/size-matcher';

@Component({
  selector: 'app-deal-favorites',
  imports: [
    RouterLink,
    UpperCasePipe,
    PageHeaderComponent,
    ButtonComponent,
    BadgeComponent,
    CustomSelectComponent,
    ModalShellComponent,
    DealCardComponent,
    DealDetailModalComponent,
    LucideDynamicIcon,
  ],
  templateUrl: './deal-favorites.component.html',
  styleUrl: './deal-favorites.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DealFavoritesComponent {
  private readonly favoritesService = inject(DealFavoritesService);

  readonly favorites = this.favoritesService.favorites;
  readonly count = this.favoritesService.count;

  readonly selectedSize = signal<string | null>(null);
  readonly selectedDeal = signal<FeedItem | null>(null);
  readonly confirmClear = signal(false);

  readonly sizeOptions = [
    { value: null as string | null, label: 'Alle Größen' },
    { value: 'xs', label: 'XS' },
    { value: 's', label: 'S' },
    { value: 'm', label: 'M' },
    { value: 'l', label: 'L' },
    { value: 'xl', label: 'XL' },
    { value: 'xxl', label: 'XXL (2XL)' },
    { value: '3xl', label: '3XL+' },
  ];

  readonly filteredFavorites = computed(() => {
    const size = this.selectedSize();
    const items = this.favorites();
    if (!size) return items;
    return items.filter((item) => matchesSize(item.size, size));
  });

  readonly countBadge = computed(() => {
    const total = this.count();
    return total === 1 ? '1 gemerkt' : `${total} gemerkt`;
  });

  readonly icons = {
    heart: LucideHeart,
    trash: LucideTrash2,
    sliders: LucideSlidersHorizontal,
  };

  clearAll(): void {
    this.favoritesService.clear();
    this.confirmClear.set(false);
  }
}
