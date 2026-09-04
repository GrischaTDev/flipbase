import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideCheckCircle2, LucideDynamicIcon, LucideSmartphone } from '@lucide/angular';
import { EbayApiService } from '../../../../core/services/ebay-api.service';
import { PwaService } from '../../../../core/services/pwa.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';

@Component({
  selector: 'app-app-settings',
  imports: [ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './app-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AppSettingsComponent {
  readonly pwaService = inject(PwaService);
  private readonly ebayApiService = inject(EbayApiService);
  private readonly toast = inject(ToastService);
  readonly smartphoneIcon = LucideSmartphone;
  readonly checkIcon = LucideCheckCircle2;
  readonly ebayForm = new FormGroup({
    appId: new FormControl(''),
    globalId: new FormControl('EBAY-DE'),
  });
  constructor() {
    const config = this.ebayApiService.getConfig();
    this.ebayForm.patchValue({ appId: config.appId || '', globalId: config.siteId || 'EBAY-DE' });
  }
  onSaveEbayConfig(): void {
    const value = this.ebayForm.getRawValue();
    this.ebayApiService.saveConfig({
      appId: value.appId?.trim() || undefined,
      siteId: value.globalId || 'EBAY-DE',
    });
    this.toast.success('eBay-Verbindung wurde gespeichert.');
  }
}
