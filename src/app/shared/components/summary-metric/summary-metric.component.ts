import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon, LucideIconInput } from '@lucide/angular';

@Component({
  selector: 'app-summary-metric',
  imports: [LucideDynamicIcon],
  templateUrl: './summary-metric.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 px-4 py-5 sm:px-6 sm:py-6' },
})
export class SummaryMetricComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly icon = input.required<LucideIconInput>();
  readonly negative = input(false);
}
