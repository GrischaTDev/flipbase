import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedFeedbackListComponent } from '../vinted-feedback-list/vinted-feedback-list.component';
import { VintedProfileEditorComponent } from '../vinted-profile-editor/vinted-profile-editor.component';
import { VintedAccountViewService } from '../../services/vinted-account-view.service';
import { VintedAccountSummariesComponent } from '../vinted-account-summaries/vinted-account-summaries.component';

@Component({
  selector: 'app-vinted-profile',
  imports: [
    CardComponent,
    ProductThumbnailComponent,
    VintedFeedbackListComponent,
    VintedProfileEditorComponent,
    VintedAccountSummariesComponent,
  ],
  templateUrl: './vinted-profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedProfileComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly accountView = inject(VintedAccountViewService);
  private readonly route = inject(ActivatedRoute);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly fragment = toSignal(this.route.fragment, {
    initialValue: this.route.snapshot.fragment,
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private focusedReviewsSection: HTMLElement | null = null;

  constructor() {
    afterRenderEffect(() => {
      this.store.snapshot();
      const allAccounts = this.accountView.showAllAccounts();
      const targetId = this.query()?.get('connectionId');
      const id = allAccounts && targetId ? 'reviews-' + targetId : 'reviews';
      const reviews =
        this.fragment() === 'reviews'
          ? [...this.host.nativeElement.querySelectorAll<HTMLElement>('[id]')].find(
              (node) => node.id === id,
            )
          : null;
      if (reviews && reviews !== this.focusedReviewsSection) reviews.focus();
      this.focusedReviewsSection = reviews ?? null;
    });
  }
}
