import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
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
  imports: [DatePipe, ActionStatusIndicatorComponent, ButtonComponent],
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
        ['queued', 'running', 'succeeded', 'failed', 'outcome_unknown', 'cancelled'].includes(
          action.state,
        ),
      )
      .map((action) => ({
        action,
        title:
          action.state === 'queued'
            ? 'Wartet · ' + describeVintedAction(action)
            : action.state === 'cancelled'
              ? 'Abgebrochen'
              : describeVintedAction(action),
        waitReason:
          action.waitReason === 'account_busy'
            ? 'Konto ist beschäftigt'
            : action.waitReason === 'pool_busy'
              ? 'Alle Browserplätze sind belegt'
              : action.waitReason === 'dependency_unresolved'
                ? 'Vorherige Änderung muss geprüft werden'
                : action.waitReason === 'account_paused'
                  ? 'Konto benötigt Deine Anmeldung'
                  : null,
        indicator:
          action.state === 'queued' || action.state === 'cancelled'
            ? ('paused' as const)
            : action.state === 'succeeded'
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
