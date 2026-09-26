import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LucideBell, LucideRefreshCw, LucideSettings, LucideStore } from '@lucide/angular';
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
  readonly refreshIcon = LucideRefreshCw;
}
