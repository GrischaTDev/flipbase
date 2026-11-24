import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { LucidePencil, LucideTrash2 } from '@lucide/angular';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { isVintedSaleDraftCancelled, type SaleDraft } from '../../models/sale-draft.models';
import { SaleDraftService } from '../../services/sale-draft.service';
import { EbaySaleActivityStore } from '../../services/ebay-sale-activity.store';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { MarketplacePlatformIdentityComponent } from '../../../../shared/components/marketplace-platform-identity/marketplace-platform-identity.component';

/** Offene Verkaufsentwürfe in der Verkaufsübersicht; sie zählen noch nicht als Verkauf. */
@Component({
  selector: 'app-sale-draft-list',
  imports: [
    CurrencyPipe,
    DatePipe,
    CardComponent,
    DataTableComponent,
    TableActionButtonComponent,
    ProductThumbnailComponent,
    MarketplacePlatformIdentityComponent,
  ],
  templateUrl: './sale-draft-list.component.html',
  host: { class: 'block empty:hidden' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleDraftListComponent {
  readonly drafts = inject(SaleDraftService);
  readonly ebay = inject(EbaySaleActivityStore);
  private readonly workspace = inject(WorkspaceService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  readonly deletingId = signal<string | null>(null);
  readonly editIcon = LucidePencil;
  readonly deleteIcon = LucideTrash2;

  readonly entries = computed(() =>
    [
      ...this.visibleDrafts().map((draft) => ({
        id: 'sale:' + draft.id,
        title: draft.title,
        platform: draft.vintedSource ? 'vinted' : null,
        note: isVintedSaleDraftCancelled(draft.vintedSource) ? 'Storniert' : null,
        imageUrl: null,
        updatedAt: draft.updatedAt,
        amount: this.draftAmount(draft),
        currency: 'EUR',
        link: '/sales/new',
        queryParams: { draft: draft.id },
        removableDraft: draft,
      })),
      ...this.ebay.drafts().map((draft) => ({
        id: 'ebay:' + draft.id,
        title: draft.source.lines[0]?.title ?? 'eBay-Bestellung',
        platform: 'ebay',
        note: draft.sourceIssues?.length ? 'Storno oder Erstattung' : null,
        imageUrl: draft.source.lines[0]?.imageUrl ?? null,
        updatedAt: draft.updatedAt,
        amount: draft.source.totalCents === null ? null : draft.source.totalCents / 100,
        currency: draft.source.currency,
        link: this.ebay.reviewLink(draft.orderId),
        queryParams: { from: 'sales' },
        removableDraft: null,
      })),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  );

  constructor() {
    effect(() => {
      const workspaceId = this.workspace.currentWorkspace()?.id;
      if (workspaceId) untracked(() => void this.drafts.load(workspaceId));
    });
  }

  visibleDrafts(): readonly SaleDraft[] {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    return this.drafts.loadedWorkspaceId() === workspaceId ? this.drafts.drafts() : [];
  }

  draftAmount(draft: SaleDraft): number | null {
    if (draft.vintedSource && draft.snapshot.lines.some((line) => line.unitSalePrice === null)) {
      return draft.vintedSource.currency === 'EUR' ? draft.vintedSource.amount : null;
    }
    return draft.saleAmount;
  }

  async remove(draft: SaleDraft): Promise<void> {
    if (
      !(await this.dialog.frage({
        titel: 'Entwurf löschen?',
        text: `„${draft.title}“ wird endgültig gelöscht.`,
        bestaetigenText: 'Löschen',
        gefahr: true,
      }))
    )
      return;
    this.deletingId.set(draft.id);
    try {
      await this.drafts.remove(draft.workspaceId, draft.id);
      this.toast.success('Entwurf wurde gelöscht.');
    } catch (cause: unknown) {
      this.toast.error(
        'Entwurf konnte nicht gelöscht werden.',
        cause instanceof Error ? cause.message : undefined,
      );
    } finally {
      this.deletingId.set(null);
    }
  }
}
