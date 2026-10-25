import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { LucideRefreshCw } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { KleinanzeigenExtensionBridge } from '../../services/kleinanzeigen-extension-bridge';
import { KleinanzeigenRelistingService } from '../../services/kleinanzeigen-relisting.service';
import type { MarketplaceOverviewSection } from '../../services/marketplace-overview.store';
import type { KleinanzeigenRelistingAttempt } from '../../models/kleinanzeigen-relisting';

@Component({
  selector: 'app-kleinanzeigen-relisting-action',
  imports: [ButtonComponent, NoticeBannerComponent],
  providers: [KleinanzeigenExtensionBridge, KleinanzeigenRelistingService],
  templateUrl: './kleinanzeigen-relisting-action.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class KleinanzeigenRelistingActionComponent {
  readonly section = input.required<MarketplaceOverviewSection>();
  readonly changed = output<void>();
  readonly relisting = inject(KleinanzeigenRelistingService);
  readonly icon = LucideRefreshCw;
  constructor() {
    const extension = inject(KleinanzeigenExtensionBridge);
    extension.checkInstallation();
    const scopeKey = computed(() =>
      extension.relistingAvailable()
        ? this.section().account.workspaceId + ':' + this.section().account.connectionId
        : '',
    );
    effect(() => {
      if (scopeKey()) untracked(() => void this.relisting.loadPending(this.section()));
    });
  }
  async run(resume?: KleinanzeigenRelistingAttempt): Promise<void> {
    if (await this.relisting.run(this.section(), resume)) this.changed.emit();
  }
}
