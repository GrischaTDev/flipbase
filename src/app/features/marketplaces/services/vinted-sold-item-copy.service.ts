import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';
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
  readonly needsCurrent?: boolean;
  readonly hasOriginals?: boolean;
}

@Injectable({ providedIn: 'root' })
export class VintedSoldItemCopyService {
  private readonly browser = inject(MarketplaceBrowserTestApiService);
  private readonly client = inject(SupabaseService).client;
  private readonly originals = inject(VintedListingOriginalPhotoService);
  private readonly images = inject(VintedListingImageService);
  private readonly photos = inject(VintedListingPhotoSourceService);

  async refresh(
    scope: AccountScope,
    saleId: string,
    itemId: string,
    accountId: string,
    token: string,
    saved: VintedSoldItemCopy,
  ): Promise<VintedSoldItemCopy> {
    const { source, actionId } = await this.browser.readSoldListingSource(
      scope,
      saleId,
      itemId,
      accountId,
      token,
    );
    const hints = source.attributeHints;
    const id = (key: string) =>
      hints[key] && /^[1-9][0-9]{0,9}$/.test(hints[key]) ? Number(hints[key]) : null;
    const content = parseVintedListingContent({
      ...saved.content,
      title: source.title,
      description: source.description,
      priceCents: source.priceCents,
      categoryId: id('category_id'),
      categoryLabel: hints['category'] ?? '',
      brandId: id('brand_id'),
      brandLabel: hints['brand'] ?? '',
      sizeId: id('size_id'),
      sizeLabel: hints['size'] ?? '',
      conditionId: id('status_id'),
      conditionLabel: hints['status'] ?? '',
      packageSizeId: saved.content.packageSizeId ?? id('package_size_id'),
      colorIds: [],
      colorLabels: (hints['color'] ?? '')
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
      materialIds: [],
      materialLabels: (hints['material'] ?? '')
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
    });
    if (!content.categoryId || !content.description.trim() || !source.photoReferences.length)
      throw new Error('Vinted hat den Verkaufsartikel nicht vollständig geliefert.');
    const files = saved.hasOriginals
      ? saved.files
      : await Promise.all(
          source.photoReferences.map(async (url, index) => {
            const blob = await this.photos.read(url, {
              ...scope,
              entryId: saleId,
              saleItemId: itemId,
              sourceActionId: actionId,
            });
            const extension =
              blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/png' ? 'png' : 'webp';
            return new File([blob], `vinted-${itemId}-${index + 1}.${extension}`, {
              type: blob.type,
            });
          }),
        );
    return {
      content,
      files,
      hasOriginals: saved.hasOriginals,
      ...(saved.hasOriginals && saved.photoError ? { photoError: saved.photoError } : {}),
    };
  }

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
        return {
          content,
          files,
          hasOriginals: true,
          needsCurrent: !content.description.trim() || content.categoryId === null,
        };
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
      return { content, files, needsCurrent: true };
    } catch (error) {
      return {
        content,
        files: [],
        needsCurrent: true,
        hasOriginals: !!source,
        photoError:
          error instanceof Error
            ? error.message + ' Ergänze die Fotos im Editor.'
            : 'Die Fotos konnten nicht geladen werden. Füge die Fotos hinzu.',
      };
    }
  }
}
