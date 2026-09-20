import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LucideListPlus,
  LucidePencil,
  LucidePlay,
  LucideRotateCcw,
  LucideSquareX,
} from '@lucide/angular';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ListingExtensionHelpComponent } from '../../components/listing-extension-help/listing-extension-help.component';
import type { ListingFilter, ListingRow } from '../../models/listing.models';
import {
  canPrepareListing,
  listingStatusLabel,
  listingStatusTone,
} from '../../models/listing.rules';
import { ListingExtensionService } from '../../services/listing-extension.service';
import { ListingService } from '../../services/listing.service';

@Component({
  selector: 'app-listing-overview',
  imports: [
    BadgeComponent,
    ButtonComponent,
    CurrencyPipe,
    DataTableComponent,
    DatePipe,
    ListingExtensionHelpComponent,
    PageHeaderComponent,
    ProductThumbnailComponent,
    RouterLink,
  ],
  templateUrl: './listing-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingOverviewComponent {
  readonly listingService = inject(ListingService);
  readonly extension = inject(ListingExtensionService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly router = inject(Router);

  readonly filter = signal<ListingFilter>('open');
  readonly search = signal('');
  readonly actionListingId = signal<string | null>(null);
  readonly confirmAction = signal<{
    readonly kind: 'end' | 'relist';
    readonly row: ListingRow;
  } | null>(null);
  readonly helpOpen = signal(false);
  readonly addIcon = LucideListPlus;
  readonly editIcon = LucidePencil;
  readonly onlineIcon = LucidePlay;
  readonly relistIcon = LucideRotateCcw;
  readonly endIcon = LucideSquareX;
  readonly filteredRows = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('de');
    return this.listingService.rows().filter((row) => {
      const matchesFilter =
        this.filter() === 'all' ||
        (this.filter() === 'open' && row.listing.status !== 'ended') ||
        row.listing.status === this.filter();
      const matchesSearch =
        !term ||
        [row.listing.content.title, row.item.title, row.item.brand ?? '']
          .join(' ')
          .toLocaleLowerCase('de')
          .includes(term);
      return matchesFilter && matchesSearch;
    });
  });

  constructor() {
    this.extension.start();
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      if (workspaceId) void this.listingService.load(workspaceId);
      else this.listingService.clear();
    });
  }

  statusLabel(row: ListingRow): string {
    return listingStatusLabel(row.listing.status);
  }
  statusTone(row: ListingRow) {
    return listingStatusTone(row.listing.status);
  }
  canRelist(row: ListingRow): boolean {
    return (
      (row.listing.status === 'online' ||
        (row.listing.status === 'ended' && row.listing.endReason === 'manual')) &&
      canPrepareListing({ status: row.item.status, archived_at: row.item.archivedAt }).allowed
    );
  }
  isSoldCleanup(row: ListingRow): boolean {
    return row.listing.status === 'ended' && row.listing.endReason === 'sold';
  }

  async setOnline(row: ListingRow): Promise<void> {
    if (!this.isCurrentRow(row)) return;
    this.actionListingId.set(row.listing.id);
    try {
      const result = await this.listingService.setOnline(row.listing.id);
      if (!this.isCurrentRow(row)) return;
      if (result.error)
        this.toast.error('Inserat konnte nicht online gesetzt werden.', result.error.message);
      else this.toast.success('Inserat ist online.', 'Der Bestandsstatus wurde aktualisiert.');
    } finally {
      if (this.isCurrentRow(row)) this.actionListingId.set(null);
    }
  }

  async end(row: ListingRow): Promise<void> {
    if (!this.isCurrentRow(row)) return;
    this.confirmAction.set({ kind: 'end', row });
    const confirmed = await this.confirmDialog.frage({
      titel: 'Inserat beenden?',
      text: 'Das Inserat wird als manuell beendet markiert. Der Artikel wird wieder als verkaufsbereit geführt.',
      bestaetigenText: 'Inserat beenden',
    });
    this.confirmAction.set(null);
    if (!confirmed || !this.isCurrentRow(row)) return;
    this.actionListingId.set(row.listing.id);
    try {
      const result = await this.listingService.end(row.listing.id);
      if (!this.isCurrentRow(row)) return;
      if (result.error)
        this.toast.error('Inserat konnte nicht beendet werden.', result.error.message);
      else this.toast.success('Inserat beendet.');
    } finally {
      if (this.isCurrentRow(row)) this.actionListingId.set(null);
    }
  }

  async openAgain(row: ListingRow): Promise<void> {
    if (!this.isCurrentRow(row)) return;
    if (!this.extension.available()) {
      this.helpOpen.set(true);
      return;
    }
    await this.publishRow(row);
  }

  async relist(row: ListingRow): Promise<void> {
    if (!this.canRelist(row) || !this.isCurrentRow(row)) return;
    this.confirmAction.set({ kind: 'relist', row });
    const confirmed = await this.confirmDialog.frage({
      titel: 'Inserat erneut einstellen?',
      text: 'Bestätige nur, wenn das alte Inserat auf Kleinanzeigen entfernt wurde.',
      bestaetigenText: 'Erneut einstellen',
    });
    this.confirmAction.set(null);
    if (!confirmed || !this.isCurrentRow(row)) return;
    this.actionListingId.set(row.listing.id);
    try {
      const result = await this.listingService.prepare(row.item.id, row.listing.content);
      if (!this.isCurrentRow(row)) return;
      if (result.error) {
        this.toast.error('Inserat konnte nicht vorbereitet werden.', result.error.message);
        return;
      }
      const updated = this.listingService.getById(result.data?.id ?? row.listing.id);
      if (updated) await this.openAgain(updated);
    } finally {
      if (this.isCurrentRow(row)) this.actionListingId.set(null);
    }
  }

  edit(row: ListingRow): void {
    void this.router.navigate(['/listings', row.listing.id]);
  }
  async retry(): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (workspaceId) await this.listingService.load(workspaceId);
  }

  private async publishRow(row: ListingRow): Promise<void> {
    const result = await this.listingService.buildExtensionPayload(row);
    if (!this.isCurrentRow(row)) return;
    this.extension.publish(result.payload);
    if (result.missingImages.length) {
      const count = result.missingImages.length;
      this.toast.warning(
        `${count} ${count === 1 ? 'Bild konnte' : 'Bilder konnten'} nicht übertragen werden.`,
      );
    }
    this.toast.success('Übergabe an Kleinanzeigen gestartet.');
  }

  private isCurrentRow(row: ListingRow): boolean {
    return this.workspaceService.currentWorkspace()?.id === row.listing.workspaceId;
  }
}
