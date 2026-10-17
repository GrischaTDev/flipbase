import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
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
  readonly showAccountManagement = input(true);
  private readonly marketplaceSettings = inject(MarketplaceSettingsService);

  readonly externalLinkIcon = ExternalLink;

  readonly isVintedEnabled = this.marketplaceSettings.isVintedEnabled;
  readonly isEbayEnabled = this.marketplaceSettings.isEbayEnabled;
  readonly isKleinanzeigenEnabled = this.marketplaceSettings.isKleinanzeigenEnabled;
  readonly activeCount = this.marketplaceSettings.activeCount;
  readonly settingsLoading = this.marketplaceSettings.loading;
  readonly settingsSaving = this.marketplaceSettings.saving;
  readonly settingsReady = this.marketplaceSettings.ready;
  readonly settingsError = this.marketplaceSettings.error;

  async onRetry(): Promise<void> {
    await this.marketplaceSettings.retryLoad();
  }

  async onToggle(marketplace: MarketplaceId, enabled: boolean): Promise<void> {
    await this.marketplaceSettings.setMarketplaceEnabled(marketplace, enabled);
  }
}
