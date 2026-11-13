import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  LucideDownload as Download,
  LucideFileText as FileText,
  LucideTruck as Truck,
} from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import { VintedShippingLabelStore } from '../../services/vinted-shipping-label.store';

/** Versandschein-Aktionen eines Vinted-Verkaufs: anfordern, abholen, öffnen und herunterladen. */
@Component({
  selector: 'app-vinted-shipping-label-actions',
  imports: [ButtonComponent],
  templateUrl: './vinted-shipping-label-actions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedShippingLabelActionsComponent {
  readonly sale = input.required<MarketplaceEntry>();
  readonly labels = inject(VintedShippingLabelStore);
  readonly openError = signal<string | null>(null);
  readonly openIcon = FileText;
  readonly downloadIcon = Download;
  readonly requestIcon = Truck;

  constructor() {
    effect(() => {
      const sale = this.sale();
      const scope = { workspaceId: sale.workspaceId, connectionId: sale.connectionId };
      untracked(() => this.labels.ensureLoaded(scope));
    });
  }

  readonly label = computed(() => {
    const transactionId = this.sale().externalId;
    return transactionId ? (this.labels.byTransaction().get(transactionId) ?? null) : null;
  });
  readonly action = computed(() => {
    const sale = this.sale();
    if (sale.saleState !== 'sold' && sale.saleState !== 'shipped') return null;
    return this.label() ? null : (sale.shippingLabelAction ?? null);
  });
  readonly requesting = computed(() => this.labels.requesting().has(this.sale().id));
  readonly notice = computed(
    () => this.openError() ?? this.labels.notices().get(this.sale().id) ?? null,
  );
  readonly deadline = computed(() =>
    this.sale().saleState === 'sold' ? (this.sale().shippingDeadline ?? null) : null,
  );

  request(): void {
    this.openError.set(null);
    void this.labels.request(this.sale());
  }
  async open(download: boolean): Promise<void> {
    const label = this.label();
    if (!label) return;
    this.openError.set(null);
    try {
      await (download ? this.labels.download(label) : this.labels.open(label));
    } catch (error) {
      this.openError.set(
        error instanceof Error ? error.message : 'Der Versandschein konnte nicht geöffnet werden.',
      );
    }
  }
}
