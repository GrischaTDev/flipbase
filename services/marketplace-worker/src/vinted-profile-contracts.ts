import type {
  VintedProfileChanges,
  VintedProfileDetails,
  VintedProfileOption,
  VintedProfileSaveResult,
} from '../../../supabase/functions/_shared/marketplace-profile-contracts.d.ts';

export const vintedProfilePhotoLimit = 256 * 1024;

function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    throw new Error('Ungültige Profildaten');
  return input as Record<string, unknown>;
}

function text(input: unknown, limit: number): string {
  if (typeof input !== 'string' || input.length > limit) throw new Error('Ungültiges Profilfeld');
  return input;
}

function fields(input: Record<string, unknown>) {
  if (typeof input.showCity !== 'boolean') throw new Error('Ungültige Stadtsichtbarkeit');
  const language = text(input.language, 16);
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(language)) throw new Error('Ungültige Profilsprache');
  return {
    about: text(input.about, 2000),
    city: text(input.city, 120),
    showCity: input.showCity,
    language,
  };
}

export function parseVintedProfileOptions(input: unknown, cities = false): VintedProfileOption[] {
  if (!Array.isArray(input) || input.length > (cities ? 100 : 20))
    throw new Error('Ungültige Profilauswahl');
  const ids = new Set<string>();
  return input.map((entry) => {
    const option = record(entry, ['id', 'label']);
    const id = text(option.id, 16),
      label = text(option.label, 120);
    if (
      !(cities ? /^[1-9][0-9]{0,9}$/ : /^[a-z]{2}-[A-Z]{2}$/).test(id) ||
      !label.trim() ||
      ids.has(id)
    )
      throw new Error('Ungültige Profilauswahl');
    ids.add(id);
    return { id, label };
  });
}

export function parseVintedProfileDetails(input: unknown): VintedProfileDetails {
  const profile = record(input, [
    'about',
    'city',
    'showCity',
    'language',
    'country',
    'imageUrl',
    'languages',
    'canUploadPhoto',
  ]);
  const editable = fields(profile);
  const languages = parseVintedProfileOptions(profile.languages);
  if (
    !languages.some((language) => language.id === editable.language) ||
    typeof profile.canUploadPhoto !== 'boolean'
  )
    throw new Error('Profilformular nicht verfügbar');
  const imageUrl = profile.imageUrl === null ? null : text(profile.imageUrl, 2048);
  if (imageUrl !== null) {
    const url = new URL(imageUrl);
    if (
      url.protocol !== 'https:' ||
      !/^images[0-9]*\.vinted\.net$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      throw new Error('Ungültiges Profilbild');
  }
  return {
    ...editable,
    country: text(profile.country, 120),
    imageUrl,
    languages,
    canUploadPhoto: profile.canUploadPhoto,
  };
}

export function parseVintedProfileChanges(input: unknown): VintedProfileChanges {
  const changes = record(input, ['about', 'city', 'cityId', 'showCity', 'language', 'photo']);
  const editable = fields(changes);
  const cityId = changes.cityId === undefined ? undefined : text(changes.cityId, 10);
  if (cityId !== undefined && !/^[1-9][0-9]{0,9}$/.test(cityId)) throw new Error('Ungültige Stadt');
  if (changes.photo === undefined) return { ...editable, ...(cityId ? { cityId } : {}) };
  const photo = record(changes.photo, ['mimeType', 'base64']);
  const base64 = text(photo.base64, 4 * Math.ceil(vintedProfilePhotoLimit / 3));
  if (photo.mimeType !== 'image/jpeg' || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
    throw new Error('Ungültiges Profilbild');
  const bytes = Buffer.from(base64, 'base64');
  if (
    bytes.length < 4 ||
    bytes.length > vintedProfilePhotoLimit ||
    bytes.toString('base64') !== base64 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  )
    throw new Error('Ungültiges Profilbild');
  return { ...editable, ...(cityId ? { cityId } : {}), photo: { mimeType: 'image/jpeg', base64 } };
}

export function parseVintedProfileSaveResult(input: unknown): VintedProfileSaveResult {
  const result = record(input, ['status', 'profile']);
  if (result.status === 'confirmed')
    return { status: 'confirmed', profile: parseVintedProfileDetails(result.profile) };
  if (
    (result.status === 'conflict' || result.status === 'unconfirmed') &&
    !Object.hasOwn(result, 'profile')
  )
    return { status: result.status };
  throw new Error('Ungültiges Profilspeicherergebnis');
}
