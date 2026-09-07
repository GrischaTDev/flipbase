import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucidePencil as Pencil } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';

export interface PurchaseCostSummaryCost {
  readonly type: string;
  readonly amount: number;
  readonly description?: string | null;
}

interface CostSummaryRow {
  readonly label: string;
  readonly amount: number;
  readonly subtract: boolean;
}

@Component({
  selector: 'app-purchase-cost-summary',
  imports: [ButtonComponent, CardComponent],
  templateUrl: './purchase-cost-summary.component.html',
  host: {
    class: 'block',
    role: 'region',
    'aria-label': 'Kostenübersicht',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCostSummaryComponent {
  readonly goodsAmount = input<number | null>(null);
  readonly discountAmount = input(0);
  readonly costs = input<readonly PurchaseCostSummaryCost[]>([]);
  readonly totalAmount = input<number | null | undefined>(undefined);
  readonly legacyShippingAmount = input(0);
  readonly legacyOtherCostsAmount = input(0);
  readonly editable = input(true);

  readonly editRequested = output<void>();
  readonly editIcon = Pencil;

  readonly rows = computed<readonly CostSummaryRow[]>(() => {
    const rows: CostSummaryRow[] = [];
    const goodsAmount = this.goodsAmount();
    if (goodsAmount !== null)
      rows.push({ label: 'Warenbetrag', amount: goodsAmount, subtract: false });
    if (this.discountAmount() > 0) {
      rows.push({ label: 'Rabatt', amount: this.discountAmount(), subtract: true });
    }
    if (this.legacyShippingAmount() > 0) {
      rows.push({ label: 'Versandkosten', amount: this.legacyShippingAmount(), subtract: false });
    }
    if (this.legacyOtherCostsAmount() > 0) {
      rows.push({
        label: 'Weitere Kosten',
        amount: this.legacyOtherCostsAmount(),
        subtract: false,
      });
    }
    for (const cost of this.costs()) {
      rows.push({
        label: cost.description || costTypeLabel(cost.type),
        amount: cost.amount,
        subtract: false,
      });
    }
    return rows;
  });

  readonly displayedTotal = computed(() => {
    const authoritativeTotal = this.totalAmount();
    if (authoritativeTotal !== undefined) return authoritativeTotal;
    const goodsAmount = this.goodsAmount();
    if (goodsAmount === null) return null;
    const additionalCosts = this.costs().reduce((sum, cost) => sum + cost.amount, 0);
    const calculatedTotal =
      goodsAmount -
      this.discountAmount() +
      this.legacyShippingAmount() +
      this.legacyOtherCostsAmount() +
      additionalCosts;
    return Math.round((calculatedTotal + Number.EPSILON) * 100) / 100;
  });

  formatCurrency(amount: number | null): string {
    if (amount === null) return '—';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  }
}

function costTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    shipping: 'Versandkosten',
    travel: 'Fahrtkosten',
    packaging: 'Verpackung',
    transport: 'Frachtgebühr',
    customs: 'Zölle',
    import: 'Importabgaben',
    fee: 'Gebühr',
    other: 'Sonstiges',
  };
  return labels[type] ?? 'Zusätzliche Kosten';
}
