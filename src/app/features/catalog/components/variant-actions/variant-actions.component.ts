import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { LucideArchive, LucideRotateCcw, LucideTrash2, LucidePackageMinus } from '@lucide/angular';
import type { CatalogProduct } from '../../../../core/models/flipbase.models';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ArticleLifecycleService } from '../../services/article-lifecycle.service';
import { ArticleMediaCleanupService } from '../../services/article-media-cleanup.service';
import {
  ArticleStockRemovalComponent,
  StockRemovalTarget,
} from '../article-stock-removal/article-stock-removal.component';

@Component({
  selector: 'app-variant-actions',
  imports: [TableActionButtonComponent, ArticleStockRemovalComponent],
  templateUrl: './variant-actions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VariantActionsComponent {
  readonly product = input.required<CatalogProduct>();
  readonly onHand = input<number | null>(null);
  readonly disabled = input(false);
  readonly changed = output<{ id: string; deleted: boolean }>();
  readonly lifecycle = inject(ArticleLifecycleService);
  private readonly confirmation = inject(ConfirmDialogService);
  private readonly cleanup = inject(ArticleMediaCleanupService);
  readonly removalTarget = signal<StockRemovalTarget | null>(null);
  readonly error = signal<string | null>(null);
  readonly archiveIcon = LucideArchive;
  readonly restoreIcon = LucideRotateCcw;
  readonly deleteIcon = LucideTrash2;
  readonly removeIcon = LucidePackageMinus;

  openRemoval(): void {
    if (this.disabled() || this.onHand() === null || this.onHand() === 0) return;
    const product = this.product();
    this.removalTarget.set({
      workspaceId: product.workspace_id,
      kind: 'catalog',
      id: product.id,
      title: [product.title, product.size, product.color].filter(Boolean).join(' · '),
      onHand: this.onHand(),
    });
  }

  async archive(): Promise<void> {
    if (this.disabled()) return;
    const product = this.product();
    const archived = !product.archived_at;
    if (
      !(await this.confirmation.frage({
        titel: archived ? 'Variante archivieren?' : 'Variante wiederherstellen?',
        text: archived
          ? 'Die Variante wird aus der normalen Artikelliste ausgeblendet. Ihr Bestand und ihre Buchungen bleiben erhalten.'
          : 'Die Variante erscheint wieder in der Artikelliste.',
        bestaetigenText: archived ? 'Archivieren' : 'Wiederherstellen',
      }))
    )
      return;
    this.error.set(null);
    try {
      await this.lifecycle.setArchived(product.workspace_id, 'catalog', product.id, archived);
      this.changed.emit({ id: product.id, deleted: false });
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Archivaktion fehlgeschlagen.');
    }
  }

  async deleteUnused(): Promise<void> {
    if (this.disabled()) return;
    const product = this.product();
    if (
      !(await this.confirmation.frage({
        titel: 'Unbenutzte Variante löschen?',
        text: 'Nur diese Variante wird gelöscht. Andere Größen und Farben bleiben erhalten. Bereits verwendete Varianten kannst Du archivieren.',
        bestaetigenText: 'Variante löschen',
        gefahr: true,
      }))
    )
      return;
    this.error.set(null);
    try {
      await this.lifecycle.deleteUnused(product.workspace_id, 'catalog', product.id);
      this.changed.emit({ id: product.id, deleted: true });
      void this.cleanup.retry(product.workspace_id).catch(() => undefined);
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Variante konnte nicht gelöscht werden.',
      );
    }
  }
}
