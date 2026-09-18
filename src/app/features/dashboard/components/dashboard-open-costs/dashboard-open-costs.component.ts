import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DashboardOpenCost } from '../../../../core/models/flipbase.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';

@Component({
  selector: 'app-dashboard-open-costs',
  imports: [ButtonComponent, CardComponent],
  templateUrl: './dashboard-open-costs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DashboardOpenCostsComponent {
  readonly openCosts = input.required<readonly DashboardOpenCost[]>();
  readonly salesWithoutPurchase = input<number>(0);
  readonly inventoryItemsWithoutCost = input<number>(0);

  protected readonly purchaseTaskText = computed(() => {
    const inventoryCount = this.inventoryItemsWithoutCost();
    if (inventoryCount > 0) {
      return inventoryCount === 1
        ? '1 Artikel ohne Kostenangabe'
        : `${inventoryCount} Artikel ohne Kostenangabe`;
    }

    const count = this.openCosts().length;
    return count === 1
      ? '1 Einkauf mit fehlenden Kostenangaben'
      : `${count} Einkäufe mit fehlenden Kostenangaben`;
  });

  protected readonly salesWithoutPurchaseText = computed(() => {
    const count = this.salesWithoutPurchase();
    return count === 1
      ? '1 Verkauf ohne nachvollziehbare Kosten'
      : `${count} Verkäufe ohne nachvollziehbare Kosten`;
  });

  protected readonly hasPurchaseTask = computed(
    () => this.openCosts().length > 0 || this.inventoryItemsWithoutCost() > 0,
  );
  protected readonly hasContent = computed(
    () => this.hasPurchaseTask() || this.salesWithoutPurchase() > 0,
  );
}
