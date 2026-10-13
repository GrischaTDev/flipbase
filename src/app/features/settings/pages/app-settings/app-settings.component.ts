import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideCheckCircle2, LucideDynamicIcon, LucideSmartphone } from '@lucide/angular';
import { PwaService } from '../../../../core/services/pwa.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EbayAccountComponent } from '../../../marketplaces/components/ebay-account/ebay-account.component';

@Component({
  selector: 'app-app-settings',
  imports: [LucideDynamicIcon, EbayAccountComponent, ButtonComponent, RouterLink],
  templateUrl: './app-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AppSettingsComponent {
  readonly pwaService = inject(PwaService);
  readonly smartphoneIcon = LucideSmartphone;
  readonly checkIcon = LucideCheckCircle2;
}
