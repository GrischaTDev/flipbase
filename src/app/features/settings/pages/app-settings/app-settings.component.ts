import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideCheckCircle2, LucideDynamicIcon, LucideSmartphone } from '@lucide/angular';
import { PwaService } from '../../../../core/services/pwa.service';
import { EbayAccountComponent } from '../../../marketplaces/components/ebay-account/ebay-account.component';

@Component({
  selector: 'app-app-settings',
  imports: [LucideDynamicIcon, EbayAccountComponent],
  templateUrl: './app-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AppSettingsComponent {
  readonly pwaService = inject(PwaService);
  readonly smartphoneIcon = LucideSmartphone;
  readonly checkIcon = LucideCheckCircle2;
}
