import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  DashboardOpenCost,
  DashboardOpenCostReason,
} from '../../../../core/models/flipbase.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';

/** Mehr Zeilen verdrängen die Kennzahlen; der Rest bleibt über die Einkaufsliste erreichbar. */
const VISIBLE_ENTRIES = 5;

const REASON_TEXT: Readonly<Record<DashboardOpenCostReason, string>> = {
  price_missing: 'Einkaufspreis fehlt',
  not_finalized: 'Einkauf nicht abgeschlossen',
  cost_not_allocated: 'Kosten nicht auf Artikel verteilt',
};

interface OpenCostView {
  readonly purchaseId: string;
  readonly link: string;
  readonly title: string;
  readonly reason: string;
  readonly scope: string;
}

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

  protected readonly visibleEntries = computed<readonly OpenCostView[]>(() =>
    this.openCosts()
      .slice(0, VISIBLE_ENTRIES)
      .map((entry) => ({
        purchaseId: entry.purchaseId,
        link: `/purchases/${entry.purchaseId}`,
        title: entry.recordNumber ? `${entry.recordNumber} · ${entry.title}` : entry.title,
        reason: REASON_TEXT[entry.reason],
        scope: scopeText(entry),
      })),
  );
  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.openCosts().length - VISIBLE_ENTRIES),
  );
  protected readonly salesWithoutPurchaseText = computed(() => {
    const count = this.salesWithoutPurchase();
    return count === 1
      ? '1 Verkauf ohne nachvollziehbare Kosten'
      : `${count} Verkäufe ohne nachvollziehbare Kosten`;
  });
  protected readonly hasContent = computed(
    () => this.openCosts().length > 0 || this.salesWithoutPurchase() > 0,
  );
}

function scopeText(entry: DashboardOpenCost): string {
  const parts: string[] = [];
  if (entry.affectedSales > 0) {
    parts.push(entry.affectedSales === 1 ? '1 Verkauf' : `${entry.affectedSales} Verkäufe`);
  }
  if (entry.affectedInventory > 0) {
    parts.push(
      entry.affectedInventory === 1
        ? '1 Artikel im Bestand'
        : `${entry.affectedInventory} Artikel im Bestand`,
    );
  }
  return parts.length > 0 ? `betrifft ${parts.join(' · ')}` : 'Einkauf im gewählten Zeitraum';
}
