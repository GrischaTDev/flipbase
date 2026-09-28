import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon, LucideStar } from '@lucide/angular';

@Component({
  selector: 'app-vinted-rating',
  imports: [DecimalPipe, LucideDynamicIcon],
  templateUrl: './vinted-rating.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedRatingComponent {
  readonly count = input<number | null>(null);
  readonly reputation = input<number | null>(null);
  readonly stars = [1, 2, 3, 4, 5];
  readonly starIcon = LucideStar;
  readonly score = computed(() => {
    const value = this.reputation();
    if (value === null || !Number.isFinite(value) || value < 0) return null;
    return Math.min(5, value <= 1 ? value * 5 : value);
  });
  readonly filledStars = computed(() => Math.round(this.score() ?? 0));
  readonly scoreLabel = computed(() =>
    this.score() === null ? '' : `${this.score()?.toFixed(1).replace('.', ',')} von 5 Sternen`,
  );
}
