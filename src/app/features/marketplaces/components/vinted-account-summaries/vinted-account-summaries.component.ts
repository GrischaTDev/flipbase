import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LucideUser } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { vintedAccountLabels } from '../../models/vinted-account-labels';
import { VintedAccountPreviewsStore } from '../../services/vinted-account-previews.store';
import { VintedFeedbackListComponent } from '../vinted-feedback-list/vinted-feedback-list.component';
import { VintedRatingComponent } from '../vinted-rating/vinted-rating.component';

@Component({
  selector: 'app-vinted-account-summaries',
  imports: [
    ButtonComponent,
    CardComponent,
    ProductThumbnailComponent,
    VintedFeedbackListComponent,
    VintedRatingComponent,
  ],
  providers: [VintedAccountPreviewsStore],
  templateUrl: './vinted-account-summaries.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedAccountSummariesComponent {
  readonly showReviews = input(false);
  readonly previews = inject(VintedAccountPreviewsStore);
  readonly userIcon = LucideUser;
  readonly labels = computed(() =>
    vintedAccountLabels(this.previews.tiles().map(({ connection }) => connection)),
  );
}
