import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideArrowRight, LucideDynamicIcon } from '@lucide/angular';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import {
  MARKETPLACE_CONNECTION_LABELS,
  MARKETPLACE_CONNECTION_TONES,
} from '../../models/marketplace-presentation';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedAccountPreviewsStore } from '../../services/vinted-account-previews.store';
import { VintedRatingComponent } from '../vinted-rating/vinted-rating.component';

@Component({
  selector: 'app-vinted-account-grid',
  imports: [
    DecimalPipe,
    BadgeComponent,
    CardComponent,
    ButtonComponent,
    ProductThumbnailComponent,
    VintedRatingComponent,
    LucideDynamicIcon,
  ],
  templateUrl: './vinted-account-grid.component.html',
  providers: [VintedAccountPreviewsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedAccountGridComponent {
  readonly accounts = inject(MarketplaceAccountStore);
  readonly previews = inject(VintedAccountPreviewsStore);
  readonly statusLabels = MARKETPLACE_CONNECTION_LABELS;
  readonly statusTones = MARKETPLACE_CONNECTION_TONES;
  readonly arrowIcon = LucideArrowRight;
  readonly accountsRoute = '/settings/marketplaces';
}
