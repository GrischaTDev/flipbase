import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceApiService } from './marketplace-api.service';
import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';
import {
  VintedListingDraftService,
  type VintedListingDraftCursor,
} from './vinted-listing-draft.service';
import {
  emptyVintedListingContent,
  type VintedListingContent,
} from '../models/vinted-listing-content';
import { parseVintedListingReadPriceCents } from '../models/vinted-listing-edit-form';
import type { VintedListingCurrentContent } from '../models/vinted-listing-category-fields';
import {
  vintedListingCopyFields,
  type VintedListingCopyField,
} from '../models/vinted-listing-copy';

export interface VintedListingCopyRead {
  readonly content: VintedListingContent;
  readonly fields: readonly VintedListingCopyField[];
}

export type VintedListingCopySourceKind = 'local' | 'listing' | 'provider_draft';
export interface VintedListingCopySource {
  readonly key: string;
  readonly id: string;
  readonly title: string;
  readonly kind: VintedListingCopySourceKind;
  readonly connectionId: string | null;
  readonly externalId?: string;
}
export interface VintedListingCopyCursor {
  readonly local?: VintedListingDraftCursor;
  readonly provider?: string;
}

/** Liest Auswahl und vollständige Quelldaten; erstellt und speichert keinerlei Entwürfe. */
// Zusammen mit dem Kontospeicher im Vinted-Arbeitsbereich bereitstellen.
@Injectable()
export class VintedListingCopySourceService {
  private readonly api = inject(MarketplaceApiService);
  private readonly drafts = inject(VintedListingDraftService);
  private readonly browser = inject(MarketplaceBrowserTestApiService);
  private readonly store = inject(MarketplaceAccountStore);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private scope(workspaceId: string): string {
    const user = this.auth.currentUser(),
      workspace = this.workspace.currentWorkspace();
    if (
      !user ||
      !workspace ||
      workspace.id !== workspaceId ||
      workspace.archived_at ||
      !this.store.canManage()
    )
      throw new Error('Der Arbeitsbereich ist nicht mehr verfügbar.');
    return JSON.stringify([user.id, workspace.id]);
  }
  async list(
    workspaceId: string,
    kind: VintedListingCopySourceKind,
    connectionId: string | null,
    query: string,
    cursor?: VintedListingCopyCursor,
  ): Promise<{
    items: readonly VintedListingCopySource[];
    nextCursor: VintedListingCopyCursor | null;
  }> {
    const scope = this.scope(workspaceId);
    if (kind === 'local') {
      const page = await this.drafts.list(workspaceId, query, cursor?.local);
      if (this.scope(workspaceId) !== scope)
        throw new Error('Der Arbeitsbereich hat sich geändert.');
      return {
        items: page.items.map((draft) => ({
          key: 'local:' + draft.id,
          id: draft.id,
          title: draft.content.title || 'Unbenannter Entwurf',
          kind,
          connectionId: draft.connectionId,
        })),
        nextCursor: page.nextCursor ? { local: page.nextCursor } : null,
      };
    }
    if (!this.store.connections().some((account) => account.connectionId === connectionId))
      throw new Error('Wähle ein Vinted-Konto.');
    const page = await this.api.readOverviewPublications(
      { workspaceId, connectionId: connectionId! },
      {
        state: kind === 'provider_draft' ? 'draft' : 'all',
        search: query,
        limit: 25,
        ...(cursor?.provider ? { cursor: cursor.provider } : {}),
      },
    );
    if (this.scope(workspaceId) !== scope) throw new Error('Der Arbeitsbereich hat sich geändert.');
    return {
      items: page.items.flatMap((item) =>
        item.detailLink?.at(-1)
          ? [
              {
                key: kind + ':' + connectionId + ':' + item.reference.externalId,
                id: item.detailLink.at(-1)!,
                title: item.title,
                kind,
                connectionId,
                externalId: item.reference.externalId,
              },
            ]
          : [],
      ),
      nextCursor: page.nextCursor ? { provider: page.nextCursor } : null,
    };
  }
  async read(workspaceId: string, source: VintedListingCopySource): Promise<VintedListingCopyRead> {
    const scope = this.scope(workspaceId);
    let content: VintedListingContent | null = null;
    let fields: readonly VintedListingCopyField[] = vintedListingCopyFields.map(
      (field) => field.key,
    );
    if (source.kind === 'local') content = (await this.drafts.load(workspaceId, source.id)).content;
    else {
      const account = this.store
        .connections()
        .find((account) => account.connectionId === source.connectionId);
      const token = this.auth.session()?.access_token;
      if (
        !account ||
        account.executionMode !== 'cloud' ||
        account.status !== 'connected' ||
        !account.externalAccountId ||
        !token
      )
        throw new Error('Verbinde das Vinted-Konto, um seine vollständigen Angaben zu lesen.');
      const binding = JSON.stringify([
        account.externalAccountId,
        account.executionMode,
        account.status,
      ]);
      let listing: VintedListingCurrentContent | undefined;
      try {
        listing = await this.browser.readListingContent(
          { workspaceId, connectionId: account.connectionId },
          source.id,
          account.externalAccountId,
          token,
        );
      } catch (error) {
        if (source.kind !== 'provider_draft') throw error;
        if (
          this.scope(workspaceId) !== scope ||
          this.store.connections().find((current) => current.connectionId === account.connectionId)
            ?.externalAccountId !== account.externalAccountId
        )
          throw error;
        // Unvollständige Anbieterentwürfe haben noch keine vollständig lesbare Merkmalsmaske.
        const basic = await this.browser.readListingEdit(
          { workspaceId, connectionId: account.connectionId },
          source.id,
          token,
        );
        fields = ['title', 'description', 'price'];
        content = {
          ...emptyVintedListingContent(),
          title: basic.title,
          description: basic.description,
          priceCents: parseVintedListingReadPriceCents(basic.price),
        };
      }
      const currentAccount = this.store
        .connections()
        .find((current) => current.connectionId === source.connectionId);
      if (
        !currentAccount ||
        JSON.stringify([
          currentAccount.externalAccountId,
          currentAccount.executionMode,
          currentAccount.status,
        ]) !== binding
      )
        throw new Error('Das Vinted-Konto der Quelle hat sich geändert. Wähle die Quelle erneut.');
      if (listing && listing.externalId !== source.externalId)
        throw new Error('Die Artikelzuordnung hat sich geändert.');
      if (listing) content = listing.content;
    }
    if (this.scope(workspaceId) !== scope) throw new Error('Der Arbeitsbereich hat sich geändert.');
    if (!content) throw new Error('Die Quelle liefert keine lesbaren Angaben.');
    return { content, fields };
  }
}
