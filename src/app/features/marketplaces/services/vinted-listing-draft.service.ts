import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { Json } from '../../../core/models/supabase.types';
import type { VintedListingContent } from '../models/vinted-listing-content';
import {
  listingResponse,
  parseVintedListingDraft,
  listingIdentifier,
  type VintedListingDraft,
} from '../models/vinted-listing-draft';

export interface VintedListingDraftCursor {
  readonly id: string;
  readonly updatedAt: string;
}
export interface VintedListingDraftPage {
  readonly items: readonly VintedListingDraft[];
  readonly nextCursor: VintedListingDraftCursor | null;
}

@Injectable({ providedIn: 'root' })
export class VintedListingDraftService {
  private readonly client = inject(SupabaseService).client;
  async list(
    workspaceId: string,
    query = '',
    cursor?: VintedListingDraftCursor,
  ): Promise<VintedListingDraftPage> {
    const result = listingResponse(
      await this.client.rpc('marketplace_list_listing_drafts', {
        p_workspace_id: workspaceId,
        p_query: query,
        ...(cursor ? { p_cursor: JSON.parse(JSON.stringify(cursor)) as Json } : {}),
      }),
    );
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new Error('Die Entwurfsübersicht konnte nicht gelesen werden.');
    const page = result as Record<string, unknown>;
    if (!Array.isArray(page['items']))
      throw new Error('Die Entwurfsübersicht konnte nicht gelesen werden.');
    let nextCursor: VintedListingDraftCursor | null = null;
    if (page['nextCursor'] !== null) {
      const candidate = page['nextCursor'];
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
        throw new Error('Der Seitenzeiger ist ungültig.');
      const value = candidate as Record<string, unknown>;
      const updatedAt = value['updatedAt'];
      if (typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt)))
        throw new Error('Der Seitenzeiger ist ungültig.');
      nextCursor = { id: listingIdentifier(value['id']), updatedAt };
    }
    return {
      items: page['items'].map((value) => parseVintedListingDraft(value, workspaceId)),
      nextCursor,
    };
  }
  async load(workspaceId: string, id: string): Promise<VintedListingDraft> {
    return parseVintedListingDraft(
      listingResponse(await this.client.rpc('marketplace_read_listing_draft', { p_id: id })),
      workspaceId,
      id,
    );
  }
  async create(
    workspaceId: string,
    content: VintedListingContent,
    connectionId: string | null,
    requestId: string,
    inventoryItemId?: string,
  ): Promise<VintedListingDraft> {
    return parseVintedListingDraft(
      listingResponse(
        await this.client.rpc('marketplace_create_listing_draft', {
          // Der Typengenerator markiert nullable RPC-Parameter als nicht-null; die API benötigt explizites null.
          p_workspace_id: workspaceId,
          p_connection_id: connectionId!,
          p_content: JSON.parse(JSON.stringify(content)) as Json,
          p_request_id: requestId,
          ...(inventoryItemId ? { p_inventory_item_id: inventoryItemId } : {}),
        }),
      ),
      workspaceId,
    );
  }
  async save(
    draft: VintedListingDraft,
    content: VintedListingContent,
    connectionId: string | null,
  ): Promise<VintedListingDraft> {
    return parseVintedListingDraft(
      listingResponse(
        await this.client.rpc('marketplace_save_listing_draft', {
          p_id: draft.id,
          p_expected_revision: draft.revision,
          p_content: JSON.parse(JSON.stringify(content)) as Json,
          p_connection_id: connectionId!,
        }),
      ),
      draft.workspaceId,
      draft.id,
    );
  }
}
