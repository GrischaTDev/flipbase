import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { AccountScope } from '../models/marketplace.models';
import { parseMarketplacePage } from '../models/marketplace-response';
import {
  emptyVintedListingContent,
  parseVintedListingContent,
  type VintedListingContent,
} from '../models/vinted-listing-content';
import { vintedListingSourceContent, vintedSaleItemIds } from '../models/vinted-listing-source';
import {
  isVintedTransferPhotoUrl,
  parseVintedTransferSource,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-listing-validation.mjs';
import { VintedListingImageService } from './vinted-listing-image.service';
import { VintedListingOriginalPhotoService } from './vinted-listing-original-photo.service';
import { VintedListingPhotoSourceService } from './vinted-listing-photo-source.service';

interface VintedSoldItemCopy {
  readonly content: VintedListingContent;
  readonly files: readonly File[];
  readonly photoError?: string;
}

@Injectable({ providedIn: 'root' })
export class VintedSoldItemCopyService {
  private readonly client = inject(SupabaseService).client;
  private readonly originals = inject(VintedListingOriginalPhotoService);
  private readonly images = inject(VintedListingImageService);
  private readonly photos = inject(VintedListingPhotoSourceService);

  async read(scope: AccountScope, saleId: string, itemId: string): Promise<VintedSoldItemCopy> {
    const { data: sale, error: saleError } = await this.client
      .from('marketplace_account_entries')
      .select('id,body')
      .eq('workspace_id', scope.workspaceId)
      .eq('connection_id', scope.connectionId)
      .eq('kind', 'sale')
      .eq('id', saleId)
      .maybeSingle();
    if (
      saleError ||
      !sale ||
      !sale.body ||
      typeof sale.body !== 'object' ||
      Array.isArray(sale.body)
    )
      throw new Error('Der Verkauf konnte nicht geladen werden.');
    const entry = parseMarketplacePage(
      { items: [{ ...sale.body, id: sale.id, ...scope }], total: 1, nextCursor: null },
      scope,
    ).items[0];
    if (!vintedSaleItemIds(entry).includes(itemId) || entry.saleState === 'relisted')
      throw new Error('Der Artikel gehört nicht zu diesem Verkauf.');
    if (entry.currency !== 'EUR')
      throw new Error('Die Währung dieses Verkaufs wird nicht unterstützt.');

    const [source, publication] = await Promise.all([
      this.originals.readSource(scope, itemId),
      this.client
        .from('marketplace_account_entries')
        .select('id,body')
        .eq('workspace_id', scope.workspaceId)
        .eq('connection_id', scope.connectionId)
        .eq('kind', 'publication')
        .eq('external_id', itemId)
        .maybeSingle(),
    ]);
    if (publication.error)
      throw new Error('Die gespeicherten Artikelangaben konnten nicht geladen werden.');
    const body = publication.data?.body;
    const storedContent =
      body && typeof body === 'object' && !Array.isArray(body) ? body['listingContent'] : null;
    const transferSource =
      body && typeof body === 'object' && !Array.isArray(body)
        ? parseVintedTransferSource(
            body['transferSource'],
            String(sale.body['sellerId'] ?? ''),
            itemId,
          )
        : null;
    const singleItem =
      !entry.isBundle && entry.itemCount === 1 && vintedSaleItemIds(entry).length === 1;
    const publicationEntry =
      body && typeof body === 'object' && !Array.isArray(body) && publication.data
        ? parseMarketplacePage(
            { items: [{ ...body, id: publication.data.id, ...scope }], total: 1, nextCursor: null },
            scope,
          ).items[0]
        : null;
    const savedContent = storedContent ?? source?.content;
    if (publicationEntry && publicationEntry.currency !== 'EUR')
      throw new Error('Die Währung dieses Inserats wird nicht unterstützt.');
    const content =
      savedContent != null
        ? parseVintedListingContent(savedContent)
        : publicationEntry
          ? vintedListingSourceContent(
              publicationEntry,
              publicationEntry.text ?? transferSource?.description ?? null,
            )
          : singleItem
            ? vintedListingSourceContent({ ...entry, status: null })
            : emptyVintedListingContent();
    try {
      // Ein vorhandenes Originalarchiv wird niemals durch Anbieterdateien ersetzt.
      if (source) {
        const files = await Promise.all(
          source.images.map((image) => this.images.renamedFile(source, image.id, image.fileName)),
        );
        return { content, files };
      }
      const photoEntry = publicationEntry ?? (singleItem ? entry : null);
      if (!photoEntry)
        throw new Error('Für diesen Artikel sind keine zugeordneten Fotos verfügbar.');
      const urls = [
        ...new Set(
          transferSource?.photoReferences.length
            ? transferSource.photoReferences
            : photoEntry.imageUrls?.length
              ? photoEntry.imageUrls
              : photoEntry.imageUrl
                ? [photoEntry.imageUrl]
                : [],
        ),
      ];
      if (!urls.length || urls.length > 20 || urls.some((url) => !isVintedTransferPhotoUrl(url)))
        throw new Error('Für diesen Artikel sind keine zugeordneten Fotos verfügbar.');
      const files = await Promise.all(
        urls.map(async (url, index) => {
          const blob = await this.photos.read(url, {
            ...scope,
            entryId: photoEntry.id,
            ...(!publicationEntry ? { saleItemId: itemId } : {}),
          });
          const extension =
            blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/png' ? 'png' : 'webp';
          return new File([blob], `vinted-${itemId}-${index + 1}.${extension}`, {
            type: blob.type,
          });
        }),
      );
      return { content, files };
    } catch (error) {
      return {
        content,
        files: [],
        photoError:
          error instanceof Error
            ? error.message + ' Ergänze die Fotos im Editor.'
            : 'Die Fotos konnten nicht geladen werden. Füge die Fotos hinzu.',
      };
    }
  }
}
