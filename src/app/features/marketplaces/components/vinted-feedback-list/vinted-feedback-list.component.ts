import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import {
  LucideBot,
  LucideDynamicIcon,
  LucideMessageSquare,
  LucideSparkles,
  LucideStar,
  LucideUser,
} from '@lucide/angular';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceFeedback, MarketplaceProfile } from '../../models/marketplace-read.models';

export type FeedbackFilter = 'all' | 'member' | 'automatic';

@Component({
  selector: 'app-vinted-feedback-list',
  imports: [
    DatePipe,
    DecimalPipe,
    BadgeComponent,
    CardComponent,
    ProductThumbnailComponent,
    LucideDynamicIcon,
  ],
  templateUrl: './vinted-feedback-list.component.html',
  styleUrl: './vinted-feedback-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedFeedbackListComponent {
  readonly profile = input<MarketplaceProfile | null>(null);
  readonly isConnected = input<boolean>(false);

  readonly activeFilter = signal<FeedbackFilter>('all');

  readonly starIcon = LucideStar;
  readonly userIcon = LucideUser;
  readonly botIcon = LucideBot;
  readonly sparklesIcon = LucideSparkles;
  readonly messageIcon = LucideMessageSquare;
  readonly stars = [1, 2, 3, 4, 5];

  readonly feedbacks = computed<readonly MarketplaceFeedback[]>(() => {
    return this.profile()?.feedbacks ?? [];
  });

  readonly totalFeedbacksCount = computed(() => {
    return this.profile()?.feedbackCount ?? this.feedbacks().length;
  });

  readonly memberFeedbacks = computed(() => {
    return this.feedbacks().filter((entry) => !entry.isAutomatic);
  });

  readonly automaticFeedbacks = computed(() => {
    return this.feedbacks().filter((entry) => entry.isAutomatic);
  });

  readonly memberCount = computed(() => {
    return this.memberFeedbacks().length;
  });

  readonly automaticCount = computed(() => {
    return this.automaticFeedbacks().length;
  });

  readonly reputationScore = computed(() => {
    const raw = this.profile()?.feedbackReputation;
    if (raw === null || raw === undefined || !Number.isFinite(raw) || raw < 0) return null;
    return Math.min(5, raw <= 1 ? raw * 5 : raw);
  });

  readonly filledStars = computed(() => {
    return Math.round(this.reputationScore() ?? 0);
  });

  readonly filteredFeedbacks = computed(() => {
    const filter = this.activeFilter();
    if (filter === 'member') return this.memberFeedbacks();
    if (filter === 'automatic') return this.automaticFeedbacks();
    return this.feedbacks();
  });

  setFilter(filter: FeedbackFilter): void {
    this.activeFilter.set(filter);
  }
}
