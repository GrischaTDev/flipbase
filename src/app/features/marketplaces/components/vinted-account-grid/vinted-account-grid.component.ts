import {
  CdkDrag,
  CdkDragPlaceholder,
  CdkDropList,
  moveItemInArray,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideRefreshCw, LucideSettings, LucidePlus, LucideTrash2 } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import {
  MARKETPLACE_CONNECTION_LABELS,
  MARKETPLACE_CONNECTION_TONES,
} from '../../models/marketplace-presentation';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { VintedLocalExtensionBridge } from '../../services/vinted-local-extension-bridge';
import { VintedLocalRuntimeStore } from '../../services/vinted-local-runtime.store';
import { presentVintedLocalReadiness } from '../../models/vinted-local-readiness';
import { MarketplaceCloudSetupStore } from '../../services/marketplace-cloud-setup.store';
import { VintedAccountPreviewsStore } from '../../services/vinted-account-previews.store';
import { MarketplaceAccountsComponent } from '../marketplace-accounts/marketplace-accounts.component';
import { VintedFavoriteSettingsComponent } from '../vinted-favorite-settings/vinted-favorite-settings.component';
import { VintedRatingComponent } from '../vinted-rating/vinted-rating.component';
import { VintedSetupComponent } from '../vinted-setup/vinted-setup.component';

@Component({
  selector: 'app-vinted-account-grid',
  imports: [
    CdkDrag,
    CdkDragPlaceholder,
    CdkDropList,
    BadgeComponent,
    CardComponent,
    ButtonComponent,
    ModalShellComponent,
    NoticeBannerComponent,
    ProductThumbnailComponent,
    VintedRatingComponent,
    VintedSetupComponent,
    MarketplaceAccountsComponent,
    VintedFavoriteSettingsComponent,
  ],
  templateUrl: './vinted-account-grid.component.html',
  providers: [VintedAccountPreviewsStore, MarketplaceCloudSetupStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 @container' },
})
export class VintedAccountGridComponent {
  readonly accounts = inject(MarketplaceAccountStore);
  readonly runtime = inject(VintedLocalRuntimeStore);
  readonly extension = inject(VintedLocalExtensionBridge);
  readonly local = inject(VintedLocalExtensionStore);
  private readonly disconnectSelection = signal<{
    context: string;
    account: MarketplaceConnection;
  } | null>(null);
  readonly disconnectAccount = computed(() => {
    const selection = this.disconnectSelection();
    return selection?.context === this.context() &&
      this.accounts.canManage() &&
      selection.account.workspaceId === this.workspace.currentWorkspace()?.id
      ? selection.account
      : null;
  });
  readonly cloud = inject(MarketplaceCloudSetupStore);
  readonly previews = inject(VintedAccountPreviewsStore);
  readonly management = viewChild(MarketplaceAccountsComponent);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly context = computed(() =>
    JSON.stringify([this.auth.currentUser()?.id, this.workspace.currentWorkspace()?.id]),
  );
  private readonly settingsSelection = signal<{
    context: string;
    account: MarketplaceConnection;
  } | null>(null);
  readonly settingsAccount = computed(() => {
    const selection = this.settingsSelection();
    if (
      !selection ||
      selection.context !== this.context() ||
      (!this.accounts.canManage() && !this.accounts.loading())
    )
      return null;
    return (
      this.accounts
        .connections()
        .find((account) => account.connectionId === selection.account.connectionId) ??
      (this.accounts.loading() ? selection.account : null)
    );
  });
  readonly orderNotice = signal<string | null>(null);
  readonly connectionIds = computed(() =>
    this.accounts.connections().map((account) => account.connectionId),
  );
  private dragOrder: readonly string[] | null = null;
  private dragContext: string | null = null;
  readonly statusTones = MARKETPLACE_CONNECTION_TONES;
  readonly refreshIcon = LucideRefreshCw;
  readonly dragStartDelay = { mouse: 0, touch: 250 } as const;
  readonly settingsIcon = LucideSettings;
  readonly addIcon = LucidePlus;
  readonly deleteIcon = LucideTrash2;

  constructor() {
    effect(() => {
      const parameters = this.queryParams();
      const settingsId = parameters.get('settings');
      const disconnectId = parameters.get('disconnect');
      const workspaceId = parameters.get('workspaceId');
      const account = this.accounts
        .connections()
        .find((candidate) => candidate.connectionId === (settingsId ?? disconnectId));
      if ((!settingsId && !disconnectId) || this.accounts.loading() || !this.accounts.canManage())
        return;
      untracked(() => {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { settings: null, disconnect: null, workspaceId: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        if (
          !account ||
          account.workspaceId !== workspaceId ||
          account.workspaceId !== this.workspace.currentWorkspace()?.id
        )
          return;
        if (settingsId) this.openSettings(account);
        else if (account.executionMode === 'local')
          this.disconnectSelection.set({ context: this.context(), account });
      });
    });
    effect(() => {
      const selection = this.settingsSelection();
      if (selection && !this.settingsAccount()) this.settingsSelection.set(null);
    });
    effect(() => {
      const method = this.queryParams().get('add');
      const management = this.management();
      if (
        (method !== 'local' && method !== 'cloud') ||
        !management ||
        this.accounts.loading() ||
        !this.accounts.canManage()
      )
        return;
      untracked(() => {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { add: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        management.openDialog(undefined, method);
      });
    });
  }

  runtimeStatus(account: MarketplaceConnection) {
    return presentVintedLocalReadiness(
      account,
      this.runtime.readiness(),
      this.runtime.checking(),
      this.extension.installed(),
    );
  }
  accountStatus(account: MarketplaceConnection) {
    if (
      account.executionMode === 'local' &&
      !account.externalAccountId &&
      account.status !== 'paused' &&
      account.status !== 'blocked'
    )
      return {
        label: 'Lokal noch nicht verbunden',
        tone: 'neutral' as const,
        action: 'renew' as const,
      };
    return account.executionMode === 'local'
      ? this.runtimeStatus(account)
      : {
          label: MARKETPLACE_CONNECTION_LABELS[account.status],
          tone: this.statusTones[account.status],
          action: 'settings' as const,
        };
  }
  openCloudLogin(account: MarketplaceConnection): void {
    this.closeSettings();
    void this.management()?.openLogin(account);
  }
  upgradeToCloud(account: MarketplaceConnection): void {
    this.closeSettings();
    void this.management()?.upgrade(account);
  }
  async syncCloudAccount(account: MarketplaceConnection): Promise<void> {
    if (
      !this.accounts.canManage() ||
      this.accounts.busy() ||
      account.executionMode !== 'cloud' ||
      account.status !== 'connected'
    )
      return;
    const context = this.context();
    await this.accounts.selectConnection(account.connectionId);
    const selected = this.accounts.selectedConnection();
    if (
      context !== this.context() ||
      !this.accounts.canManage() ||
      this.accounts.busy() ||
      selected?.connectionId !== account.connectionId ||
      selected.workspaceId !== account.workspaceId ||
      selected.executionMode !== 'cloud' ||
      selected.status !== 'connected'
    )
      return;
    await this.accounts.syncSelectedConnection();
  }
  async checkLocalConnection(): Promise<void> {
    this.extension.checkInstallation();
    await this.runtime.check(true);
  }
  async syncLocalAccount(account: MarketplaceConnection): Promise<void> {
    const context = this.context();
    await this.runtime.check();
    const readiness = this.runtime.readiness();
    if (
      context !== this.context() ||
      !this.accounts.canManage() ||
      readiness?.state !== 'ready' ||
      readiness.workspaceId !== account.workspaceId ||
      readiness.connectionId !== account.connectionId ||
      (account.externalAccountId && readiness.externalAccountId !== account.externalAccountId) ||
      account.status === 'paused' ||
      account.status === 'blocked'
    )
      return;
    await this.local.loadConnection(account);
    if (!this.local.isCurrentConnection(account) || !this.local.hasValidBinding()) return;
    await this.local.sync();
  }
  async disconnectLocalAccount(): Promise<void> {
    const account = this.disconnectAccount();
    if (!account || !this.accounts.canManage() || this.accounts.busy() || this.local.busy()) return;
    await this.local.loadConnection(account);
    if (!this.local.isCurrentConnection(account)) return;
    await this.local.revoke();
    if (!this.local.error()) this.disconnectSelection.set(null);
    await this.runtime.check();
  }
  closeDisconnect(): void {
    this.disconnectSelection.set(null);
  }
  openDisconnect(account: MarketplaceConnection): void {
    if (
      !this.accounts.canManage() ||
      account.workspaceId !== this.workspace.currentWorkspace()?.id ||
      account.executionMode !== 'local'
    )
      return;
    this.closeSettings();
    this.disconnectSelection.set({ context: this.context(), account });
  }

  openSettings(account: MarketplaceConnection): void {
    if (!this.accounts.canManage() || this.accounts.busy()) return;
    this.settingsSelection.set({ context: this.context(), account });
  }
  closeSettings(): void {
    this.settingsSelection.set(null);
  }
  rename(account: MarketplaceConnection): void {
    this.closeSettings();
    this.management()?.openDialog(account);
  }
  remove(account: MarketplaceConnection): void {
    this.closeSettings();
    this.management()?.openDelete(account);
  }
  async setPaused(account: MarketplaceConnection): Promise<void> {
    await this.accounts.setPaused(account.connectionId, account.status !== 'paused');
  }
  startDrag(): void {
    this.dragOrder = this.connectionIds().slice();
    this.dragContext = this.context();
    this.orderNotice.set(null);
  }
  stopActionDrag(event: Event): void {
    if (event.target instanceof Element && event.target.closest('app-button'))
      event.stopPropagation();
  }
  async drop(event: CdkDragDrop<string[]>): Promise<void> {
    const order = this.dragOrder;
    const context = this.dragContext;
    this.dragOrder = null;
    this.dragContext = null;
    if (
      !event.isPointerOverContainer ||
      !order ||
      context !== this.context() ||
      order.join() !== this.connectionIds().join()
    )
      return;
    await this.changeOrder(order, event.previousIndex, event.currentIndex);
  }
  async move(account: MarketplaceConnection, direction: -1 | 1): Promise<void> {
    const order = this.connectionIds();
    const index = order.indexOf(account.connectionId);
    if (index < 0) return;
    await this.changeOrder(order, index, index + direction);
  }
  reorderWithKeyboard(event: KeyboardEvent, account: MarketplaceConnection): void {
    if (
      !event.altKey ||
      !(event.target instanceof HTMLElement) ||
      event.target.closest('app-button')
    )
      return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    void this.move(account, event.key === 'ArrowLeft' ? -1 : 1);
  }
  private async changeOrder(
    order: readonly string[],
    previousIndex: number,
    currentIndex: number,
  ): Promise<void> {
    if (
      !this.accounts.canManage() ||
      this.accounts.busy() ||
      currentIndex < 0 ||
      currentIndex >= order.length ||
      previousIndex === currentIndex
    )
      return;
    const context = this.context();
    const reordered = order.slice();
    moveItemInArray(reordered, previousIndex, currentIndex);
    this.orderNotice.set(null);
    if (await this.accounts.reorderConnections(reordered)) {
      if (context === this.context()) this.orderNotice.set('Kontenreihenfolge gespeichert.');
    }
  }
}
