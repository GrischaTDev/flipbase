import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { LucideArrowRight } from '@lucide/angular';
import {
  MarketplaceId,
  MarketplaceSettingsService,
} from '../../../../core/services/marketplace-settings.service';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { MarketplacePlatformPickerComponent } from '../../../../shared/components/marketplace-platform-picker/marketplace-platform-picker.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

@Component({
  selector: 'app-marketplaces-settings',
  imports: [NgTemplateOutlet, ButtonComponent, CardComponent, MarketplacePlatformPickerComponent],
  templateUrl: './marketplaces-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplacesSettingsComponent {
  // Die Routenbindung setzt fehlende Eingänge auf undefined; nur ausdrücklich false blendet aus.
  readonly showAccountManagement = input(true, {
    transform: (value: unknown) => (typeof value === 'boolean' ? value : true),
  });
  private readonly marketplaceSettings = inject(MarketplaceSettingsService);

  readonly platforms: readonly MarketplaceId[] = ['vinted', 'ebay', 'kleinanzeigen'];
  readonly selectedPlatforms = computed(() =>
    this.platforms.filter((platform) => this.marketplaceSettings.settings()[platform]),
  );
  togglePlatform(platform: MarketplaceId): void {
    void this.onToggle(platform, !this.marketplaceSettings.settings()[platform]);
  }

  readonly overviewIcon = LucideArrowRight;

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
