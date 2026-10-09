import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideDynamicIcon,
  LucideExternalLink as ExternalLink,
  LucideInfo as Info,
  LucideSparkles as Sparkles,
  LucideStore as Store,
} from '@lucide/angular';
import {
  MarketplaceId,
  MarketplaceSettingsService,
} from '../../../../core/services/marketplace-settings.service';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';

@Component({
  selector: 'app-marketplaces-settings',
  imports: [RouterLink, LucideDynamicIcon, CardComponent, BadgeComponent, CustomCheckboxComponent],
  templateUrl: './marketplaces-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplacesSettingsComponent {
  private readonly marketplaceSettings = inject(MarketplaceSettingsService);

  readonly storeIcon = Store;
  readonly sparklesIcon = Sparkles;
  readonly externalLinkIcon = ExternalLink;
  readonly infoIcon = Info;

  readonly isVintedEnabled = this.marketplaceSettings.isVintedEnabled;
  readonly isEbayEnabled = this.marketplaceSettings.isEbayEnabled;
  readonly isKleinanzeigenEnabled = this.marketplaceSettings.isKleinanzeigenEnabled;
  readonly activeCount = this.marketplaceSettings.activeCount;

  onToggle(marketplace: MarketplaceId, enabled: boolean): void {
    this.marketplaceSettings.setMarketplaceEnabled(marketplace, enabled);
  }
}
