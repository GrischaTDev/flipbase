import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon, LucideIconInput } from '@lucide/angular';
import { KpiChange } from '../../models/kpi-change';

export type KpiValueTone = 'default' | 'positive' | 'negative';

@Component({
  selector: 'app-dashboard-kpi-card',
  imports: [LucideDynamicIcon],
  templateUrl: './dashboard-kpi-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DashboardKpiCardComponent {
  readonly label = input.required<string>();
  /** Bereits formatierter Wert, z. B. „42,98 €“. */
  readonly value = input.required<string>();
  readonly icon = input<LucideIconInput | null>(null);
  readonly hint = input<string | null>(null);
  readonly change = input<KpiChange | null>(null);
  readonly comparisonLabel = input<string>('');
  readonly size = input<'large' | 'small'>('small');
  readonly valueTone = input<KpiValueTone>('default');

  protected readonly valueClasses = computed(() => {
    const size = this.size() === 'large' ? 'text-2xl' : 'text-xl';
    const tone = {
      default: 'text-fb-text-primary',
      positive: 'text-fb-finance-positive',
      negative: 'text-fb-finance-negative',
    }[this.valueTone()];
    return `mt-2 font-mono font-semibold tracking-tight ${size} ${tone}`;
  });

  protected readonly changeClasses = computed(() => {
    const tone = {
      success: 'text-fb-success',
      critical: 'text-fb-critical',
      neutral: 'text-fb-text-secondary',
    }[this.change()?.tone ?? 'neutral'];
    return `font-medium tabular-nums ${tone}`;
  });
}
