import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LucideArrowLeft, LucideLogIn, LucideStore } from '@lucide/angular';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../shared/components/notice-banner/notice-banner.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MarketplaceAccountStore } from './services/marketplace-account.store';
import { MarketplaceSyncProgressComponent } from './components/marketplace-sync-progress/marketplace-sync-progress.component';
import { marketplaceSyncWarningSources } from './models/marketplace-sync-results';
import { VintedAccountControlsComponent } from './components/vinted-account-controls/vinted-account-controls.component';
import { VintedSetupComponent } from './components/vinted-setup/vinted-setup.component';
import { VintedLocalExtensionBridge } from './services/vinted-local-extension-bridge';
import { VintedLocalExtensionStore } from './services/vinted-local-extension.store';

@Component({
  selector: 'app-vinted-workspace',
  imports: [
    RouterOutlet,
    ButtonComponent,
    VintedSetupComponent,
    NoticeBannerComponent,
    PageHeaderComponent,
    MarketplaceSyncProgressComponent,
    VintedAccountControlsComponent,
  ],
  templateUrl: './vinted-workspace.component.html',
  providers: [MarketplaceAccountStore, VintedLocalExtensionBridge, VintedLocalExtensionStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedWorkspaceComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly local = inject(VintedLocalExtensionStore);
  private readonly extension = inject(VintedLocalExtensionBridge);
  private readonly router = inject(Router);
  private readonly currentUrl = signal(this.router.url);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly showingAccounts = computed(() =>
    ['/marketplaces/vinted', '/marketplaces/vinted/accounts'].includes(
      this.currentUrl().split(/[?#]/)[0],
    ),
  );
  readonly backIcon = LucideArrowLeft;
  readonly showingSetup = computed(
    () => this.currentUrl().split(/[?#]/)[0] === '/marketplaces/vinted/setup',
  );
  readonly showingMessages = computed(
    () => this.currentUrl().split(/[?#]/)[0] === '/marketplaces/vinted/messages',
  );
  readonly showingManagement = computed(
    () => this.currentUrl().split(/[?#]/)[0] === '/marketplaces/vinted/manage',
  );
  readonly showingLocalConnection = computed(() =>
    this.currentUrl().split(/[?#]/)[0].startsWith('/marketplaces/vinted/local-connect/'),
  );
  readonly pageIcon = LucideStore;
  readonly loginIcon = LucideLogIn;
  readonly syncModalOpen = signal(false);
  readonly reconnectLink = computed(() => {
    const account = this.store.selectedConnection();
    return account
      ? `/marketplaces/vinted/${account.executionMode === 'local' ? 'local-connect' : 'connect'}/${account.connectionId}`
      : null;
  });

  constructor() {
    effect(() => {
      if (!this.showingLocalConnection()) {
        const account = this.store.selectedConnection();
        this.local.connection.set(account?.executionMode === 'local' ? account : null);
        if (account?.executionMode === 'local') this.extension.checkInstallation();
      }
    });
    // Konto-Kacheln adressieren ihr Konto ausdrücklich; Bereichslinks nutzen danach die gespeicherte Auswahl.
    effect(() => {
      const url = this.currentUrl().split(/[?#]/)[0];
      const id = this.queryParams().get('connectionId');
      const connections = this.store.connections();
      if (
        url !== '/marketplaces/vinted/overview' ||
        !id ||
        !connections.some((account) => account.connectionId === id)
      )
        return;
      untracked(() => {
        if (this.store.selectedConnection()?.connectionId !== id)
          void this.store.selectConnection(id);
        const destination = this.router.parseUrl(this.currentUrl());
        delete destination.queryParams['connectionId'];
        void this.router.navigateByUrl(destination, { replaceUrl: true });
      });
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.currentUrl.set(event.urlAfterRedirects);
        if (event.urlAfterRedirects.includes('/connect/')) this.syncModalOpen.set(false);
      }
    });
  }

  async sync(): Promise<void> {
    const account = this.store.selectedConnection();
    if (account?.executionMode === 'local') {
      if (this.local.busy()) return;
      await this.local.loadConnection(account);
      if (
        !this.local.isCurrentConnection(account) ||
        this.store.selectedConnection()?.connectionId !== account.connectionId
      )
        return;
      if (!this.local.hasValidBinding()) {
        if (this.local.error()) return;
        this.local.showSetupNotice();
        await this.router.navigate(['/marketplaces/vinted/local-connect', account.connectionId]);
        return;
      }
      if (this.showingMessages()) await this.local.syncInbox();
      else await this.local.sync();
      return;
    }
    this.syncModalOpen.set(true);
    const succeeded = await this.store.syncSelectedConnection();
    const progress = this.store.syncProgress();
    if (
      succeeded &&
      progress?.state === 'succeeded' &&
      progress.errorCode !== 'cleanup' &&
      !marketplaceSyncWarningSources(progress.sourceResults).length
    ) {
      setTimeout(() => {
        const current = this.store.syncProgress();
        if (
          current?.id === progress.id &&
          current.state === 'succeeded' &&
          current.errorCode !== 'cleanup' &&
          !marketplaceSyncWarningSources(current.sourceResults).length
        )
          this.syncModalOpen.set(false);
      }, 1_500);
    }
  }
}
