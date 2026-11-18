import { DatePipe } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  ElementRef,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { LucideDownload as Download, LucideFileText as FileText } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
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
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly highlightedLabelId = computed(() => this.queryParams().get('labelId'));
  readonly openIcon = FileText;
  readonly downloadIcon = Download;
  readonly cloud = computed(() => this.store.selectedConnection()?.executionMode === 'cloud');
  readonly rows = computed(() => {
    const account = this.store.selectedConnection();
    const query = this.search().trim().toLocaleLowerCase('de');
    return this.labels
      .labels()
      .filter(
        (label) =>
          label.workspaceId === account?.workspaceId &&
          label.connectionId === account.connectionId &&
          (!query ||
            label.title.toLocaleLowerCase('de').includes(query) ||
            label.transactionId.includes(query) ||
            (label.carrierName ?? '').toLocaleLowerCase('de').includes(query)),
      );
  });

  constructor() {
    effect(() => {
      const connection = this.store.selectedConnection();
      if (connection?.executionMode !== 'cloud') return;
      const scope = { workspaceId: connection.workspaceId, connectionId: connection.connectionId };
      untracked(() => void this.labels.load(scope));
    });

    let focusedLabelId: string | null = null;
    afterRenderEffect({
      write: () => {
        const id = this.highlightedLabelId();
        if (!id) {
          focusedLabelId = null;
          return;
        }
        if (
          focusedLabelId === id ||
          this.labels.loading() ||
          !this.rows().some((label) => label.id === id)
        )
          return;
        const row = this.host.nativeElement.querySelector<HTMLElement>('tr[aria-current="true"]');
        if (!row) return;
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        focusedLabelId = id;
      },
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
    try {
      await (download ? this.labels.download(label) : this.labels.open(label));
    } catch (error) {
      this.toast.error(
        error instanceof Error ? error.message : 'Der Versandschein konnte nicht geöffnet werden.',
      );
    }
  }
}
