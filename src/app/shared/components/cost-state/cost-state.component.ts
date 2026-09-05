import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type CostState =
  { readonly kind: 'known'; readonly amount: number } | { readonly kind: 'open' };

@Component({
  selector: 'app-cost-state',
  imports: [],
  templateUrl: './cost-state.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CostStateComponent {
  readonly state = input<CostState>({ kind: 'open' });

  readonly display = computed(() => {
    const state = this.state();
    if (state.kind === 'open') {
      return {
        text: 'Kosten noch offen',
        label: 'Kosten noch offen: Betrag wurde noch nicht erfasst',
      };
    }

    const amount = new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(state.amount);
    return { text: amount, label: `Kosten: ${amount}` };
  });
}
