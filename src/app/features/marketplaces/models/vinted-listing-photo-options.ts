import type { ImageCrop } from '../../../core/models/image-crop';
import type {
  VintedListingPhotoAdjustment,
  VintedListingPhotoBackgroundCalm,
  VintedListingPhotoFilter,
  VintedListingPhotoBorder,
} from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';
export type {
  VintedListingPhotoAdjustment,
  VintedListingPhotoBackgroundCalm,
  VintedListingPhotoFilter,
  VintedListingPhotoBorder,
};

export interface VintedListingPhotoOptions {
  readonly filter?: VintedListingPhotoFilter;
  readonly border?: VintedListingPhotoBorder;
  readonly resize: number | null;
  readonly crops: Readonly<Record<string, ImageCrop>>;
  readonly adjustments?: VintedListingPhotoAdjustment;
  readonly photoAdjustments?: Readonly<Record<string, VintedListingPhotoAdjustment>>;
  readonly backgroundCalm?: Readonly<Record<string, VintedListingPhotoBackgroundCalm>>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const VALID_FILTERS: readonly VintedListingPhotoFilter[] = [
  'none',
  'lighter',
  'darker',
  'soft',
  'natural',
  'contrast',
];

const ADJUSTMENT_KEYS = [
  'exposure',
  'contrast',
  'warmth',
  'saturation',
  'sharpness',
  'denoise',
  'straighten',
  'flipX',
] as const;

export function emptyVintedListingPhotoAdjustment(): VintedListingPhotoAdjustment {
  return {
    exposure: 0,
    contrast: 0,
    warmth: 0,
    saturation: 0,
    sharpness: 0,
    denoise: 0,
    straighten: 0,
    flipX: false,
  };
}

export function isNeutralVintedListingPhotoAdjustment(
  value: VintedListingPhotoAdjustment | null | undefined,
): boolean {
  if (!value) return true;
  return (
    value.exposure === 0 &&
    value.contrast === 0 &&
    value.warmth === 0 &&
    value.saturation === 0 &&
    value.sharpness === 0 &&
    value.denoise === 0 &&
    value.straighten === 0 &&
    value.flipX === false
  );
}

export function resolveVintedListingPhotoAdjustment(
  options: VintedListingPhotoOptions,
  imageKey?: string | null,
): VintedListingPhotoAdjustment {
  if (imageKey && options.photoAdjustments?.[imageKey]) {
    return options.photoAdjustments[imageKey];
  }
  return options.adjustments ?? emptyVintedListingPhotoAdjustment();
}

export function isNeutralVintedListingPhotoOptions(
  options: VintedListingPhotoOptions,
  imageKey?: string | null,
): boolean {
  const hasCrop = imageKey ? !!options.crops[imageKey] : Object.keys(options.crops).length > 0;
  const hasBackgroundCalm = imageKey
    ? !!options.backgroundCalm?.[imageKey]
    : !!options.backgroundCalm && Object.keys(options.backgroundCalm).length > 0;
  const adjustment = resolveVintedListingPhotoAdjustment(options, imageKey);
  return (
    options.resize === null &&
    !hasCrop &&
    !hasBackgroundCalm &&
    (!options.filter || options.filter === 'none') &&
    (!options.border || options.border === 'none') &&
    isNeutralVintedListingPhotoAdjustment(adjustment)
  );
}

export function remapVintedListingPhotoOptions(
  options: VintedListingPhotoOptions,
  sourceKeys: readonly string[],
  targetIds: readonly string[],
): VintedListingPhotoOptions {
  if (!sourceKeys.length || sourceKeys.length !== targetIds.length) {
    return options;
  }
  const keyMap = new Map<string, string>();
  for (let index = 0; index < sourceKeys.length; index++) {
    keyMap.set(sourceKeys[index]!, targetIds[index]!);
  }
  const crops: Record<string, ImageCrop> = {};
  for (const [key, crop] of Object.entries(options.crops)) {
    const mapped = keyMap.get(key) ?? (targetIds.includes(key) ? key : null);
    if (mapped) crops[mapped] = crop;
  }
  const photoAdjustments: Record<string, VintedListingPhotoAdjustment> = {};
  if (options.photoAdjustments) {
    for (const [key, adj] of Object.entries(options.photoAdjustments)) {
      const mapped = keyMap.get(key) ?? (targetIds.includes(key) ? key : null);
      if (mapped && !isNeutralVintedListingPhotoAdjustment(adj)) {
        photoAdjustments[mapped] = adj;
      }
    }
  }
  const backgroundCalm: Record<string, VintedListingPhotoBackgroundCalm> = {};
  if (options.backgroundCalm) {
    for (const [key, calm] of Object.entries(options.backgroundCalm)) {
      const mapped = keyMap.get(key) ?? (targetIds.includes(key) ? key : null);
      if (mapped && calm.strength > 0) {
        backgroundCalm[mapped] = calm;
      }
    }
  }
  return {
    resize: options.resize,
    crops,
    ...(options.filter ? { filter: options.filter } : {}),
    ...(options.border ? { border: options.border } : {}),
    ...(options.adjustments && !isNeutralVintedListingPhotoAdjustment(options.adjustments)
      ? { adjustments: options.adjustments }
      : {}),
    ...(Object.keys(photoAdjustments).length ? { photoAdjustments } : {}),
    ...(Object.keys(backgroundCalm).length ? { backgroundCalm } : {}),
  };
}

export function emptyVintedListingPhotoOptions(): VintedListingPhotoOptions {
  return { resize: null, crops: {} };
}

function parsePhotoAdjustment(raw: unknown, fail: () => never): VintedListingPhotoAdjustment {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail();
  const adj = raw as Record<string, unknown>;
  if (
    Object.keys(adj).length !== ADJUSTMENT_KEYS.length ||
    ADJUSTMENT_KEYS.some((key) => !Object.hasOwn(adj, key)) ||
    typeof adj['flipX'] !== 'boolean'
  )
    return fail();
  for (const key of ['exposure', 'contrast', 'warmth', 'saturation'] as const) {
    const val = adj[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < -50 || val > 50)
      return fail();
  }
  for (const key of ['sharpness', 'denoise'] as const) {
    const val = adj[key];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0 || val > 100)
      return fail();
  }
  const straighten = adj['straighten'];
  if (
    typeof straighten !== 'number' ||
    !Number.isFinite(straighten) ||
    straighten < -15 ||
    straighten > 15 ||
    !Number.isInteger(straighten * 2)
  )
    return fail();
  return {
    exposure: adj['exposure'] as number,
    contrast: adj['contrast'] as number,
    warmth: adj['warmth'] as number,
    saturation: adj['saturation'] as number,
    sharpness: adj['sharpness'] as number,
    denoise: adj['denoise'] as number,
    straighten: straighten === 0 ? 0 : straighten,
    flipX: adj['flipX'] as boolean,
  };
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
    Object.keys(options).some(
      (key) =>
        ![
          'resize',
          'crops',
          'filter',
          'border',
          'adjustments',
          'photoAdjustments',
          'backgroundCalm',
        ].includes(key),
    ) ||
    !Object.hasOwn(options, 'resize') ||
    (Object.hasOwn(options, 'filter') &&
      !VALID_FILTERS.includes(options['filter'] as VintedListingPhotoFilter)) ||
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
  const adjustments = Object.hasOwn(options, 'adjustments')
    ? parsePhotoAdjustment(options['adjustments'], fail)
    : undefined;
  let photoAdjustments: Record<string, VintedListingPhotoAdjustment> | undefined;
  if (Object.hasOwn(options, 'photoAdjustments')) {
    const rawMap = options['photoAdjustments'];
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return fail();
    photoAdjustments = {};
    for (const [id, raw] of Object.entries(rawMap)) {
      if (!imageIds.includes(id)) return fail();
      photoAdjustments[id] = parsePhotoAdjustment(raw, fail);
    }
  }
  let backgroundCalm: Record<string, VintedListingPhotoBackgroundCalm> | undefined;
  if (Object.hasOwn(options, 'backgroundCalm')) {
    const rawMap = options['backgroundCalm'];
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return fail();
    backgroundCalm = {};
    for (const [id, raw] of Object.entries(rawMap)) {
      if (!imageIds.includes(id) || !raw || typeof raw !== 'object' || Array.isArray(raw))
        return fail();
      const entry = raw as Record<string, unknown>;
      const maskId = entry['maskId'];
      const strength = entry['strength'];
      if (
        Object.keys(entry).length !== 2 ||
        typeof maskId !== 'string' ||
        !UUID_PATTERN.test(maskId) ||
        typeof strength !== 'number' ||
        !Number.isSafeInteger(strength) ||
        strength < 1 ||
        strength > 100
      )
        return fail();
      backgroundCalm[id] = { maskId, strength };
    }
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
    ...(adjustments ? { adjustments } : {}),
    ...(photoAdjustments ? { photoAdjustments } : {}),
    ...(backgroundCalm ? { backgroundCalm } : {}),
  };
}
