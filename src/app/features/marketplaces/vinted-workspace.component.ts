import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LucideLogIn, LucideStore } from '@lucide/angular';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../shared/components/notice-banner/notice-banner.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { RouteTabsComponent } from '../../shared/components/route-tabs/route-tabs.component';
import { VINTED_SECTIONS } from './models/marketplace-presentation';
import { MarketplaceAccountStore } from './services/marketplace-account.store';
import { MarketplaceSyncProgressComponent } from './components/marketplace-sync-progress/marketplace-sync-progress.component';
import { marketplaceSyncWarningSources } from './models/marketplace-sync-results';
import { VintedAccountControlsComponent } from './components/vinted-account-controls/vinted-account-controls.component';

@Component({
  selector: 'app-vinted-workspace',
  imports: [
    RouterOutlet,
    ButtonComponent,
    CardComponent,
    NoticeBannerComponent,
    PageHeaderComponent,
    RouteTabsComponent,
    MarketplaceSyncProgressComponent,
    VintedAccountControlsComponent,
  ],
  templateUrl: './vinted-workspace.component.html',
  providers: [MarketplaceAccountStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedWorkspaceComponent {
  readonly store = inject(MarketplaceAccountStore);
  private readonly router = inject(Router);
  private readonly currentUrl = signal(this.router.url);
  readonly activeSection = computed(
    () =>
      this.sections.find((section) => this.currentUrl().split(/[?#]/)[0].startsWith(section.path))
        ?.id ?? '',
  );
  readonly sections = VINTED_SECTIONS;
  readonly pageIcon = LucideStore;
  readonly loginIcon = LucideLogIn;
  readonly syncModalOpen = signal(false);
  readonly reconnectLink = computed(() => {
    const account = this.store.selectedConnection();
    return account ? `/marketplaces/vinted/connect/${account.connectionId}` : null;
  });

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.currentUrl.set(event.urlAfterRedirects);
        if (event.urlAfterRedirects.includes('/connect/')) this.syncModalOpen.set(false);
      }
    });
  }

  async sync(): Promise<void> {
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
