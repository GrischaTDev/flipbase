import { DatePipe } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  DestroyRef,
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
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import {
  vintedShippingLabelTypeLabel,
  type VintedShippingLabel,
} from '../../models/vinted-shipping-label';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedAccountViewService } from '../../services/vinted-account-view.service';
import { vintedAccountLabels } from '../../models/vinted-account-labels';
import { VintedShippingLabelStore } from '../../services/vinted-shipping-label.store';

/** Gespeicherte Vinted-Versandscheine aus allen Konten des aktuellen Workspace. */
@Component({
  selector: 'app-vinted-shipping-labels',
  imports: [DatePipe, ButtonComponent, DataTableComponent, ProductThumbnailComponent],
  templateUrl: './vinted-shipping-labels.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedShippingLabelsComponent {
  readonly store = inject(MarketplaceAccountStore);
  private readonly accountView = inject(VintedAccountViewService);
  readonly labels = inject(VintedShippingLabelStore);
  readonly search = signal('');
  private readonly workspace = inject(WorkspaceService);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly targetLabelId = computed(() => this.queryParams().get('labelId'));
  private readonly activeHighlight = signal<string | null>(null);
  readonly highlightedLabelId = computed(() => {
    const target = this.targetLabelId();
    return target === this.activeHighlight() ? target : null;
  });
  readonly openIcon = FileText;
  readonly downloadIcon = Download;
  readonly accountNames = computed(() => vintedAccountLabels(this.store.connections()));
  readonly rows = computed(() => {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!this.store.canManage()) return [];
    const query = this.search().trim().toLocaleLowerCase('de');
    const accounts = this.accountNames();
    const connectionId = this.accountView.showAllAccounts()
      ? undefined
      : this.store.selectedConnection()?.connectionId;
    return this.labels
      .labels()
      .filter(
        (label) =>
          label.workspaceId === workspaceId &&
          (!connectionId ||
            label.connectionId === connectionId ||
            label.id === this.targetLabelId()) &&
          (!query ||
            label.title.toLocaleLowerCase('de').includes(query) ||
            label.transactionId.includes(query) ||
            (label.carrierName ?? '').toLocaleLowerCase('de').includes(query) ||
            (accounts.get(label.connectionId) ?? '').toLocaleLowerCase('de').includes(query)),
      );
  });

  constructor() {
    effect(() => {
      const workspaceId = this.workspace.currentWorkspace()?.id;
      if (workspaceId && this.store.canManage())
        untracked(() => void this.labels.load({ workspaceId }));
    });

    let focusedLabelId: string | null = null;
    let highlightTimer: ReturnType<typeof setTimeout> | undefined;
    inject(DestroyRef).onDestroy(() => clearTimeout(highlightTimer));
    afterRenderEffect({
      write: () => {
        const id = this.targetLabelId();
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
        const row = this.host.nativeElement.querySelector<HTMLElement>(
          'tr[data-shipping-label-target]',
        );
        if (!row) return;
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: 'nearest', inline: 'start' });
        focusedLabelId = id;
        this.activeHighlight.set(id);
        clearTimeout(highlightTimer);
        highlightTimer = setTimeout(() => this.activeHighlight.set(null), 4000);
      },
    });
  }

  typeLabel(label: VintedShippingLabel): string {
    return vintedShippingLabelTypeLabel(label);
  }

  refresh(): void {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (workspaceId && this.store.canManage()) void this.labels.load({ workspaceId });
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
