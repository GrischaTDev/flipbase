import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router } from '@angular/router';
import { LucidePlus, LucideRefreshCw, LucideSettings, LucideStore } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import {
  MarketplaceSettingsService,
  type MarketplaceId,
} from '../../../../core/services/marketplace-settings.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import {
  marketplacePlatformAppearance,
  marketplacePlatformLabel,
} from '../../../../shared/models/marketplace-platform';
import { MarketplacesSettingsComponent } from '../../../settings/pages/marketplaces-settings/marketplaces-settings.component';
import {
  MarketplaceOverviewStore,
  type MarketplaceOverviewPlatformState,
} from '../../services/marketplace-overview.store';
import { MarketplaceListingSectionComponent } from '../marketplace-listing-section/marketplace-listing-section.component';
import { overviewAccountKey } from '../../models/marketplace-overview-normalization';
import type { MarketplaceOverviewAccount } from '../../models/marketplace-overview.models';
import { KleinanzeigenAccountsComponent } from '../kleinanzeigen-accounts/kleinanzeigen-accounts.component';

@Component({
  selector: 'app-marketplace-overview',
  imports: [
    NgOptimizedImage,
    PageHeaderComponent,
    CardComponent,
    ButtonComponent,
    BadgeComponent,
    CustomSelectComponent,
    ModalShellComponent,
    MarketplacesSettingsComponent,
    MarketplaceListingSectionComponent,
    KleinanzeigenAccountsComponent,
  ],
  providers: [MarketplaceOverviewStore],
  templateUrl: './marketplace-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class MarketplaceOverviewComponent {
  readonly store = inject(MarketplaceOverviewStore);
  readonly settings = inject(MarketplaceSettingsService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly operator = inject(PlatformOperatorService);
  private readonly router = inject(Router);
  private readonly accountSelection = signal<{
    userId: string;
    account: MarketplaceOverviewAccount;
  } | null>(null);
  readonly managedAccount = computed(() => {
    const selection = this.accountSelection();
    if (
      !selection ||
      selection.userId !== this.auth.currentUser()?.id ||
      selection.account.workspaceId !== this.workspace.currentWorkspace()?.id ||
      this.workspace.currentWorkspace()?.archived_at
    )
      return null;
    return this.store
      .platforms()
      .some((group) =>
        group.accounts.some(
          (account) => overviewAccountKey(account) === overviewAccountKey(selection.account),
        ),
      )
      ? selection.account
      : null;
  });
  readonly manageOpen = signal(false);
  readonly createOpen = signal(false);
  readonly plusIcon = LucidePlus;
  readonly settingsIcon = LucideSettings;
  readonly storeIcon = LucideStore;
  readonly retryIcon = LucideRefreshCw;
  readonly accountKey = overviewAccountKey;
  readonly platformLabel = marketplacePlatformLabel;
  readonly enabledPlatforms = computed<readonly MarketplaceId[]>(() => {
    const settings = this.settings.settings();
    return (['vinted', 'ebay', 'kleinanzeigen'] as const).filter(
      (platform) => settings[platform] && (platform !== 'vinted' || this.operator.operator()),
    );
  });
  readonly canCreateVinted = computed(() =>
    this.store
      .platforms()
      .some(
        (group) =>
          group.platform === 'vinted' &&
          !group.loading &&
          !group.error &&
          group.accounts.length > 0,
      ),
  );
  constructor() {
    effect(() => {
      const userId = this.auth.currentUser()?.id,
        workspace = this.workspace.currentWorkspace();
      const ready = this.settings.ready(),
        enabled = this.enabledPlatforms();
      if (userId && workspace && !workspace.archived_at && ready)
        untracked(() => void this.store.load(workspace.id, enabled));
    });
  }
  platformLogo(platform: MarketplaceId): string {
    return marketplacePlatformAppearance(platform).logo!;
  }
  accountOptions(
    group: MarketplaceOverviewPlatformState,
  ): readonly { value: string; label: string }[] {
    return [
      { value: '', label: 'Alle Accounts' },
      ...group.accounts.map((account) => ({
        value: account.connectionId,
        label: account.displayName,
      })),
    ];
  }
  manageLink(platform: MarketplaceId): string {
    return platform === 'vinted'
      ? '/marketplaces/vinted/accounts'
      : platform === 'ebay'
        ? '/marketplaces/ebay/connection'
        : '/marketplaces/kleinanzeigen';
  }
  async manageAccount(account: MarketplaceOverviewAccount): Promise<void> {
    const userId = this.auth.currentUser()?.id;
    if (!userId || account.workspaceId !== this.workspace.currentWorkspace()?.id) return;
    if (account.platform === 'kleinanzeigen') {
      this.accountSelection.set({ userId, account });
      return;
    }
    await this.router.navigate([this.manageLink(account.platform)], {
      queryParams:
        account.platform === 'vinted'
          ? { settings: account.connectionId, workspaceId: account.workspaceId }
          : undefined,
    });
  }
  closeAccount(): void {
    this.accountSelection.set(null);
  }
  async retry(): Promise<void> {
    await this.settings.retryLoad();
  }
}
