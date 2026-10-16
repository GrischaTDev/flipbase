import type { KleinanzeigenListingJob } from '../../models/kleinanzeigen-listing-job';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MarketplaceSettingsService } from '../../../../core/services/marketplace-settings.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ListingTransferDialogComponent } from '../listing-transfer-dialog/listing-transfer-dialog.component';
import type { MarketplaceListingReference } from '../../models/marketplace-overview.models';
@Component({
  selector: 'app-listing-transfer-action',
  imports: [ButtonComponent, ListingTransferDialogComponent],
  templateUrl: './listing-transfer-action.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class ListingTransferActionComponent {
  readonly source = input.required<MarketplaceListingReference>();
  readonly title = input('Inserat');
  readonly compact = input(false);
  readonly open = signal(false);
  readonly published = output<KleinanzeigenListingJob>();
  private readonly settings = inject(MarketplaceSettingsService);
  readonly reference = computed(() => this.source(), {
    equal: (a, b) =>
      a.platform === b.platform &&
      a.workspaceId === b.workspaceId &&
      a.connectionId === b.connectionId &&
      a.externalId === b.externalId,
  });
  readonly available = computed(
    () =>
      this.reference().platform === 'vinted' &&
      /^[1-9][0-9]{0,31}$/u.test(this.reference().externalId) &&
      this.settings.ready() &&
      this.settings.isKleinanzeigenEnabled(),
  );
  constructor() {
    effect(() => {
      this.reference();
      const available = this.available();
      untracked(() => {
        if (!available || this.open()) this.open.set(false);
      });
    });
  }
}
