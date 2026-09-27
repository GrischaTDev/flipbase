import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LucideChartNoAxesCombined as ChartNoAxesCombined } from '@lucide/angular';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import {
  PlatformUser,
  PlatformUserActionType,
  PlatformUserRecentAction,
} from '../../models/platform-user.model';
import { PlatformUserService } from '../../services/platform-user.service';

@Component({
  selector: 'app-platform-user-usage',
  imports: [CardComponent, DatePipe, PageHeaderComponent],
  templateUrl: './platform-user-usage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformUserUsageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(PlatformUserService);

  readonly usageIcon = ChartNoAxesCombined;
  readonly user = signal<PlatformUser | null>(null);
  readonly actions = signal<readonly PlatformUserRecentAction[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  actionLabel(eventType: PlatformUserActionType): string {
    switch (eventType) {
      case 'purchase_draft_created':
        return 'Einkaufsentwurf angelegt';
      case 'purchase_finalized':
        return 'Einkauf abgeschlossen';
      case 'sale_recorded':
        return 'Verkauf erfasst';
    }
  }

  private async load(): Promise<void> {
    const userId = this.route.snapshot.paramMap.get('userId');
    if (!userId) {
      this.error.set('Nutzer nicht gefunden.');
      this.loading.set(false);
      return;
    }

    try {
      const user = (await this.service.list()).find((entry) => entry.userId === userId);
      if (!user) {
        this.error.set('Nutzer nicht gefunden.');
        return;
      }
      this.user.set(user);
      this.actions.set(await this.service.listRecentActions(userId));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }
}
