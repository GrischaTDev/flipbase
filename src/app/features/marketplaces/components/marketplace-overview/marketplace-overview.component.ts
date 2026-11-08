import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { LucidePlus, LucideRefreshCw, LucideSettings, LucideStore } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { PageLayoutService } from '../../../../core/services/page-layout.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import {
  MarketplaceSettingsService,
  type MarketplaceId,
} from '../../../../core/services/marketplace-settings.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import {
  marketplacePlatformAppearance,
  marketplacePlatformLabel,
} from '../../../../shared/models/marketplace-platform';
import { MarketplacesSettingsComponent } from '../../../settings/pages/marketplaces-settings/marketplaces-settings.component';
import { MarketplaceOverviewStore } from '../../services/marketplace-overview.store';
import { MarketplaceListingSectionComponent } from '../marketplace-listing-section/marketplace-listing-section.component';
import { overviewAccountKey } from '../../models/marketplace-overview-normalization';
import type {
  MarketplaceListingReference,
  MarketplaceOverviewAccount,
} from '../../models/marketplace-overview.models';
import { MarketplacePlatformPickerComponent } from '../../../../shared/components/marketplace-platform-picker/marketplace-platform-picker.component';
import { VintedAccountManagementComponent } from '../vinted-account-grid/vinted-account-management.component';
import { EbayAccountComponent } from '../ebay-account/ebay-account.component';
import { KleinanzeigenAccountsComponent } from '../kleinanzeigen-accounts/kleinanzeigen-accounts.component';
import { ListingTransferDialogComponent } from '../listing-transfer-dialog/listing-transfer-dialog.component';

@Component({
  selector: 'app-marketplace-overview',
  imports: [
    NgTemplateOutlet,
    NgOptimizedImage,
    MarketplacePlatformPickerComponent,
    VintedAccountManagementComponent,
    EbayAccountComponent,
    PageHeaderComponent,
    CardComponent,
    ButtonComponent,
    ModalShellComponent,
    MarketplacesSettingsComponent,
    MarketplaceListingSectionComponent,
    KleinanzeigenAccountsComponent,
    ListingTransferDialogComponent,
  ],
  providers: [MarketplaceOverviewStore],
  templateUrl: './marketplace-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class MarketplaceOverviewComponent {
  readonly kleinanzeigenAccount = viewChild(KleinanzeigenAccountsComponent);
  readonly ebayAccount = viewChild(EbayAccountComponent);
  readonly store = inject(MarketplaceOverviewStore);
  readonly settings = inject(MarketplaceSettingsService);
  readonly widescreen = inject(PageLayoutService).widescreen;
  readonly platformsGridClass = computed(() => {
    if (!this.widescreen()) return 'space-y-5';
    const count = this.store.platforms().length;
    if (count === 2) {
      return 'grid min-w-0 gap-6 xl:grid-cols-2 xl:gap-8 2xl:gap-10 xl:items-start';
    }
    if (count >= 3) {
      return 'grid min-w-0 gap-6 xl:grid-cols-3 xl:gap-8 2xl:gap-10 xl:items-start';
    }
    return 'space-y-5';
  });
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly workspaceId = computed(() => this.workspace.currentWorkspace()?.id ?? null);
  readonly addOpen = signal(false);
  readonly addPlatform = signal<MarketplaceId | null>(null);
  readonly createPlatform = signal<MarketplaceId | null>(null);
  private dialogContext: string | null = null;
  readonly createAccounts = computed(
    () => this.store.platforms().find((group) => group.platform === this.createPlatform()) ?? null,
  );
  readonly selectedCreatePlatforms = computed(() =>
    this.createPlatform() ? [this.createPlatform()!] : [],
  );
  readonly selectedAddPlatforms = computed(() => (this.addPlatform() ? [this.addPlatform()!] : []));
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
  readonly draggedListing = signal<MarketplaceListingReference | null>(null);
  readonly dragOverPlatform = signal<MarketplaceId | null>(null);
  readonly dragOverAccountKey = signal<string | null>(null);
  readonly dragTransfer = signal<{
    source: MarketplaceListingReference;
    targetConnectionId: string | null;
  } | null>(null);
  readonly plusIcon = LucidePlus;
  readonly settingsIcon = LucideSettings;
  readonly storeIcon = LucideStore;
  readonly retryIcon = LucideRefreshCw;
  readonly accountKey = overviewAccountKey;
  readonly platformLabel = marketplacePlatformLabel;
  readonly enabledPlatforms = computed<readonly MarketplaceId[]>(() => {
    const settings = this.settings.settings();
    return (['vinted', 'ebay', 'kleinanzeigen'] as const).filter((platform) => settings[platform]);
  });
  constructor() {
    effect(() => {
      const userId = this.auth.currentUser()?.id;
      const workspace = this.workspace.currentWorkspace();
      const context =
        userId && workspace && !workspace.archived_at
          ? JSON.stringify([userId, workspace.id])
          : null;
      if (context !== this.dialogContext) {
        this.dialogContext = context;
        this.accountSelection.set(null);
        this.createOpen.set(false);
        this.addOpen.set(false);
        this.manageOpen.set(false);
        this.createPlatform.set(null);
        this.addPlatform.set(null);
        this.dragTransfer.set(null);
        this.onListingDragEnd();
      }
      const enabled = this.enabledPlatforms();
      if (this.createPlatform() && !enabled.includes(this.createPlatform()!))
        this.createPlatform.set(null);
      if (this.addPlatform() && !enabled.includes(this.addPlatform()!)) this.addPlatform.set(null);
      if (this.dragTransfer() && !enabled.includes('kleinanzeigen')) this.dragTransfer.set(null);
    });
    effect(() => {
      const result = this.route.snapshot.queryParamMap.get('ebay_result');
      const workspaceId = this.route.snapshot.queryParamMap.get('workspace');
      if (
        result &&
        workspaceId === this.workspaceId() &&
        this.auth.currentUser() &&
        this.enabledPlatforms().includes('ebay')
      ) {
        this.addPlatform.set('ebay');
        this.addOpen.set(true);
      }
    });
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
  manageLink(platform: MarketplaceId): string {
    return platform === 'vinted'
      ? '/marketplaces/vinted/accounts'
      : platform === 'ebay'
        ? '/marketplaces/ebay/connection'
        : '/marketplaces/kleinanzeigen';
  }
  manageAccount(account: MarketplaceOverviewAccount): void {
    const userId = this.auth.currentUser()?.id;
    if (
      !userId ||
      this.workspace.currentWorkspace()?.archived_at ||
      account.workspaceId !== this.workspaceId() ||
      !this.enabledPlatforms().includes(account.platform)
    )
      return;
    if (
      !this.store
        .platforms()
        .some((group) =>
          group.accounts.some((row) => overviewAccountKey(row) === overviewAccountKey(account)),
        )
    )
      return;
    this.accountSelection.set({ userId, account });
  }
  closeAccount(): void {
    const account = this.managedAccount();
    this.accountSelection.set(null);
    if (account) void this.store.refreshPlatform(account.platform);
  }
  openCreate(): void {
    if (
      !this.auth.currentUser() ||
      !this.workspaceId() ||
      this.workspace.currentWorkspace()?.archived_at
    )
      return;
    this.createPlatform.set(null);
    this.createOpen.set(true);
  }
  openAdd(platform: MarketplaceId | null = null): void {
    if (
      !this.auth.currentUser() ||
      !this.workspaceId() ||
      this.workspace.currentWorkspace()?.archived_at
    )
      return;
    if (platform && !this.enabledPlatforms().includes(platform)) return;
    this.addPlatform.set(platform);
    this.addOpen.set(true);
  }
  closeAdd(): void {
    const platform = this.addPlatform();
    this.addOpen.set(false);
    this.addPlatform.set(null);
    if (platform) void this.store.refreshPlatform(platform);
  }
  async createForAccount(account: MarketplaceOverviewAccount): Promise<void> {
    if (
      !this.createOpen() ||
      this.workspace.currentWorkspace()?.archived_at ||
      account.platform !== this.createPlatform() ||
      account.workspaceId !== this.workspaceId() ||
      !this.auth.currentUser() ||
      !this.enabledPlatforms().includes(account.platform) ||
      !this.createAccounts()?.accounts.some(
        (row) => overviewAccountKey(row) === overviewAccountKey(account),
      )
    )
      return;
    if (account.platform === 'ebay') return;
    await this.router.navigate(
      [account.platform === 'vinted' ? '/marketplaces/vinted/listings/new' : '/listings/new'],
      {
        queryParams: { connectionId: account.connectionId, workspaceId: account.workspaceId },
      },
    );
  }
  async retry(): Promise<void> {
    await this.settings.retryLoad();
  }
  canAcceptListingDrop(targetPlatform: MarketplaceId): boolean {
    const dragged = this.draggedListing();
    if (!dragged) return false;
    return (
      dragged.platform === 'vinted' &&
      targetPlatform === 'kleinanzeigen' &&
      this.settings.ready() &&
      this.enabledPlatforms().includes('kleinanzeigen')
    );
  }
  onListingDragStart(reference: MarketplaceListingReference): void {
    this.draggedListing.set(reference);
    this.dragOverPlatform.set(null);
    this.dragOverAccountKey.set(null);
  }
  onListingDragEnd(): void {
    this.draggedListing.set(null);
    this.dragOverPlatform.set(null);
    this.dragOverAccountKey.set(null);
  }
  onPlatformDragOver(event: DragEvent, platform: MarketplaceId): void {
    if (!this.canAcceptListingDrop(platform)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    if (this.dragOverPlatform() !== platform) {
      this.dragOverPlatform.set(platform);
    }
  }
  onPlatformDragLeave(event: DragEvent, platform: MarketplaceId): void {
    const currentTarget = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (
      currentTarget instanceof HTMLElement &&
      relatedTarget instanceof Node &&
      currentTarget.contains(relatedTarget)
    ) {
      return;
    }
    if (this.dragOverPlatform() === platform) {
      this.dragOverPlatform.set(null);
    }
  }
  onAccountDragOver(event: DragEvent, account: MarketplaceOverviewAccount): void {
    if (!this.canAcceptListingDrop(account.platform)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragOverPlatform.set(account.platform);
    const key = overviewAccountKey(account);
    if (this.dragOverAccountKey() !== key) {
      this.dragOverAccountKey.set(key);
    }
  }
  onAccountDragLeave(event: DragEvent, account: MarketplaceOverviewAccount): void {
    const currentTarget = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (
      currentTarget instanceof HTMLElement &&
      relatedTarget instanceof Node &&
      currentTarget.contains(relatedTarget)
    ) {
      return;
    }
    const key = overviewAccountKey(account);
    if (this.dragOverAccountKey() === key) {
      this.dragOverAccountKey.set(null);
    }
  }
  onDropOnPlatform(event: DragEvent, platform: MarketplaceId): void {
    if (!this.canAcceptListingDrop(platform)) return;
    event.preventDefault();
    const source = this.draggedListing();
    this.onListingDragEnd();
    if (!source) return;
    this.dragTransfer.set({ source, targetConnectionId: null });
  }
  onDropOnAccount(event: DragEvent, account: MarketplaceOverviewAccount): void {
    if (!this.canAcceptListingDrop(account.platform)) return;
    event.preventDefault();
    event.stopPropagation();
    const source = this.draggedListing();
    this.onListingDragEnd();
    if (!source) return;
    this.dragTransfer.set({ source, targetConnectionId: account.connectionId });
  }
  closeDragTransfer(): void {
    this.dragTransfer.set(null);
  }
}
