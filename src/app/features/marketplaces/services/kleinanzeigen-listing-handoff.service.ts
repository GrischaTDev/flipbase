import { Injectable, inject } from '@angular/core';
import { ListingImagesService } from '../../listings/services/listing-images.service';
import type { KleinanzeigenTransferDraft } from '../../../../../supabase/functions/_shared/kleinanzeigen-listing-contracts';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
import type { KleinanzeigenListingJobScope } from './kleinanzeigen-listing-job.service';
import { validateKleinanzeigenHandoff } from '../models/kleinanzeigen-listing-handoff';

/** Übergibt ausschließlich die zuvor gesicherte Fassung an das gebundene Browserprofil. */
@Injectable()
export class KleinanzeigenListingHandoffService {
  private readonly images = inject(ListingImagesService);
  private readonly extension = inject(KleinanzeigenExtensionBridge);

  async open(
    scope: KleinanzeigenListingJobScope,
    draft: Pick<
      KleinanzeigenTransferDraft,
      'id' | 'workspaceId' | 'targetConnectionId' | 'content' | 'imagesComplete' | 'status'
    >,
    requestId: string,
    isCurrent: () => boolean,
    expectedPhotoCount?: number,
  ): Promise<void> {
    if (
      !isCurrent() ||
      draft.workspaceId !== scope.workspaceId ||
      draft.targetConnectionId !== scope.connectionId ||
      !draft.imagesComplete ||
      draft.status !== 'prepared'
    )
      throw new Error('Die gesicherte Fassung passt nicht mehr zum ausgewählten Konto.');
    const issues = validateKleinanzeigenHandoff(draft.content, expectedPhotoCount ?? 0);
    if (issues.length) throw new Error(issues[0].message);
    const images = await this.images.load(draft.id, null, true);
    if (!isCurrent()) return;
    if (
      (expectedPhotoCount !== undefined && images.length !== expectedPhotoCount) ||
      images.some((image) => !image.previewUrl)
    )
      throw new Error('Die Bilder konnten nicht vollständig für Kleinanzeigen geöffnet werden.');
    const content = draft.content;
    await this.extension.openListing(scope, requestId, {
      itemId: draft.id,
      title: content.title,
      description: content.description,
      price: content.priceCents / 100,
      priceType: content.priceType,
      shippingType: content.shippingType,
      postalCode: content.postalCode ?? undefined,
      categoryPath: content.categoryId,
      categoryFields: content.categoryFields,
      images: images.map((image) => ({
        key: image.storagePath ?? image.key,
        url: image.previewUrl,
        name: image.fileName,
      })),
    });
  }
}
