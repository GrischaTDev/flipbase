import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideExternalLink as ExternalLink } from '@lucide/angular';
import {
  MarketplaceId,
  MarketplaceSettingsService,
} from '../../../../core/services/marketplace-settings.service';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

@Component({
  selector: 'app-marketplaces-settings',
  imports: [ButtonComponent, CardComponent, BadgeComponent, CustomCheckboxComponent],
  templateUrl: './marketplaces-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplacesSettingsComponent {
  private readonly marketplaceSettings = inject(MarketplaceSettingsService);

  readonly externalLinkIcon = ExternalLink;

  readonly isVintedEnabled = this.marketplaceSettings.isVintedEnabled;
  readonly isEbayEnabled = this.marketplaceSettings.isEbayEnabled;
  readonly isKleinanzeigenEnabled = this.marketplaceSettings.isKleinanzeigenEnabled;
  readonly activeCount = this.marketplaceSettings.activeCount;

  onToggle(marketplace: MarketplaceId, enabled: boolean): void {
    this.marketplaceSettings.setMarketplaceEnabled(marketplace, enabled);
  }
}
