import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LucideFileText as FileText, LucideTruck as Truck } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import { VintedShippingLabelStore } from '../../services/vinted-shipping-label.store';

/** Versandschein eines Vinted-Verkaufs anfordern, abholen oder in der Liste aufrufen. */
@Component({
  selector: 'app-vinted-shipping-label-actions',
  imports: [ButtonComponent],
  templateUrl: './vinted-shipping-label-actions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedShippingLabelActionsComponent {
  readonly sale = input.required<MarketplaceEntry>();
  readonly iconOnly = input(false);
  readonly labels = inject(VintedShippingLabelStore);
  readonly openIcon = FileText;
  readonly requestIcon = Truck;
  readonly label = computed(() => this.labels.findForSale(this.sale()));
  readonly action = computed(() => {
    const sale = this.sale();
    if (sale.saleState !== 'sold' && sale.saleState !== 'shipped') return null;
    return this.label() ? null : (sale.shippingLabelAction ?? null);
  });
  readonly requesting = computed(() => this.labels.requesting().has(this.sale().id));
  readonly deadline = computed(() =>
    this.sale().saleState === 'sold' ? (this.sale().shippingDeadline ?? null) : null,
  );

  readonly actionLabel = computed(() => {
    if (this.label()) return 'Zum Versandschein';
    return this.action() === 'order' ? 'Versandschein anfordern' : 'Versandschein abholen';
  });
  readonly actionTooltip = computed(() => {
    if (!this.iconOnly()) return '';
    const deadline = this.deadline();
    return deadline ? `${this.actionLabel()} · Verschicken bis ${deadline}` : this.actionLabel();
  });

  request(): void {
    void this.labels.request(this.sale());
  }
}
