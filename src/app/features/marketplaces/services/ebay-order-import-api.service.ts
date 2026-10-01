import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { Database } from '../../../core/models/supabase.types';
import type { AccountScope } from '../models/marketplace.models';
import type {
  EbayArticleMapping,
  EbayOrderBookRequest,
  EbayOrderBookResponse,
  EbayOrderReview,
  EbaySaleTarget,
} from '../../../../../supabase/functions/_shared/ebay-order-import-contracts';
import {
  parseEbayArticleMapping,
  parseEbayOrderBooking,
  parseEbayOrderBookResponse,
  parseEbayOrderReview,
} from '../models/ebay-order-import-response';
import { EbayAccountApiService } from './ebay-account-api.service';

const messages: Readonly<Record<string, string>> = {
  import_unavailable: 'Die Bestellübernahme ist noch nicht verfügbar.',
  unauthorized: 'Melde dich erneut bei Flipbase an.',
  forbidden: 'Du hast keinen Zugriff auf diesen Workspace.',
  needs_login: 'Verbinde dein eBay-Konto erneut.',
  connection_changed: 'Deine Kontoverbindung wurde geändert. Lade den Status erneut.',
  connection_busy_or_unavailable: 'Deine Verbindung ist gerade beschäftigt. Versuche es erneut.',
  review_expired_or_changed:
    'Die Prüfung ist abgelaufen oder wurde geändert. Lade die Bestellung erneut.',
  provider_unavailable:
    'eBay konnte die Bestellung gerade nicht bereitstellen. Versuche es später erneut.',
  scope_missing: 'eBay hat den nötigen Lesezugriff nicht freigegeben. Verbinde dein Konto erneut.',
  invalid_response: 'Die eBay-Bestellung konnte nicht vollständig geprüft werden.',
  invalid_request: 'Prüfe die Artikelzuordnung und bestätige alle Kosten.',
};
export class EbayOrderImportRequestError extends Error {
  constructor(
    message: string,
    readonly outcomeUnknown = false,
  ) {
    super(message);
  }
}
@Injectable({ providedIn: 'root' })
export class EbayOrderImportApiService {
  private readonly client = inject(SupabaseService).client;
  private readonly accountApi = inject(EbayAccountApiService);
  private async request(
    body: Record<string, unknown>,
    acceptReviewChange = false,
  ): Promise<unknown> {
    const { data, error } = await this.client.functions.invoke('ebay-account', { body });
    if (!error) return data;
    let response: unknown;
    let code: string | null = null;
    let status: number | null = null;
    if ('context' in error && error.context instanceof Response) {
      status = error.context.status;
      try {
        response = await error.context.json();
      } catch {
        /* Gateway-Antwort ohne JSON. */
      }
    }
    if (response && typeof response === 'object') {
      if (
        acceptReviewChange &&
        status === 409 &&
        'status' in response &&
        response.status === 'review_changed'
      )
        return response;
      if ('error' in response && typeof response.error === 'string') code = response.error;
      if ('status' in response && response.status === 'recorded_elsewhere')
        throw new EbayOrderImportRequestError(
          'Diese Bestellung wurde bereits manuell erfasst. Prüfe ihren Buchungsstatus.',
        );
    }
    throw new EbayOrderImportRequestError(
      (code && messages[code]) ||
        'Die eBay-Anfrage konnte nicht bestätigt werden. Prüfe den Buchungsstatus.',
      body['action'] === 'order_book' && (!status || !code || code === 'request_failed'),
    );
  }
  async loadMappings(scope: AccountScope): Promise<readonly EbayArticleMapping[]> {
    const status = await this.accountApi.loadStatus(scope.workspaceId);
    const connection = status.connection;
    if (
      !status.importAvailable ||
      !connection ||
      connection.status !== 'connected' ||
      connection.connectionId !== scope.connectionId
    )
      throw new Error('Lade den aktuellen eBay-Verbindungsstatus erneut.');
    const { data, error } = await this.client
      .from('ebay_article_mappings')
      .select(
        'id,workspace_id,environment,listing_id,variation_id,inventory_item_id,catalog_product_id',
      )
      .eq('workspace_id', scope.workspaceId)
      .eq('environment', connection.environment);
    if (error || !data) throw new Error('Die Artikelzuordnungen konnten nicht geladen werden.');
    return data.map((row) => {
      if (row.workspace_id !== scope.workspaceId || row.environment !== connection.environment)
        throw new Error('Die Artikelzuordnung gehört zu einer anderen Verbindung.');
      return parseEbayArticleMapping({
        id: row.id,
        listingId: row.listing_id,
        variationId: row.variation_id,
        target: row.inventory_item_id
          ? { inventoryItemId: row.inventory_item_id }
          : { catalogProductId: row.catalog_product_id },
      });
    });
  }
  async saveMapping(
    scope: AccountScope,
    listingId: string,
    variationId: string | null,
    target: EbaySaleTarget,
  ): Promise<EbayArticleMapping> {
    // Der Generator stellt nullable Funktionsargumente als string dar; SQL erlaubt ausdrücklich null.
    const args = {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_listing_id: listingId,
      p_variation_id: variationId,
      p_target: { ...target },
    } as Database['public']['Functions']['ebay_set_article_mapping']['Args'];
    const { data, error } = await this.client.rpc('ebay_set_article_mapping', args);
    if (error)
      throw new Error(
        'Die Artikelzuordnung konnte nicht gespeichert werden. Prüfe deinen Artikel und die Verbindung.',
      );
    const mapping = parseEbayArticleMapping(data);
    const sameTarget =
      'inventoryItemId' in target
        ? 'inventoryItemId' in mapping.target &&
          mapping.target.inventoryItemId === target.inventoryItemId
        : 'catalogProductId' in mapping.target &&
          mapping.target.catalogProductId === target.catalogProductId;
    if (mapping.listingId !== listingId || mapping.variationId !== variationId || !sameTarget)
      throw new Error('Die Artikelzuordnung wurde nicht passend bestätigt. Lade sie erneut.');
    return mapping;
  }
  async removeMapping(scope: AccountScope, mappingId: string): Promise<void> {
    const { data, error } = await this.client.rpc('ebay_remove_article_mapping', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_mapping_id: mappingId,
    });
    if (error || typeof data !== 'boolean')
      throw new Error('Die Artikelzuordnung konnte nicht entfernt werden. Lade sie erneut.');
  }
  async prepareOrder(scope: AccountScope, orderId: string): Promise<EbayOrderReview> {
    return parseEbayOrderReview(
      await this.request({ action: 'order_review', ...scope, orderId }),
      scope,
      orderId,
    );
  }
  async bookOrder(input: EbayOrderBookRequest): Promise<EbayOrderBookResponse> {
    let result: unknown;
    try {
      result = await this.request({ action: 'order_book', ...input }, true);
    } catch (error) {
      if (error instanceof EbayOrderImportRequestError) throw error;
      throw new EbayOrderImportRequestError(
        'Die Buchungsantwort fehlt. Prüfe zuerst den Buchungsstatus.',
        true,
      );
    }
    try {
      return parseEbayOrderBookResponse(result, input, input.orderId);
    } catch {
      throw new EbayOrderImportRequestError(
        'Die Buchungsantwort ist unklar. Prüfe zuerst den Buchungsstatus.',
        true,
      );
    }
  }
  async loadOrderStatus(scope: AccountScope, orderId: string) {
    return parseEbayOrderBooking(await this.request({ action: 'order_status', ...scope, orderId }));
  }
  async markRecordedElsewhere(
    review: EbayOrderReview,
    reason: string,
    saleId: string | null = null,
  ) {
    return parseEbayOrderBooking(
      await this.request({
        action: 'order_recorded_elsewhere',
        workspaceId: review.workspaceId,
        connectionId: review.connectionId,
        orderId: review.source.orderId,
        snapshotId: review.snapshotId,
        reviewHash: review.reviewHash,
        reason,
        saleId,
        confirmed: true,
      }),
    );
  }
  async clearRecordedElsewhere(scope: AccountScope, orderId: string): Promise<void> {
    const response = await this.request({
      action: 'order_clear_recorded_elsewhere',
      ...scope,
      orderId,
      confirmed: true,
    });
    if (
      !response ||
      typeof response !== 'object' ||
      !('cleared' in response) ||
      typeof response.cleared !== 'boolean'
    )
      throw new Error('Die Rücknahme wurde nicht bestätigt. Prüfe den Buchungsstatus.');
  }
}
