import { Injectable, computed, inject, signal } from '@angular/core';
import type { AccountScope } from '../../marketplaces/models/marketplace.models';
import {
  EbayOrderImportApiService,
  EbayOrderImportRequestError,
} from '../../marketplaces/services/ebay-order-import-api.service';
import type {
  EbayOrderBooking,
  EbayOrderReview,
  EbaySaleTarget,
} from '../../../../../supabase/functions/_shared/ebay-order-import-contracts';
import { InventoryService } from '../../../core/services/inventory.service';
import { StockService } from '../../../core/services/stock.service';
import { SalesService } from '../../../core/services/sales.service';
import type { RecordSaleInput } from '../../../core/services/sales.service';
import type { SaleTarget } from '../../../core/models/sale-target.models';
import type { ExternalSaleEntrySaveResult } from '../models/external-sale-entry.models';
import { buildEbayOrderBookRequest, buildEbaySaleEntryDraft } from '../utils/ebay-sale-entry';

@Injectable()
export class EbaySaleReviewStore {
  private readonly api = inject(EbayOrderImportApiService);
  private readonly sales = inject(SalesService);
  private readonly stock = inject(StockService);
  private readonly inventory = inject(InventoryService);
  private scope: AccountScope | null = null;
  private orderId: string | null = null;
  private revision = 0;
  readonly review = signal<EbayOrderReview | null>(null);
  readonly loading = signal(false);
  readonly booking = signal<EbayOrderBooking>({ status: 'unrecorded', saleId: null });
  readonly error = signal<string | null>(null);
  readonly outcomeUnknown = signal(false);
  readonly reviewChanged = signal(false);
  readonly draft = computed(() => {
    const review = this.review();
    return review
      ? buildEbaySaleEntryDraft(review, (target, title) => this.resolveTarget(target, title))
      : null;
  });
  clear(): void {
    this.revision++;
    this.scope = null;
    this.orderId = null;
    this.review.set(null);
    this.loading.set(false);
    this.error.set(null);
    this.outcomeUnknown.set(false);
    this.reviewChanged.set(false);
    this.booking.set({ status: 'unrecorded', saleId: null });
  }
  private resolveTarget(target: EbaySaleTarget, title: string): SaleTarget {
    if ('inventoryItemId' in target)
      return {
        kind: 'inventory_item',
        inventoryItemId: target.inventoryItemId,
        title:
          this.inventory.items().find((item) => item.id === target.inventoryItemId)?.title ?? title,
      };
    const position = this.stock
      .positions()
      .find((item) => item.catalog_product_id === target.catalogProductId);
    return {
      kind: 'catalog_product',
      catalogProductId: target.catalogProductId,
      title: position?.title ?? title,
      availableQuantity: position?.available_quantity ?? 0,
    };
  }
  private applyReview(review: EbayOrderReview): void {
    if (
      review.workspaceId !== this.scope?.workspaceId ||
      review.connectionId !== this.scope.connectionId ||
      review.source.orderId !== this.orderId
    )
      throw new Error('Die Bestellung gehört zu einem anderen Konto oder Workspace.');
    this.review.set(review);
    this.booking.set(review.booking);
  }
  async load(scope: AccountScope, orderId: string): Promise<void> {
    if (
      this.outcomeUnknown() &&
      this.scope?.workspaceId === scope.workspaceId &&
      this.scope.connectionId === scope.connectionId &&
      this.orderId === orderId
    ) {
      await this.resolveOutcome();
      return;
    }
    const compatible =
      this.scope?.workspaceId === scope.workspaceId &&
      this.scope.connectionId === scope.connectionId &&
      this.orderId === orderId;
    if (!compatible) this.clear();
    const revision = ++this.revision;
    this.scope = { ...scope };
    this.orderId = orderId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const review = await this.api.prepareOrder(scope, orderId);
      if (revision === this.revision) {
        this.applyReview(review);
        this.reviewChanged.set(false);
      }
    } catch (error) {
      if (revision === this.revision) this.error.set(this.message(error));
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
  private message(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Die Bestellprüfung konnte nicht bestätigt werden.';
  }
  private async refreshSaved(workspaceId: string, revision: number): Promise<void> {
    try {
      await this.sales.refreshAfterExternalSale(workspaceId);
    } catch {
      if (revision === this.revision)
        this.error.set(
          'Der Verkauf ist gebucht. Die Ansicht konnte nicht vollständig aktualisiert werden. Lade sie erneut.',
        );
    }
  }
  async submit(input: RecordSaleInput): Promise<ExternalSaleEntrySaveResult> {
    if (this.booking().status === 'imported') return { status: 'saved' };
    if (this.loading() || this.outcomeUnknown()) return { status: 'outcome_unknown' };
    const review = this.review();
    const draft = this.draft();
    if (!review || !draft || this.booking().status !== 'unrecorded')
      return {
        status: 'rejected',
        message: 'Prüfe zuerst den aktuellen Bestell- und Buchungsstatus.',
      };
    let request;
    try {
      request = buildEbayOrderBookRequest(review, draft, input);
    } catch (error) {
      const message = this.message(error);
      this.error.set(message);
      return { status: 'rejected', message };
    }
    const revision = this.revision;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.bookOrder(request);
      if (revision !== this.revision) return { status: 'outcome_unknown' };
      if (result.status === 'review_changed') {
        this.applyReview(result.review);
        this.reviewChanged.set(true);
        return { status: 'review_changed' };
      }
      this.booking.set(result);
      this.outcomeUnknown.set(false);
      await this.refreshSaved(review.workspaceId, revision);
      return { status: 'saved' };
    } catch (error) {
      if (revision !== this.revision) return { status: 'outcome_unknown' };
      const message = this.message(error);
      this.error.set(message);
      if (error instanceof EbayOrderImportRequestError && !error.outcomeUnknown)
        return { status: 'rejected', message };
      this.outcomeUnknown.set(true);
      return { status: 'outcome_unknown' };
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
  async resolveOutcome(): Promise<void> {
    const scope = this.scope;
    const orderId = this.orderId;
    if (!scope || !orderId || this.loading()) return;
    const revision = this.revision;
    this.loading.set(true);
    this.error.set(null);
    try {
      const booking = await this.api.loadOrderStatus(scope, orderId);
      if (revision !== this.revision) return;
      this.booking.set(booking);
      if (booking.status === 'unrecorded') {
        const review = await this.api.prepareOrder(scope, orderId);
        if (revision !== this.revision) return;
        this.applyReview(review);
        this.reviewChanged.set(false);
      } else if (booking.status === 'imported')
        await this.refreshSaved(scope.workspaceId, revision);
      if (revision === this.revision) this.outcomeUnknown.set(false);
    } catch (error) {
      if (revision === this.revision) this.error.set(this.message(error));
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
  async markRecordedElsewhere(reason: string, saleId: string | null = null): Promise<void> {
    const review = this.review();
    if (
      !review ||
      this.loading() ||
      this.outcomeUnknown() ||
      this.booking().status !== 'unrecorded'
    )
      return;
    if (!reason.trim() || reason.trim().length > 500) {
      this.error.set('Gib einen kurzen Grund für die manuelle Erfassung an.');
      return;
    }
    const revision = this.revision;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.markRecordedElsewhere(review, reason.trim(), saleId);
      if (revision === this.revision) this.booking.set(result);
    } catch (error) {
      if (revision === this.revision) this.error.set(this.message(error));
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
  async clearRecordedElsewhere(): Promise<void> {
    const scope = this.scope;
    const orderId = this.orderId;
    if (!scope || !orderId || this.loading() || this.booking().status !== 'recorded_elsewhere')
      return;
    const revision = this.revision;
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.api.clearRecordedElsewhere(scope, orderId);
      if (revision !== this.revision) return;
      this.booking.set({ status: 'unrecorded', saleId: null });
      const review = await this.api.prepareOrder(scope, orderId);
      if (revision === this.revision) this.applyReview(review);
    } catch (error) {
      if (revision === this.revision) this.error.set(this.message(error));
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
}
