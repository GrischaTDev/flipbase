import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { AccountScope } from '../models/marketplace.models';
import { parseMarketplacePage } from '../models/marketplace-response';
import { parseVintedListingContent } from '../models/vinted-listing-content';
import { vintedSaleItemIds } from '../models/vinted-listing-source';
import { VintedListingImageService } from './vinted-listing-image.service';
import { VintedListingOriginalPhotoService } from './vinted-listing-original-photo.service';

@Injectable({ providedIn: 'root' })
export class VintedSoldItemCopyService {
  private readonly client = inject(SupabaseService).client;
  private readonly originals = inject(VintedListingOriginalPhotoService);
  private readonly images = inject(VintedListingImageService);

  async read(scope: AccountScope, saleId: string, itemId: string) {
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

    const [source, publication] = await Promise.all([
      this.originals.readSource(scope, itemId),
      this.client
        .from('marketplace_account_entries')
        .select('body')
        .eq('workspace_id', scope.workspaceId)
        .eq('connection_id', scope.connectionId)
        .eq('kind', 'publication')
        .eq('external_id', itemId)
        .maybeSingle(),
    ]);
    if (publication.error)
      throw new Error('Die gespeicherten Artikelangaben konnten nicht geladen werden.');
    if (!source)
      throw new Error('Für diesen Artikel sind keine Originalbilder in Flipbase gespeichert.');
    const body = publication.data?.body;
    const storedContent =
      body && typeof body === 'object' && !Array.isArray(body) ? body['listingContent'] : null;
    const content = parseVintedListingContent(storedContent ?? source.content);
    // Eigene Dateibytes statt Quellpfade: Speichern erzeugt unabhängige Bilder im neuen Entwurf.
    const files = await Promise.all(
      source.images.map((image) => this.images.renamedFile(source, image.id, image.fileName)),
    );
    return { content, files };
  }
}
