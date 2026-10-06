import { DecimalPipe } from '@angular/common';
import {
  CdkDrag,
  CdkDragHandle,
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
import {
  LucideArrowRight,
  LucideArrowUp,
  LucideArrowDown,
  LucideGripVertical,
  LucideSettings,
  LucidePlus,
  LucideTrash2,
  LucideDynamicIcon,
} from '@lucide/angular';
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
import { MarketplaceCloudSetupStore } from '../../services/marketplace-cloud-setup.store';
import { VintedAccountPreviewsStore } from '../../services/vinted-account-previews.store';
import { MarketplaceAccountsComponent } from '../marketplace-accounts/marketplace-accounts.component';
import { VintedFavoriteSettingsComponent } from '../vinted-favorite-settings/vinted-favorite-settings.component';
import { VintedRatingComponent } from '../vinted-rating/vinted-rating.component';
import { VintedSetupComponent } from '../vinted-setup/vinted-setup.component';

@Component({
  selector: 'app-vinted-account-grid',
  imports: [
    DecimalPipe,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    BadgeComponent,
    CardComponent,
    ButtonComponent,
    ModalShellComponent,
    NoticeBannerComponent,
    ProductThumbnailComponent,
    VintedRatingComponent,
    LucideDynamicIcon,
    VintedSetupComponent,
    MarketplaceAccountsComponent,
    VintedFavoriteSettingsComponent,
  ],
  templateUrl: './vinted-account-grid.component.html',
  providers: [VintedAccountPreviewsStore, MarketplaceCloudSetupStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedAccountGridComponent {
  readonly accounts = inject(MarketplaceAccountStore);
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
  readonly arrowIcon = LucideArrowRight;
  readonly upIcon = LucideArrowUp;
  readonly downIcon = LucideArrowDown;
  readonly dragIcon = LucideGripVertical;
  readonly settingsIcon = LucideSettings;
  readonly addIcon = LucidePlus;
  readonly deleteIcon = LucideTrash2;

  constructor() {
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

  connectionLabel(account: MarketplaceConnection): string {
    if (account.status === 'connected')
      return account.executionMode === 'local' ? 'Lokal verbunden' : 'Mit Cloud verbunden';
    return MARKETPLACE_CONNECTION_LABELS[account.status];
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
