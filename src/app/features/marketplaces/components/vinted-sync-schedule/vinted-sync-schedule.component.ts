import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LucideSettings, LucideLogIn } from '@lucide/angular';
import { VintedFavoriteSettingsComponent } from '../vinted-favorite-settings/vinted-favorite-settings.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import { MARKETPLACE_SYNC_PAUSE_LABELS } from '../../models/marketplace-sync-schedule';
import type { MarketplaceSyncSchedule } from '../../models/marketplace-sync-schedule';
import { MarketplaceSyncScheduleStore } from '../../services/marketplace-sync-schedule.store';

@Component({
  selector: 'app-vinted-sync-schedule',
  imports: [
    DatePipe,
    VintedFavoriteSettingsComponent,
    ButtonComponent,
    NoticeBannerComponent,
    CustomSelectComponent,
    ModalShellComponent,
  ],
  templateUrl: './vinted-sync-schedule.component.html',
  providers: [MarketplaceSyncScheduleStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedSyncScheduleComponent {
  readonly settingsIcon = LucideSettings;
  readonly loginIcon = LucideLogIn;
  readonly account = input.required<MarketplaceConnection>();
  readonly canManage = input(false);
  readonly synchronized = output<MarketplaceSyncSchedule>();
  readonly store = inject(MarketplaceSyncScheduleStore);
  readonly settingsOpen = signal(false);
  private settingsAccountKey: string | null = null;
  readonly intervalOptions = computed(() =>
    this.store.availability().allowedIntervals.map((value) => ({
      value,
      label: `Alle ${value} Minuten`,
    })),
  );
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
      const schedule = this.store.schedule();
      const account = this.account();
      if (
        this.canManage() &&
        schedule?.lastSuccessAt &&
        schedule.workspaceId === account.workspaceId &&
        schedule.connectionId === account.connectionId &&
        (!account.lastSyncedAt ||
          Date.parse(schedule.lastSuccessAt) > Date.parse(account.lastSyncedAt))
      )
        this.synchronized.emit(schedule);
    });
    effect(() => {
      const account = this.account();
      const canManage = this.canManage();
      const key = JSON.stringify([account.workspaceId, account.connectionId]);
      if (key !== this.settingsAccountKey || !canManage) {
        this.settingsOpen.set(false);
      }
      this.settingsAccountKey = key;
      this.store.account.set(account);
      this.store.manageAllowed.set(canManage);
    });
  }
}
