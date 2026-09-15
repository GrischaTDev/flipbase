import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { SniperAdminState } from '../../services/sniper-admin-state';
import { formatBotUptime, queryStatusLabel } from '../../models/sniper-query.model';

@Component({
  selector: 'app-sniper-operation',
  imports: [DatePipe, DecimalPipe, PercentPipe, CardComponent, ButtonComponent, BadgeComponent],
  templateUrl: './sniper-operation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SniperAdminState],
})
export class SniperOperationComponent {
  readonly state = inject(SniperAdminState);
  readonly problemQueries = computed(() =>
    this.state
      .queries()
      .filter((q) => ['rate_limited', 'forbidden', 'failed'].includes(q.last_status)),
  );
  readonly stoppedQueries = computed(() => this.problemQueries().filter((q) => !q.is_active));
  readonly statusLabel = queryStatusLabel;
  readonly formatBotUptime = formatBotUptime;
}
