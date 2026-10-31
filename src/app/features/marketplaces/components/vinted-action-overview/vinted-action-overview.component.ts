import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LucideX } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ActionStatusIndicatorComponent } from '../../../../shared/components/action-status-indicator/action-status-indicator.component';
import { describeVintedAction, type VintedAction } from '../../models/vinted-action-overview';
import {
  VintedActionOverviewHeaderStore,
  vintedActionDismissKey,
} from '../../services/vinted-action-overview-header.store';

@Component({
  selector: 'app-vinted-action-overview',
  imports: [ActionStatusIndicatorComponent, ButtonComponent],
  templateUrl: './vinted-action-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedActionOverviewComponent {
  readonly actions = input<readonly VintedAction[]>([]);
  readonly accountName = input('');
  /** Ohne Konto-ID lassen sich Fehlermeldungen nicht ausblenden. */
  readonly connectionId = input<string | null>(null);
  private readonly overview = inject(VintedActionOverviewHeaderStore);
  readonly dismissIcon = LucideX;
  readonly rows = computed(() =>
    this.actions()
      .filter((action) =>
        ['running', 'succeeded', 'failed', 'outcome_unknown'].includes(action.state),
      )
      .map((action) => ({
        action,
        title: describeVintedAction(action),
        indicator:
          action.state === 'succeeded'
            ? ('success' as const)
            : action.state === 'running'
              ? ('running' as const)
              : ('error' as const),
        dismissible:
          !!this.connectionId() &&
          (action.state === 'failed' || action.state === 'outcome_unknown'),
        subtitle: [
          this.accountName(),
          action.partnerName,
          action.priceCents !== null && action.currency
            ? new Intl.NumberFormat('de-DE', {
                style: 'currency',
                currency: action.currency,
              }).format(action.priceCents / 100)
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
  );

  dismiss(action: VintedAction): void {
    const connectionId = this.connectionId();
    if (connectionId) this.overview.dismiss(vintedActionDismissKey(connectionId, action));
  }
}
