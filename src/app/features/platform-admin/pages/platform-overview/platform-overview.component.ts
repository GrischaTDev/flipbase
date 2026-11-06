import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  LucideActivity as Activity,
  LucideHouse as House,
  LucideKeyRound as KeyRound,
  LucideMoon as Moon,
  LucideRefreshCw as RefreshCw,
  LucideUserPlus as UserPlus,
  LucideUsers as Users,
} from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SummaryMetricComponent } from '../../../../shared/components/summary-metric/summary-metric.component';
import type { BetaApplication } from '../../models/beta-application.model';
import type { PlatformUser } from '../../models/platform-user.model';
import {
  INACTIVE_AFTER_DAYS,
  RECENTLY_ACTIVE_DAYS,
  platformOverviewMetrics,
  recentPlatformActivity,
} from '../../models/platform-overview-metrics';
import { BetaApplicationService } from '../../services/beta-application.service';
import { PlatformUserService } from '../../services/platform-user.service';

const RECENT_ACTIVITY_LIMIT = 8;

@Component({
  selector: 'app-platform-overview',
  imports: [
    DatePipe,
    RouterLink,
    ButtonComponent,
    CardComponent,
    PageHeaderComponent,
    SummaryMetricComponent,
  ],
  templateUrl: './platform-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformOverviewComponent implements OnInit {
  private readonly userService = inject(PlatformUserService);
  private readonly applicationService = inject(BetaApplicationService);

  readonly overviewIcon = House;
  readonly refreshIcon = RefreshCw;

  readonly users = signal<readonly PlatformUser[]>([]);
  readonly applications = signal<readonly BetaApplication[]>([]);
  readonly loadedAt = signal(Date.now());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly metrics = computed(() => {
    const values = platformOverviewMetrics(this.users(), this.applications(), this.loadedAt());
    return [
      { key: 'users', label: 'Nutzer', value: values.registeredUsers, icon: Users },
      {
        key: 'active',
        label: `Aktiv in ${RECENTLY_ACTIVE_DAYS} Tagen`,
        value: values.recentlyActiveUsers,
        icon: Activity,
      },
      {
        key: 'inactive',
        label: `Über ${INACTIVE_AFTER_DAYS} Tage inaktiv`,
        value: values.inactiveUsers,
        icon: Moon,
      },
      { key: 'access', label: 'Aktive Zugänge', value: values.activeAccesses, icon: KeyRound },
      {
        key: 'applications',
        label: 'Offene Bewerbungen',
        value: values.openApplications,
        icon: UserPlus,
      },
    ] as const;
  });

  readonly recentActivity = computed(() =>
    recentPlatformActivity(this.users(), RECENT_ACTIVITY_LIMIT),
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [users, applications] = await Promise.all([
        this.userService.list(),
        this.applicationService.list(),
      ]);
      this.users.set(users);
      this.applications.set(applications);
      this.loadedAt.set(Date.now());
    } catch {
      this.error.set('Die Übersicht konnte nicht geladen werden.');
    } finally {
      this.loading.set(false);
    }
  }
}
