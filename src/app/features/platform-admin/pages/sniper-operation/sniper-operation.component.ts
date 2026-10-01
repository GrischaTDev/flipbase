import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { SniperAdminState } from '../../services/sniper-admin-state';
import { formatBotUptime, queryStatusLabel } from '../../models/sniper-query.model';
import { VintedCategoriesComponent } from '../vinted-categories/vinted-categories.component';

@Component({
  selector: 'app-sniper-operation',
  imports: [
    DatePipe,
    DecimalPipe,
    CardComponent,
    ButtonComponent,
    BadgeComponent,
    VintedCategoriesComponent,
  ],
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
  readonly activeProblemQueries = computed(() => this.problemQueries().filter((q) => q.is_active));
  readonly activeCount = computed(() => this.state.queries().filter((q) => q.is_active).length);
  readonly categoriesOpen = signal(false);
  readonly statusLabel = queryStatusLabel;
  readonly formatBotUptime = formatBotUptime;
}
