import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon, LucideStore } from '@lucide/angular';
import {
  marketplacePlatformAppearance,
  marketplacePlatformLabel,
} from '../../models/marketplace-platform';

@Component({
  selector: 'app-marketplace-platform-identity',
  imports: [NgOptimizedImage, LucideDynamicIcon],
  templateUrl: './marketplace-platform-identity.component.html',
  host: { class: 'inline-flex min-w-0 align-middle' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplacePlatformIdentityComponent {
  readonly platform = input.required<string>();

  readonly label = computed(() => marketplacePlatformLabel(this.platform()));
  readonly appearance = computed(() => marketplacePlatformAppearance(this.platform()));
  readonly storeIcon = LucideStore;
}
