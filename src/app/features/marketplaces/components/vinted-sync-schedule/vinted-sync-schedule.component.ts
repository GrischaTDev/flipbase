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
  untracked,
} from '@angular/core';
import { LucideSettings, LucideLogIn } from '@lucide/angular';
import { VintedCloudMessageSettingsComponent } from '../vinted-cloud-message-settings/vinted-cloud-message-settings.component';
import { VintedFavoriteSettingsComponent } from '../vinted-favorite-settings/vinted-favorite-settings.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import type { BadgeTone } from '../../../../shared/components/badge/badge.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import type { AccountScope, MarketplaceConnection } from '../../models/marketplace.models';
import { MARKETPLACE_SYNC_PAUSE_LABELS } from '../../models/marketplace-sync-schedule';
import type { MarketplaceSyncSchedule } from '../../models/marketplace-sync-schedule';
import { MarketplaceSyncScheduleStore } from '../../services/marketplace-sync-schedule.store';

export interface VintedSyncHeaderState extends AccountScope {
  readonly status: { label: string; tone: BadgeTone } | null;
  readonly notice: { text: string; alert: boolean; retry: boolean } | null;
  readonly loading: boolean;
  readonly reload: () => void;
}

@Component({
  selector: 'app-vinted-sync-schedule',
  imports: [
    DatePipe,
    VintedFavoriteSettingsComponent,
    VintedCloudMessageSettingsComponent,
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
  readonly compact = input(false);
  readonly synchronized = output<MarketplaceSyncSchedule>();
  readonly headerStateChanged = output<VintedSyncHeaderState>();
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
  readonly headerStatus = computed<{ label: string; tone: BadgeTone } | null>(() => {
    const status = this.account().status;
    const schedule = this.store.schedule();
    if (status === 'blocked') return { label: 'Kontoprüfung erforderlich', tone: 'critical' };
    if (status === 'paused' || (schedule && !schedule.enabled))
      return { label: 'Automatik pausiert', tone: 'caution' };
    if (status !== 'connected') return { label: 'Anmeldung erforderlich', tone: 'caution' };
    if (schedule?.pausedReason) return { label: 'Abruf wartet', tone: 'caution' };
    if (schedule?.enabled && !this.store.loading() && !this.store.availability().enabled)
      return { label: 'Automatik nicht erreichbar', tone: 'caution' };
    return null;
  });
  readonly headerNotice = computed(() => {
    if (this.settingsOpen()) return null;
    const error = this.store.error();
    if (error) return { text: error, alert: true, retry: true };
    const paused = this.pausedText();
    if (paused) return { text: paused, alert: false, retry: false };
    if (
      this.store.schedule()?.enabled &&
      !this.store.availability().enabled &&
      !this.store.loading()
    )
      return {
        text: 'Der Automatikdienst ist momentan nicht erreichbar. Gespeicherte Daten bleiben lesbar.',
        alert: false,
        retry: true,
      };
    return null;
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
      const account = this.account();
      const headerState: VintedSyncHeaderState = {
        workspaceId: account.workspaceId,
        connectionId: account.connectionId,
        status: this.headerStatus(),
        notice: this.headerNotice(),
        loading: this.store.loading(),
        reload: () => void this.store.reload(),
      };
      untracked(() => this.headerStateChanged.emit(headerState));
    });
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
