import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  listingResponse,
  parseVintedListingDraft,
  type VintedListingDraft,
} from '../models/vinted-listing-draft';
import type { MarketplaceEntry } from '../models/marketplace-read.models';
import { VintedListingImageService } from './vinted-listing-image.service';
import type { ListingImageDraft } from '../../../shared/components/listing-image-editor/listing-image-draft';
interface PhotoScope {
  readonly workspaceId: string;
  readonly connectionId: string;
}
@Injectable({ providedIn: 'root' })
export class VintedListingOriginalPhotoService {
  private readonly client = inject(SupabaseService).client;
  private readonly images = inject(VintedListingImageService);
  private async sources(
    scope: PhotoScope,
    externalIds: readonly string[],
  ): Promise<ReadonlyMap<string, VintedListingDraft>> {
    const unique = [...new Set(externalIds)];
    if (unique.length > 50) {
      const groups = [];
      for (let index = 0; index < unique.length; index += 50)
        groups.push(this.sources(scope, unique.slice(index, index + 50)));
      return new Map((await Promise.all(groups)).flatMap((group) => [...group]));
    }
    if (!unique.length) return new Map();
    const result = listingResponse(
      await this.client.rpc('marketplace_read_listing_photo_sources', {
        p_workspace_id: scope.workspaceId,
        p_connection_id: scope.connectionId,
        p_external_ids: [...new Set(externalIds)],
      }),
    );
    if (
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result) ||
      !('items' in result) ||
      !Array.isArray(result.items)
    )
      throw new Error('Die Originalfotos konnten nicht geladen werden.');
    const sources = new Map<string, VintedListingDraft>();
    for (const row of result.items) {
      if (
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        typeof row.externalId !== 'string' ||
        !externalIds.includes(row.externalId) ||
        sources.has(row.externalId)
      )
        throw new Error('Die Originalfotos konnten nicht sicher zugeordnet werden.');
      const draft = parseVintedListingDraft(row.draft, scope.workspaceId);
      if (
        draft.connectionId !== scope.connectionId ||
        !draft.images.length ||
        draft.images.length > 20
      )
        throw new Error('Die Originalfotos gehören nicht zum gewählten Konto.');
      sources.set(row.externalId, draft);
    }
    return sources;
  }
  async read(scope: PhotoScope, externalId: string): Promise<readonly ListingImageDraft[] | null> {
    const source = (await this.sources(scope, [externalId])).get(externalId);
    return source ? this.images.previews(source) : null;
  }
  async entries(
    scope: PhotoScope,
    entries: readonly MarketplaceEntry[],
  ): Promise<readonly MarketplaceEntry[]> {
    const ids = entries.flatMap((entry) =>
      entry.externalId && /^[1-9][0-9]{0,31}$/.test(entry.externalId) ? [entry.externalId] : [],
    );
    if (!ids.length) return entries;
    const sources = await this.sources(scope, ids);
    const paths = [
      ...new Set(
        [...sources.values()].flatMap((draft) => draft.images.map((image) => image.storagePath)),
      ),
    ];
    const urls = new Map<string, string>();
    for (let index = 0; index < paths.length; index += 100) {
      const result = await this.client.storage
        .from('marketplace-listing-media')
        .createSignedUrls(paths.slice(index, index + 100), 3600);
      if (result.error) throw new Error('Die Originalfotos konnten nicht geladen werden.');
      for (const image of result.data ?? [])
        if (!image.error && image.signedUrl) urls.set(image.path!, image.signedUrl);
    }
    return entries.map((entry) => {
      const draft = entry.externalId ? sources.get(entry.externalId) : null;
      if (!draft) return entry;
      const imageUrls = draft.images.map((image) => {
        const url = urls.get(image.storagePath);
        if (!url) throw new Error('Ein Originalfoto konnte nicht geladen werden.');
        return url;
      });
      return { ...entry, imageUrl: imageUrls[0] ?? null, imageUrls };
    });
  }
}
