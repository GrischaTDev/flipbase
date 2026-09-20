import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucidePencil as Pencil } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';

import {
  PurchaseCostTaxTreatment,
  purchaseCostTaxTreatmentLabel,
} from '../purchase-cost-editor/purchase-cost-adjustments';
import { purchaseCostTypeLabel } from '../../utils/purchase-cost-labels';

export interface PurchaseCostSummaryCost {
  readonly type: string;
  readonly amount: number;
  readonly description?: string | null;
  readonly taxTreatment?: PurchaseCostTaxTreatment | null;
  readonly tax_treatment?: PurchaseCostTaxTreatment | null;
}

interface CostSummaryRow {
  readonly label: string;
  readonly amount: number;
  readonly subtract: boolean;
  readonly detail?: string;
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
  readonly itemCount = input(0);
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
    if (this.legacyShippingAmount() > 0) {
      rows.push({
        label: 'Versandkosten',
        amount: this.legacyShippingAmount(),
        subtract: false,
        detail: 'Noch prüfen',
      });
    }
    if (this.legacyOtherCostsAmount() > 0) {
      rows.push({
        label: 'Weitere Kosten',
        detail: 'Noch prüfen',
        amount: this.legacyOtherCostsAmount(),
        subtract: false,
      });
    }
    for (const cost of this.costs()) {
      rows.push({
        label: cost.description || purchaseCostTypeLabel(cost.type),
        detail: purchaseCostTaxTreatmentLabel(
          cost.tax_treatment !== undefined ? cost.tax_treatment : cost.taxTreatment,
        ),
        amount: cost.amount,
        subtract: false,
      });
    }
    return rows;
  });

  readonly displayedGoodsAmount = computed(() => this.goodsAmount() ?? 0);
  readonly itemCountLabel = computed(() =>
    this.itemCount() === 1 ? '1 Artikel' : `${this.itemCount()} Artikel`,
  );

  readonly displayedTotal = computed(() => {
    const authoritativeTotal = this.totalAmount();
    if (authoritativeTotal !== undefined) return authoritativeTotal ?? 0;
    const goodsAmount = this.goodsAmount() ?? 0;
    const additionalCosts = this.costs().reduce((sum, cost) => sum + cost.amount, 0);
    const calculatedTotal =
      goodsAmount -
      this.discountAmount() +
      this.legacyShippingAmount() +
      this.legacyOtherCostsAmount() +
      additionalCosts;
    return Math.round((calculatedTotal + Number.EPSILON) * 100) / 100;
  });

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  }
}
