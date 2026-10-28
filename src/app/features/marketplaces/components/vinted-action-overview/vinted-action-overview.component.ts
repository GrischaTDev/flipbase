import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ActionStatusIndicatorComponent } from '../../../../shared/components/action-status-indicator/action-status-indicator.component';
import { describeVintedAction, type VintedAction } from '../../models/vinted-action-overview';

@Component({
  selector: 'app-vinted-action-overview',
  imports: [ActionStatusIndicatorComponent],
  templateUrl: './vinted-action-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedActionOverviewComponent {
  readonly actions = input<readonly VintedAction[]>([]);
  readonly accountName = input('');
  readonly rows = computed(() =>
    this.actions()
      .filter((action) => action.state === 'running' || action.state === 'succeeded')
      .map((action) => ({
        action,
        title: describeVintedAction(action),
        subtitle: [
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
}
