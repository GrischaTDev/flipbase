import {
  parseKleinanzeigenAccounts,
  parseKleinanzeigenPublicationPage,
  kleinanzeigenConnectionId,
  type KleinanzeigenAccounts,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-contracts';
import type {
  MarketplaceListingQuery,
  MarketplaceOverviewPage,
} from '../models/marketplace-overview.models';
import { createOverviewCursor, readOverviewCursor } from '../models/marketplace-overview-cursor';
import {
  parseKleinanzeigenSyncRun,
  type KleinanzeigenSyncRun,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-contracts';
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { parseKleinanzeigenAccountRequest } from '../../../../../supabase/functions/_shared/kleinanzeigen-contracts';
import {
  parseKleinanzeigenBinding,
  parseKleinanzeigenProposal,
  type KleinanzeigenAccountScope,
  type KleinanzeigenBinding,
  type KleinanzeigenProposal,
} from '../models/kleinanzeigen-response';
/** Nutzeraktionen mit Supabase-Sitzung; das rohe Installationssecret wird hier nie benötigt. */
@Injectable({ providedIn: 'root' })
export class KleinanzeigenAccountService {
  private readonly client = inject(SupabaseService).client;
  private async request(body: Record<string, unknown>): Promise<unknown> {
    if (!parseKleinanzeigenAccountRequest(body))
      throw new Error('Die Kleinanzeigen-Anfrage enthält ungültige Angaben.');
    const { data, error } = await this.client.functions.invoke('kleinanzeigen-account', { body });
    if (error)
      throw new Error(
        'Die Kleinanzeigen-Anfrage wurde nicht bestätigt. Prüfe Deine Anmeldung und lade die Ansicht erneut.',
      );
    return data;
  }
  async readAccounts(workspaceId: string): Promise<KleinanzeigenAccounts> {
    const result = parseKleinanzeigenAccounts(
      await this.request({ action: 'read_accounts', workspaceId }),
      workspaceId,
    );
    if (!result) throw new Error('Die Kleinanzeigen-Kontoübersicht konnte nicht geprüft werden.');
    // Widerrufene Verknüpfungen bleiben als Datenhistorie erhalten, sind aber keine aktiven Konten.
    return {
      ...result,
      accounts: result.accounts.filter((account) => account.status !== 'disconnected'),
    };
  }
  async readPage(
    scope: KleinanzeigenAccountScope,
    query: MarketplaceListingQuery,
  ): Promise<MarketplaceOverviewPage> {
    if (query.state === 'reserved')
      throw new Error('Der Reservierungsstatus ist für Kleinanzeigen noch nicht belegt.');
    const account = {
      platform: 'kleinanzeigen' as const,
      workspaceId: scope.workspaceId,
      connectionId: scope.connectionId,
    };
    const cursor = readOverviewCursor(query.cursor, account, query);
    if (
      cursor &&
      (Object.keys(cursor).sort().join(',') !== 'afterId,snapshotAt' ||
        !kleinanzeigenConnectionId(cursor['afterId']) ||
        typeof cursor['snapshotAt'] !== 'string' ||
        !Number.isFinite(Date.parse(cursor['snapshotAt'])))
    )
      throw new Error('Diese Inseratseite gehört nicht zur aktuellen Auswahl.');
    const page = parseKleinanzeigenPublicationPage(
      await this.request({
        action: 'read_publications',
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
        limit: query.limit,
        state: query.state,
        search: query.search,
        afterId: cursor?.['afterId'] ?? null,
        snapshotAt: cursor?.['snapshotAt'] ?? null,
      }),
      scope,
      query.limit,
    );
    if (!page)
      throw new Error('Die Kleinanzeigen-Inserate konnten nicht eindeutig gelesen werden.');
    return {
      items: page.items.map((item) => ({
        reference: { ...account, externalId: item.externalId },
        title: item.title,
        priceCents: item.priceCents,
        currency: item.currency,
        imageUrl: item.imageUrl,
        publishedAt: item.publishedAt,
        publishedOn: item.publishedOn,
        state: item.available ? item.state : 'ended',
        actions: ['view'],
        detailLink: null,
        externalUrl: item.url,
        editLink: null,
      })),
      total: page.total,
      completeness: page.completeness,
      nextCursor: page.nextId
        ? createOverviewCursor(account, query, {
            afterId: page.nextId,
            snapshotAt: page.snapshotAt,
          })
        : null,
    };
  }
  async connect(
    workspaceId: string,
    input: KleinanzeigenProposal,
    canPublish = false,
  ): Promise<KleinanzeigenBinding> {
    const proposal = parseKleinanzeigenProposal(input);
    if (!proposal) throw new Error('Die Kontobindung enthält ungültige Angaben.');
    const binding = parseKleinanzeigenBinding(
      await this.request({
        action: 'connect',
        workspaceId,
        externalAccountId: proposal.externalAccountId,
        displayName: proposal.displayName,
        accountType: proposal.accountType,
        installationId: proposal.installationId,
        tokenHash: proposal.tokenHash,
        canPublish,
      }),
      workspaceId,
    );
    if (
      !binding ||
      binding.externalAccountId !== proposal.externalAccountId ||
      binding.displayName !== proposal.displayName ||
      binding.accountType !== proposal.accountType ||
      binding.canPublish !== canPublish ||
      binding.status === 'disconnected'
    )
      throw new Error('Die Kontobindung konnte nicht eindeutig bestätigt werden.');
    return binding;
  }
  async requestSync(scope: KleinanzeigenAccountScope): Promise<KleinanzeigenSyncRun> {
    const result = parseKleinanzeigenSyncRun(
      await this.request({
        action: 'request_sync',
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
      }),
      scope,
    );
    if (!result)
      throw new Error('Der Kleinanzeigen-Abgleich konnte nicht eindeutig angefordert werden.');
    return result;
  }
  async disconnect(scope: KleinanzeigenAccountScope): Promise<void> {
    const result = await this.request({
      action: 'disconnect',
      workspaceId: scope.workspaceId,
      connectionId: scope.connectionId,
    });
    if (
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result) ||
      Object.keys(result).join(',') !== 'ok' ||
      !('ok' in result) ||
      result.ok !== true
    )
      throw new Error('Die Kleinanzeigen-Verbindung wurde nicht bestätigt getrennt.');
  }
}
