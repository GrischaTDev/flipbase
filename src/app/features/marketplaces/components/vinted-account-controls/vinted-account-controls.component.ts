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
import { LucideRefreshCw, LucideSettings } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  BadgeComponent,
  type BadgeTone,
} from '../../../../shared/components/badge/badge.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import { MARKETPLACE_CONNECTION_LABELS } from '../../models/marketplace-presentation';
import type { MarketplaceSyncSchedule } from '../../models/marketplace-sync-schedule';
import {
  VintedSyncScheduleComponent,
  type VintedSyncHeaderState,
} from '../vinted-sync-schedule/vinted-sync-schedule.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceProfile } from '../../models/marketplace-read.models';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { VintedMessageSettingsComponent } from '../vinted-message-settings/vinted-message-settings.component';
import { VintedFavoriteSettingsComponent } from '../vinted-favorite-settings/vinted-favorite-settings.component';
import { VintedListingClockService } from '../../services/vinted-listing-clock.service';
import { VINTED_ALL_ACCOUNTS_OPTION } from '../../services/vinted-account-view.service';
import { vintedAccountLabels } from '../../models/vinted-account-labels';

@Component({
  selector: 'app-vinted-account-controls',
  imports: [
    DatePipe,
    BadgeComponent,
    ButtonComponent,
    CustomSelectComponent,
    VintedSyncScheduleComponent,
    ProductThumbnailComponent,
    ModalShellComponent,
    VintedFavoriteSettingsComponent,
    VintedMessageSettingsComponent,
  ],
  templateUrl: './vinted-account-controls.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedAccountControlsComponent {
  private readonly clock = inject(VintedListingClockService);
  readonly connections = input.required<readonly MarketplaceConnection[]>();
  readonly account = input.required<MarketplaceConnection>();
  readonly canManage = input(false);
  readonly allowAllAccounts = input(false);
  readonly allAccountsSelected = input(false);
  readonly chooserOnly = input(false);
  readonly refreshing = input(false);
  readonly loading = input(false);
  readonly refreshLabel = input('Kontodaten aktualisieren');
  readonly inbox = input(false);
  readonly inboxSyncedAt = input<string | null>(null);
  readonly profile = input<MarketplaceProfile | null>(null);
  readonly runtimeStatus = input<{ label: string; tone: BadgeTone } | null>(null);
  readonly showAccountTools = computed(() => !this.allAccountsSelected() && !this.chooserOnly());
  readonly selectedOption = computed(() =>
    this.allAccountsSelected() ? VINTED_ALL_ACCOUNTS_OPTION : this.account().connectionId,
  );
  readonly cloudHeaderState = signal<VintedSyncHeaderState | null>(null);
  readonly currentCloudHeaderState = computed(() => {
    const account = this.account();
    const state = this.cloudHeaderState();
    return this.showAccountTools() &&
      account.executionMode === 'cloud' &&
      state?.workspaceId === account.workspaceId &&
      state.connectionId === account.connectionId
      ? state
      : null;
  });
  readonly scheduleStateChanged = output<VintedSyncHeaderState | null>();
  readonly headerStatus = computed(() =>
    this.account().executionMode === 'local'
      ? this.runtimeStatus()
      : (this.currentCloudHeaderState()?.status ?? null),
  );
  readonly scheduleNotice = computed(() => this.currentCloudHeaderState()?.notice ?? null);
  readonly syncedAt = computed(() =>
    this.inbox() ? this.inboxSyncedAt() : this.account().lastSyncedAt,
  );
  readonly syncedAtDay = computed(() => {
    const syncedAt = new Date(this.syncedAt() ?? '');
    const today = new Date(this.clock.now());
    if (syncedAt.toDateString() === today.toDateString()) return 'today';
    today.setDate(today.getDate() - 1);
    return syncedAt.toDateString() === today.toDateString() ? 'yesterday' : 'older';
  });
  readonly accountSelected = output<string | null>();
  readonly refreshRequested = output<void>();
  readonly synchronized = output<MarketplaceSyncSchedule>();
  readonly refreshIcon = LucideRefreshCw;
  readonly settingsIcon = LucideSettings;
  readonly localSettingsOpen = signal(false);
  private settingsAccountKey: string | null = null;
  readonly accountOptions = computed(() => {
    const connections = this.connections();
    const labels = vintedAccountLabels(connections);
    return [
      ...(this.allowAllAccounts()
        ? [{ value: VINTED_ALL_ACCOUNTS_OPTION, label: 'Alle Konten' }]
        : []),
      ...connections.map((account) => ({
        value: account.connectionId,
        label: labels.get(account.connectionId) ?? account.displayName,
        description: MARKETPLACE_CONNECTION_LABELS[account.status],
      })),
    ];
  });

  constructor() {
    effect(() => {
      const state = this.currentCloudHeaderState();
      untracked(() => this.scheduleStateChanged.emit(state));
    });
    effect(() => {
      const account = this.account();
      const canManage = this.canManage();
      const key = JSON.stringify([
        account.workspaceId,
        account.connectionId,
        account.executionMode,
      ]);
      if (key !== this.settingsAccountKey || !canManage || !this.showAccountTools())
        this.localSettingsOpen.set(false);
      this.settingsAccountKey = key;
    });
  }
}
