import { renderVintedListingPhoto } from '../../../supabase/functions/_shared/vinted-listing-photo-renderer.mts';
import type { Page } from 'playwright';
import type { VintedListingPhotoOptions } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import type { MarketplaceListingPhoto } from './marketplace-listing-photo.ts';
/** Ausschließlich eine kurzlebige Uploaddatei. Das Original wird nie zurückgeschrieben. */
export async function exportVintedListingPhoto(
  page: Page,
  photo: MarketplaceListingPhoto,
  options: VintedListingPhotoOptions,
): Promise<MarketplaceListingPhoto> {
  const encoded = await page.evaluate(renderVintedListingPhoto, {
    base64: Buffer.from(photo.bytes).toString('base64'),
    mimeType: photo.mimeType,
    resize: options.resize,
    crop: options.crops[photo.id] ?? null,
    filter: options.filter,
    border: options.border,
  });
  return {
    id: photo.id,
    fileName: photo.fileName.replace(/\.[^.]+$/, '') + '.jpg',
    mimeType: 'image/jpeg',
    bytes: new Uint8Array(Buffer.from(encoded, 'base64')),
  };
}
