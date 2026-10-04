import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideRefreshCw } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import { MARKETPLACE_CONNECTION_LABELS } from '../../models/marketplace-presentation';
import type { MarketplaceSyncSchedule } from '../../models/marketplace-sync-schedule';
import { VintedSyncScheduleComponent } from '../vinted-sync-schedule/vinted-sync-schedule.component';

@Component({
  selector: 'app-vinted-account-controls',
  imports: [
    DatePipe,
    BadgeComponent,
    ButtonComponent,
    CustomSelectComponent,
    VintedSyncScheduleComponent,
  ],
  templateUrl: './vinted-account-controls.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedAccountControlsComponent {
  readonly connections = input.required<readonly MarketplaceConnection[]>();
  readonly account = input.required<MarketplaceConnection>();
  readonly canManage = input(false);
  readonly refreshing = input(false);
  readonly loading = input(false);
  readonly refreshLabel = input('Kontodaten aktualisieren');
  readonly accountSelected = output<string | null>();
  readonly refreshRequested = output<void>();
  readonly synchronized = output<MarketplaceSyncSchedule>();
  readonly refreshIcon = LucideRefreshCw;
  readonly accountOptions = computed(() =>
    this.connections().map((account) => ({
      value: account.connectionId,
      label: account.displayName,
      description: MARKETPLACE_CONNECTION_LABELS[account.status],
    })),
  );
}
