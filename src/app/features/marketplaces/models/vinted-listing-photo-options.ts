import type { ImageCrop } from '../../../core/models/image-crop';
import type {
  VintedListingPhotoFilter,
  VintedListingPhotoBorder,
} from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';
export type { VintedListingPhotoFilter, VintedListingPhotoBorder };
export interface VintedListingPhotoOptions {
  readonly filter?: VintedListingPhotoFilter;
  readonly border?: VintedListingPhotoBorder;
  readonly resize: number | null;
  readonly crops: Readonly<Record<string, ImageCrop>>;
}
export function emptyVintedListingPhotoOptions(): VintedListingPhotoOptions {
  return { resize: null, crops: {} };
}
export function parseVintedListingPhotoOptions(
  value: unknown,
  imageIds: readonly string[],
): VintedListingPhotoOptions {
  if (value == null) return emptyVintedListingPhotoOptions();
  const fail = (): never => {
    throw new Error('Die Bildbearbeitung konnte nicht sicher zugeordnet werden.');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const options = value as Record<string, unknown>;
  if (
    Object.keys(options).some((key) => !['resize', 'crops', 'filter', 'border'].includes(key)) ||
    !Object.hasOwn(options, 'resize') ||
    (Object.hasOwn(options, 'filter') &&
      !['none', 'lighter', 'darker', 'soft'].includes(options['filter'] as string)) ||
    (Object.hasOwn(options, 'border') &&
      !['none', 'small', 'medium', 'large'].includes(options['border'] as string)) ||
    (options['resize'] !== null && ![1200, 1600, 2400].includes(options['resize'] as number)) ||
    !options['crops'] ||
    typeof options['crops'] !== 'object' ||
    Array.isArray(options['crops'])
  )
    return fail();
  const crops: Record<string, ImageCrop> = {};
  for (const [id, raw] of Object.entries(options['crops'])) {
    if (!imageIds.includes(id) || !raw || typeof raw !== 'object' || Array.isArray(raw))
      return fail();
    const crop = raw as Record<string, unknown>;
    if (
      Object.keys(crop).length !== 5 ||
      !['x', 'y', 'width', 'height'].every(
        (key) => typeof crop[key] === 'number' && Number.isFinite(crop[key]),
      ) ||
      ![0, 90, 180, 270].includes(crop['rotation'] as number)
    )
      return fail();
    const { x, y, width, height } = crop as unknown as ImageCrop;
    if (
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > 1.000000001 ||
      y + height > 1.000000001
    )
      return fail();
    crops[id] = { x, y, width, height, rotation: crop['rotation'] as ImageCrop['rotation'] };
  }
  return {
    resize: options['resize'] as number | null,
    crops,
    ...(Object.hasOwn(options, 'filter')
      ? { filter: options['filter'] as VintedListingPhotoFilter }
      : {}),
    ...(Object.hasOwn(options, 'border')
      ? { border: options['border'] as VintedListingPhotoBorder }
      : {}),
  };
}
