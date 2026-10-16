import { DestroyRef, Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import type {
  KleinanzeigenDraftContent,
  KleinanzeigenSourceReference,
  KleinanzeigenTransferDraft,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-listing-contracts';
import type { MarketplaceListingReference } from '../models/marketplace-overview.models';
import { kleinanzeigenConnectionId } from '../../../../../supabase/functions/_shared/kleinanzeigen-contracts';
import {
  mapVintedToKleinanzeigen,
  type KleinanzeigenTransferPreview,
} from '../models/kleinanzeigen-transfer-mapping';
import {
  parseTransferSourceResponse,
  parseTransferDraftResponse,
  validTransferDraftContent,
} from '../models/kleinanzeigen-transfer-response';
import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';
import { VintedLocalExtensionBridge } from './vinted-local-extension-bridge';
export interface PreparedKleinanzeigenTransfer extends KleinanzeigenTransferPreview {
  readonly target: { readonly workspaceId: string; readonly connectionId: string };
  readonly sourceReference: KleinanzeigenSourceReference;
  readonly requestId: string;
}
interface PreparedOwner {
  readonly userId: string;
  readonly generation: number;
  readonly preview: PreparedKleinanzeigenTransfer;
  draft: KleinanzeigenTransferDraft | null;
}
@Injectable()
export class ListingTransferService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly client = inject(SupabaseService).client;
  private readonly browser = inject(MarketplaceBrowserTestApiService);
  private readonly extension = inject(VintedLocalExtensionBridge);
  private generation = 0;
  private readonly prepared = new Map<string, PreparedOwner>();
  constructor() {
    this.extension.checkInstallation();
    inject(DestroyRef).onDestroy(() => this.cancel());
  }
  cancel(): void {
    this.generation++;
    this.prepared.clear();
    this.extension.cancel();
  }
  private assertCurrent(userId: string, workspaceId: string, generation: number): void {
    const workspace = this.workspace.currentWorkspace();
    if (
      generation !== this.generation ||
      this.auth.currentUser()?.id !== userId ||
      workspace?.id !== workspaceId ||
      workspace.archived_at
    )
      throw new Error('Die Ansicht oder Anmeldung wurde gewechselt. Öffne den Transfer erneut.');
  }
  private async invoke(body: Readonly<Record<string, unknown>>): Promise<unknown> {
    const { data, error } = await this.client.functions.invoke('kleinanzeigen-account', { body });
    if (error)
      throw new Error(
        'Die Übertragung wurde nicht bestätigt. Prüfe Deine Anmeldung und lade den aktuellen Stand erneut.',
      );
    return data;
  }
  async prepare(
    reference: MarketplaceListingReference,
    targetConnectionId: string,
    requestId: string,
  ): Promise<PreparedKleinanzeigenTransfer> {
    const userId = this.auth.currentUser()?.id;
    const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
    if (
      !userId ||
      reference.platform !== 'vinted' ||
      !uuid.test(reference.workspaceId) ||
      !uuid.test(reference.connectionId) ||
      !uuid.test(requestId) ||
      !/^[1-9][0-9]{0,31}$/u.test(reference.externalId) ||
      !kleinanzeigenConnectionId(targetConnectionId)
    )
      throw new Error('Wähle ein eigenes Vinted-Inserat und ein Kleinanzeigen-Zielkonto.');
    const generation = ++this.generation;
    this.prepared.clear();
    this.assertCurrent(userId, reference.workspaceId, generation);
    const source: MarketplaceListingReference = {
      platform: 'vinted',
      workspaceId: reference.workspaceId,
      connectionId: reference.connectionId,
      externalId: reference.externalId,
    };
    const body = {
      action: 'prepare_transfer',
      workspaceId: source.workspaceId,
      targetConnectionId,
      source,
      requestId,
    };
    const read = async () => {
      const result = parseTransferSourceResponse(await this.invoke(body), body);
      this.assertCurrent(userId, source.workspaceId, generation);
      if (!result) throw new Error('Die Vinted-Quelle konnte nicht eindeutig geprüft werden.');
      return result;
    };
    let result = await read();
    if (result.state === 'needs_source') {
      if (result.executionMode === 'cloud') {
        const token = this.auth.session()?.access_token;
        if (!token) throw new Error('Melde Dich erneut an, um die vollständige Quelle zu lesen.');
        await this.browser.readListingContent(
          { workspaceId: source.workspaceId, connectionId: source.connectionId },
          result.entryId,
          result.externalAccountId,
          token,
        );
      } else {
        if (!this.extension.sourceDetailsAvailable())
          throw new Error(
            'Aktualisiere die Flipbase-Erweiterung für den vollständigen lokalen Quellenabruf.',
          );
        const receipt = await this.extension.request('FLIPBASE_VINTED_LOCAL_SOURCE_DETAILS', {
          workspaceId: source.workspaceId,
          connectionId: source.connectionId,
          entryId: result.entryId,
          externalId: source.externalId,
        });
        if (
          !receipt ||
          typeof receipt !== 'object' ||
          Array.isArray(receipt) ||
          Object.keys(receipt).sort().join(',') !==
            'connectionId,entryId,externalId,fingerprint,workspaceId' ||
          !('workspaceId' in receipt) ||
          receipt.workspaceId !== source.workspaceId ||
          !('connectionId' in receipt) ||
          receipt.connectionId !== source.connectionId ||
          !('entryId' in receipt) ||
          receipt.entryId !== result.entryId ||
          !('externalId' in receipt) ||
          receipt.externalId !== source.externalId ||
          !('fingerprint' in receipt) ||
          typeof receipt.fingerprint !== 'string' ||
          !/^[a-f0-9]{64}$/u.test(receipt.fingerprint)
        )
          throw new Error('Der lokale Quellenabruf wurde nicht eindeutig bestätigt.');
      }
      this.assertCurrent(userId, source.workspaceId, generation);
      result = await read();
    }
    if (result.state !== 'ready' || !result.source || !result.fingerprint)
      throw new Error(
        'Die vollständige Vinted-Quelle fehlt noch. Prüfe das zugehörige Konto und versuche es erneut.',
      );
    const preview: PreparedKleinanzeigenTransfer = {
      ...mapVintedToKleinanzeigen(
        { ...result.source, reference: source },
        { postalCode: null, priceType: 'FIXED', shippingType: 'pickup' },
      ),
      target: { workspaceId: source.workspaceId, connectionId: targetConnectionId },
      sourceReference: {
        ...source,
        platform: 'vinted',
        entryId: result.entryId,
        fingerprint: result.fingerprint,
      },
      requestId,
    };
    this.prepared.set(requestId, { userId, generation, preview, draft: null });
    return preview;
  }
  async save(
    preview: PreparedKleinanzeigenTransfer,
    content: KleinanzeigenDraftContent,
    expectedRevision: number | null,
  ): Promise<KleinanzeigenTransferDraft> {
    const owner = this.prepared.get(preview.requestId);
    if (!owner || owner.preview !== preview) throw new Error('Öffne die Übernahme erneut.');
    this.assertCurrent(owner.userId, preview.source.workspaceId, owner.generation);
    if (!validTransferDraftContent(content))
      throw new Error('Prüfe Titel, Beschreibung, Europreis und Versandangaben.');
    if (expectedRevision !== null && (!owner.draft || owner.draft.revision !== expectedRevision))
      throw new Error('Die Fassung wurde inzwischen geändert. Lade sie erneut.');
    const body = {
      action: 'save_transfer',
      workspaceId: preview.target.workspaceId,
      targetConnectionId: preview.target.connectionId,
      requestId: preview.requestId,
      source: preview.sourceReference,
      content,
      draftId: expectedRevision === null ? null : owner.draft!.id,
      expectedRevision,
    };
    const reply = await this.invoke(body);
    this.assertCurrent(owner.userId, preview.source.workspaceId, owner.generation);
    const draft = parseTransferDraftResponse(reply, {
      workspaceId: preview.target.workspaceId,
      targetConnectionId: preview.target.connectionId,
      source: preview.source,
      sourceReference: preview.sourceReference,
    });
    if (!draft || (body.draftId !== null && draft.id !== body.draftId))
      throw new Error('Die gespeicherte Zielfassung konnte nicht eindeutig bestätigt werden.');
    owner.draft = draft;
    return draft;
  }
}
