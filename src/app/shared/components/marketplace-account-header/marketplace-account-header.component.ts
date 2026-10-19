import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { marketplacePlatformAppearance } from '../../models/marketplace-platform';
@Component({
  selector: 'app-marketplace-account-header',
  imports: [NgOptimizedImage],
  templateUrl: './marketplace-account-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class MarketplaceAccountHeaderComponent {
  readonly platform = input.required<string>();
  readonly title = input('');
  readonly description = input('');
  readonly centered = input(false);
  readonly appearance = computed(() => marketplacePlatformAppearance(this.platform()));
}
