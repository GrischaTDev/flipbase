import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import { MARKETPLACE_SYNC_PAUSE_LABELS } from '../../models/marketplace-sync-schedule';
import { MarketplaceSyncScheduleStore } from '../../services/marketplace-sync-schedule.store';

@Component({
  selector: 'app-vinted-sync-schedule',
  imports: [DatePipe, BadgeComponent, ButtonComponent, NoticeBannerComponent],
  templateUrl: './vinted-sync-schedule.component.html',
  providers: [MarketplaceSyncScheduleStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedSyncScheduleComponent {
  readonly account = input.required<MarketplaceConnection>();
  readonly canManage = input(false);
  readonly store = inject(MarketplaceSyncScheduleStore);
  readonly pausedText = computed(() => {
    const reason = this.store.schedule()?.pausedReason;
    return reason ? MARKETPLACE_SYNC_PAUSE_LABELS[reason] : null;
  });
  readonly statusText = computed(() => {
    const schedule = this.store.schedule();
    if (schedule?.enabled && this.account().status !== 'connected') {
      switch (this.account().status) {
        case 'paused':
          return 'Kontoverbindung pausiert';
        case 'blocked':
          return 'Prüfung erforderlich';
        case 'needs_login':
          return 'Anmeldung erforderlich';
        default:
          return 'Nicht verbunden';
      }
    }
    return !schedule?.enabled
      ? 'Pausiert'
      : !this.store.availability().enabled
        ? 'Dienst nicht verfügbar'
        : schedule.pausedReason
          ? 'Wartet'
          : 'Aktiv';
  });
  readonly nextPlannedAt = computed(() =>
    this.account().status === 'connected' && this.store.schedule()?.enabled
      ? this.store.schedule()?.nextDueAt
      : null,
  );
  constructor() {
    effect(() => {
      this.store.account.set(this.account());
      this.store.manageAllowed.set(this.canManage());
    });
  }
}
