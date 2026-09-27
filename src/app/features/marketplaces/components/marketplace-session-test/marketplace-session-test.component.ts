import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  BadgeComponent,
  type BadgeTone,
} from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import type { MarketplaceTestSessionState } from '../../models/marketplace-test-session';
import { MarketplaceTestSessionStore } from '../../services/marketplace-test-session.store';
import { MarketplaceBrowserTestComponent } from '../marketplace-browser-test/marketplace-browser-test.component';

@Component({
  selector: 'app-marketplace-session-test',
  imports: [
    DatePipe,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    NoticeBannerComponent,
    MarketplaceBrowserTestComponent,
  ],
  providers: [MarketplaceTestSessionStore],
  templateUrl: './marketplace-session-test.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class MarketplaceSessionTestComponent {
  readonly store = inject(MarketplaceTestSessionStore);
  readonly labels: Record<MarketplaceTestSessionState, string> = {
    active: 'Aktiv',
    expired: 'Abgelaufen',
    revoked: 'Widerrufen',
    interrupted: 'Browserabbruch',
  };
  readonly tones: Record<MarketplaceTestSessionState, BadgeTone> = {
    active: 'success',
    expired: 'caution',
    revoked: 'neutral',
    interrupted: 'critical',
  };
}
