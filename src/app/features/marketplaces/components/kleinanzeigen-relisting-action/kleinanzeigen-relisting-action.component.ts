import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { LucideRefreshCw } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { KleinanzeigenRelistingService } from '../../services/kleinanzeigen-relisting.service';
import type { MarketplaceOverviewSection } from '../../services/marketplace-overview.store';
import type { KleinanzeigenRelistingAttempt } from '../../models/kleinanzeigen-relisting';

@Component({
  selector: 'app-kleinanzeigen-relisting-action',
  imports: [ButtonComponent],
  templateUrl: './kleinanzeigen-relisting-action.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class KleinanzeigenRelistingActionComponent {
  readonly section = input.required<MarketplaceOverviewSection>();
  readonly changed = output<void>();
  readonly relisting = inject(KleinanzeigenRelistingService);
  readonly icon = LucideRefreshCw;
  async run(resume?: KleinanzeigenRelistingAttempt): Promise<void> {
    if (await this.relisting.run(this.section(), resume)) this.changed.emit();
  }
}
