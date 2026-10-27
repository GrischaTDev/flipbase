import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { describeVintedAction, type VintedAction } from '../../models/vinted-action-overview';

@Component({
  selector: 'app-vinted-action-overview',
  imports: [LoadingIndicatorComponent],
  templateUrl: './vinted-action-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedActionOverviewComponent {
  readonly actions = input<readonly VintedAction[]>([]);
  readonly accountName = input('');
  readonly rows = computed(() =>
    this.actions()
      .filter((action) => action.state === 'running')
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
