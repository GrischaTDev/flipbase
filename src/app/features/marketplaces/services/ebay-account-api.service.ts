import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { AccountScope } from '../models/marketplace.models';
import {
  parseEbayAuthorization,
  parseEbayListing,
  parseEbayOrder,
  parseEbayPage,
  parseEbayStatus,
} from '../models/ebay-response';

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: 'Die eBay-Anbindung ist auf dem Server noch nicht eingerichtet.',
  unauthorized: 'Melde dich erneut bei Flipbase an.',
  forbidden: 'Du hast keinen Zugriff auf diesen Workspace.',
  needs_login:
    'Deine eBay-Freigabe ist abgelaufen oder wurde widerrufen. Verbinde dein Konto erneut.',
  scope_missing:
    'eBay hat den erforderlichen Lesezugriff nicht freigegeben. Verbinde dein Konto erneut; bleibt der Fehler bestehen, muss der Betreiber die App-Freigabe prüfen.',
  connection_busy_or_unavailable:
    'Deine Verbindung ist gerade beschäftigt oder benötigt eine neue Anmeldung. Lade den Status erneut.',
  connection_changed:
    'Die Kontoverbindung wurde während des Abrufs geändert. Lade den Status erneut.',
  provider_unavailable:
    'eBay konnte die Daten gerade nicht bereitstellen. Versuche es später erneut.',
};
@Injectable({ providedIn: 'root' })
export class EbayAccountApiService {
  private readonly client = inject(SupabaseService).client;
  private async request(body: Record<string, unknown>): Promise<unknown> {
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
      throw new Error(
        (code && ERROR_MESSAGES[code]) ||
          'Die eBay-Anbindung ist gerade nicht erreichbar. Lade den Status erneut.',
      );
    }
    return data;
  }
  async loadStatus(workspaceId: string) {
    return parseEbayStatus(await this.request({ action: 'status', workspaceId }), workspaceId);
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
}
