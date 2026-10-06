import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
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
import { VintedFavoriteSettingsComponent } from '../vinted-favorite-settings/vinted-favorite-settings.component';

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
  readonly inbox = input(false);
  readonly inboxSyncedAt = input<string | null>(null);
  readonly profile = input<MarketplaceProfile | null>(null);
  readonly runtimeStatus = input<{ label: string; tone: BadgeTone } | null>(null);
  readonly cloudHeaderState = signal<VintedSyncHeaderState | null>(null);
  readonly currentCloudHeaderState = computed(() => {
    const account = this.account();
    const state = this.cloudHeaderState();
    return account.executionMode === 'cloud' &&
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
  readonly accountSelected = output<string | null>();
  readonly refreshRequested = output<void>();
  readonly synchronized = output<MarketplaceSyncSchedule>();
  readonly refreshIcon = LucideRefreshCw;
  readonly settingsIcon = LucideSettings;
  readonly localSettingsOpen = signal(false);
  private settingsAccountKey: string | null = null;
  readonly accountOptions = computed(() =>
    this.connections().map((account) => ({
      value: account.connectionId,
      label: account.displayName,
      description: MARKETPLACE_CONNECTION_LABELS[account.status],
    })),
  );

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
      if (key !== this.settingsAccountKey || !canManage) this.localSettingsOpen.set(false);
      this.settingsAccountKey = key;
    });
  }
}
