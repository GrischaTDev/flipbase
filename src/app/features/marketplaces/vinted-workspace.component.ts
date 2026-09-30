import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import {
  LucideBell,
  LucideRefreshCw,
  LucideSettings,
  LucideLogIn,
  LucideStore,
} from '@lucide/angular';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { NoticeBannerComponent } from '../../shared/components/notice-banner/notice-banner.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SectionNavigationComponent } from '../../shared/components/section-navigation/section-navigation.component';
import {
  MARKETPLACE_CONNECTION_LABELS,
  MARKETPLACE_CONNECTION_TONES,
  VINTED_SECTIONS,
} from './models/marketplace-presentation';
import { MarketplaceAccountStore } from './services/marketplace-account.store';
import { MarketplaceSyncProgressComponent } from './components/marketplace-sync-progress/marketplace-sync-progress.component';
import { marketplaceSyncWarningSources } from './models/marketplace-sync-results';

@Component({
  selector: 'app-vinted-workspace',
  imports: [
    DatePipe,
    RouterOutlet,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CustomSelectComponent,
    NoticeBannerComponent,
    PageHeaderComponent,
    SectionNavigationComponent,
    MarketplaceSyncProgressComponent,
  ],
  templateUrl: './vinted-workspace.component.html',
  providers: [MarketplaceAccountStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedWorkspaceComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly accountOptions = computed(() =>
    this.store.connections().map((account) => ({
      value: account.connectionId,
      label: account.displayName,
      description: MARKETPLACE_CONNECTION_LABELS[account.status],
    })),
  );
  readonly labels = MARKETPLACE_CONNECTION_LABELS;
  readonly tones = MARKETPLACE_CONNECTION_TONES;
  readonly sections = VINTED_SECTIONS;
  readonly pageIcon = LucideStore;
  readonly settingsIcon = LucideSettings;
  readonly activityIcon = LucideBell;
  readonly loginIcon = LucideLogIn;
  readonly refreshIcon = LucideRefreshCw;
  readonly syncModalOpen = signal(false);
  readonly reconnectLink = computed(() => {
    const account = this.store.selectedConnection();
    return account ? `/marketplaces/vinted/connect/${account.connectionId}` : null;
  });

  constructor() {
    const router = inject(Router);
    router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd && event.urlAfterRedirects.includes('/connect/')) {
        this.syncModalOpen.set(false);
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
