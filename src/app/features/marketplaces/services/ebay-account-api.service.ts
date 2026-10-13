import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { AccountScope } from '../models/marketplace.models';
import { parseEbayOrderBooking } from '../models/ebay-order-import-response';
import {
  parseEbayAuthorization,
  parseEbayListing,
  parseEbayOrder,
  parseEbayPage,
  parseEbayStatus,
  parseEbayListingDetails,
  parseEbayTrafficReport,
  parseEbayImageUpload,
  parseEbayTrafficOverview,
} from '../models/ebay-response';
import type {
  EbayListingUpdate,
  EbayTrafficDays,
} from '../../../../../supabase/functions/_shared/ebay-contracts';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_response:
    'eBay hat geantwortet, aber Flipbase konnte die Antwort nicht auswerten. Versuche den Abruf erneut.',
  not_configured: 'Die eBay-Anbindung ist auf dem Server noch nicht eingerichtet.',
  unauthorized: 'Melde dich erneut bei Flipbase an.',
  forbidden: 'Du hast keinen Zugriff auf diesen Workspace.',
  needs_login:
    'Deine eBay-Freigabe ist abgelaufen oder wurde widerrufen. Verbinde dein Konto erneut.',
  scope_missing:
    'eBay hat den erforderlichen Zugriff nicht freigegeben. Verbinde dein Konto erneut und erlaube die neuen Funktionen.',
  listing_not_owned: 'Dieses Inserat konnte deinem verbundenen eBay-Konto nicht zugeordnet werden.',
  listing_not_editable:
    'Diese Änderung ist für das Inserat nicht möglich. Variantenpreise und einige Angebotsarten müssen bei eBay bearbeitet werden.',
  listing_changed:
    'Das Inserat wurde inzwischen geändert. Lade es erneut, bevor Du deine Änderungen überträgst.',
  revision_rejected:
    'eBay hat die Änderung abgelehnt. Prüfe, ob bereits Verkäufe, Gebote oder Preisvorschläge vorliegen oder das Inserat von einer anderen Anwendung verwaltet wird.',
  save_unconfirmed:
    'Die Änderung wurde nicht eindeutig bestätigt. Prüfe das Inserat bei eBay und lade es erneut, bevor Du nochmals speicherst.',
  image_rejected: 'eBay hat dieses Bild abgelehnt. Prüfe Format, Größe und Bildabmessungen.',
  invalid_request: 'Die eBay-Anfrage enthält ungültige Angaben. Prüfe deine Eingaben.',
  connection_busy_or_unavailable:
    'Deine Verbindung ist gerade beschäftigt oder benötigt eine neue Anmeldung. Lade den Status erneut.',
  connection_changed:
    'Die Kontoverbindung wurde während des Abrufs geändert. Lade den Status erneut.',
  provider_unavailable:
    'eBay konnte die Daten gerade nicht bereitstellen. Versuche es später erneut.',
};
export class EbayAccountRequestError extends Error {
  constructor(
    readonly code: string | null,
    message: string,
  ) {
    super(message);
  }
}
@Injectable({ providedIn: 'root' })
export class EbayAccountApiService {
  private readonly client = inject(SupabaseService).client;
  private async request(body: Record<string, unknown> | FormData): Promise<unknown> {
    const { data, error } = await this.client.functions.invoke('ebay-account', { body });
    if (error) {
      let code: string | null = null;
      if ('context' in error && error.context instanceof Response) {
        try {
          const result: unknown = await error.context.json();
          if (
            result &&
            typeof result === 'object' &&
            'error' in result &&
            typeof result.error === 'string'
          )
            code = result.error;
        } catch {
          /* Eine Gateway-Antwort muss kein JSON enthalten. */
        }
      }
      throw new EbayAccountRequestError(
        code,
        (code && ERROR_MESSAGES[code]) ||
          'Die eBay-Anbindung ist gerade nicht erreichbar. Lade den Status erneut.',
      );
    }
    return data;
  }
  async loadStatus(workspaceId: string) {
    return parseEbayStatus(await this.request({ action: 'status', workspaceId }), workspaceId);
  }
  async loadOrderStatus(scope: AccountScope, orderId: string) {
    return parseEbayOrderBooking(await this.request({ action: 'order_status', ...scope, orderId }));
  }
  async connect(workspaceId: string): Promise<string> {
    return parseEbayAuthorization(await this.request({ action: 'connect', workspaceId }));
  }
  async disconnect(scope: AccountScope): Promise<void> {
    const result = await this.request({ action: 'disconnect', ...scope });
    if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true)
      throw new Error('Die Trennung wurde nicht bestätigt. Lade den Status erneut.');
  }
  async loadListings(scope: AccountScope, page = 1) {
    return parseEbayPage(
      await this.request({ action: 'listings', ...scope, page }),
      scope,
      parseEbayListing,
    );
  }
  async loadOrders(scope: AccountScope, page = 1) {
    return parseEbayPage(
      await this.request({ action: 'orders', ...scope, page }),
      scope,
      parseEbayOrder,
    );
  }
  async loadListingDetails(scope: AccountScope, listingId: string) {
    return parseEbayListingDetails(
      await this.request({ action: 'listing_detail', ...scope, listingId }),
      scope,
      listingId,
    );
  }
  async updateListing(
    scope: AccountScope,
    listingId: string,
    update: EbayListingUpdate,
  ): Promise<string | null> {
    const response = await this.request({ action: 'listing_update', ...scope, listingId, update });
    if (
      !response ||
      typeof response !== 'object' ||
      !('ok' in response) ||
      response.ok !== true ||
      !('workspaceId' in response) ||
      response.workspaceId !== scope.workspaceId ||
      !('connectionId' in response) ||
      response.connectionId !== scope.connectionId
    )
      throw new EbayAccountRequestError('save_unconfirmed', ERROR_MESSAGES['save_unconfirmed']);
    return 'warning' in response && typeof response.warning === 'string' ? response.warning : null;
  }
  async uploadListingImage(scope: AccountScope, listingId: string, image: File): Promise<string> {
    const form = new FormData();
    form.set('workspaceId', scope.workspaceId);
    form.set('connectionId', scope.connectionId);
    form.set('listingId', listingId);
    form.set('image', image);
    return parseEbayImageUpload(await this.request(form), scope);
  }
  async loadTraffic(scope: AccountScope, listingIds: readonly string[]) {
    return parseEbayTrafficReport(
      await this.request({ action: 'listing_traffic', ...scope, listingIds }),
      scope,
      listingIds,
    );
  }
  async loadTrafficOverview(scope: AccountScope, days: EbayTrafficDays) {
    return parseEbayTrafficOverview(
      await this.request({ action: 'traffic_overview', ...scope, days }),
      scope,
      days,
    );
  }
}
