import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { LucideCheck, LucideDynamicIcon } from '@lucide/angular';
import type { MarketplaceId } from '../../../core/services/marketplace-settings.service';
import {
  marketplacePlatformAppearance,
  marketplacePlatformLabel,
} from '../../models/marketplace-platform';

@Component({
  selector: 'app-marketplace-platform-picker',
  imports: [NgOptimizedImage, LucideDynamicIcon],
  templateUrl: './marketplace-platform-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplacePlatformPickerComponent {
  readonly platforms = input.required<readonly MarketplaceId[]>();
  readonly selectedPlatforms = input.required<readonly MarketplaceId[]>();
  readonly disabledPlatforms = input<readonly MarketplaceId[]>([]);
  readonly disabled = input(false);
  readonly platformSelected = output<MarketplaceId>();
  readonly appearance = marketplacePlatformAppearance;
  readonly label = marketplacePlatformLabel;
  readonly checkIcon = LucideCheck;

  select(platform: MarketplaceId): void {
    if (!this.disabled() && !this.disabledPlatforms().includes(platform))
      this.platformSelected.emit(platform);
  }
}
