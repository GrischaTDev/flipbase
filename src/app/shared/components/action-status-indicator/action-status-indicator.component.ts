import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LoadingIndicatorComponent } from '../loading-indicator/loading-indicator.component';

@Component({
  selector: 'app-action-status-indicator',
  imports: [LoadingIndicatorComponent],
  templateUrl: './action-status-indicator.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true' },
})
export class ActionStatusIndicatorComponent {
  readonly state = input.required<'running' | 'success' | 'error' | 'paused'>();
  /** `large` für einen alleinstehenden Abschlusszustand, etwa eine leere Aktionsliste. */
  readonly size = input<'regular' | 'large'>('regular');
}
