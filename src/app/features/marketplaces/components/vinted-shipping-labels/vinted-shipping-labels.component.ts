import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { LucideDownload as Download, LucideFileText as FileText } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import {
  vintedShippingLabelTypeLabel,
  type VintedShippingLabel,
} from '../../models/vinted-shipping-label';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedShippingLabelStore } from '../../services/vinted-shipping-label.store';

/** Übersicht aller gespeicherten Versandscheine des gewählten Vinted-Kontos. */
@Component({
  selector: 'app-vinted-shipping-labels',
  imports: [DatePipe, ButtonComponent, DataTableComponent],
  templateUrl: './vinted-shipping-labels.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedShippingLabelsComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly labels = inject(VintedShippingLabelStore);
  readonly search = signal('');
  readonly openError = signal<string | null>(null);
  readonly openIcon = FileText;
  readonly downloadIcon = Download;
  readonly cloud = computed(() => this.store.selectedConnection()?.executionMode === 'cloud');
  readonly rows = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('de');
    return this.labels
      .labels()
      .filter(
        (label) =>
          !query ||
          label.title.toLocaleLowerCase('de').includes(query) ||
          label.transactionId.includes(query) ||
          (label.carrierName ?? '').toLocaleLowerCase('de').includes(query),
      );
  });

  constructor() {
    effect(() => {
      const connection = this.store.selectedConnection();
      if (connection?.executionMode !== 'cloud') return;
      const scope = { workspaceId: connection.workspaceId, connectionId: connection.connectionId };
      untracked(() => void this.labels.load(scope));
    });
  }

  typeLabel(label: VintedShippingLabel): string {
    return vintedShippingLabelTypeLabel(label);
  }

  refresh(): void {
    const connection = this.store.selectedConnection();
    if (connection)
      void this.labels.load({
        workspaceId: connection.workspaceId,
        connectionId: connection.connectionId,
      });
  }

  async open(label: VintedShippingLabel, download: boolean): Promise<void> {
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
