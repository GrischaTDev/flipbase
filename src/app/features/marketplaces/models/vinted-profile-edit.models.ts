import type {
  VintedProfileDetails,
  VintedProfileOption,
} from '../../../../../supabase/functions/_shared/marketplace-profile-contracts';
export type {
  VintedProfileChanges,
  VintedProfileDetails,
  VintedProfileOption,
  VintedProfilePhoto,
} from '../../../../../supabase/functions/_shared/marketplace-profile-contracts';

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Ungültige Profildaten.');
  return input as Record<string, unknown>;
}

function text(input: unknown, limit: number): string {
  if (typeof input !== 'string' || input.length > limit) throw new Error('Ungültiges Profilfeld.');
  return input;
}

export function parseVintedProfileOptions(input: unknown, cities = false): VintedProfileOption[] {
  if (!Array.isArray(input) || input.length > (cities ? 100 : 20))
    throw new Error('Ungültige Profilauswahl.');
  const ids = new Set<string>();
  return input.map((entry) => {
    const option = record(entry),
      id = text(option['id'], 16),
      label = text(option['label'], 120);
    if (
      !(cities ? /^[1-9][0-9]{0,9}$/ : /^[a-z]{2}-[A-Z]{2}$/).test(id) ||
      !label.trim() ||
      ids.has(id)
    )
      throw new Error('Ungültige Profilauswahl.');
    ids.add(id);
    return { id, label };
  });
}

export function parseVintedProfileDetails(input: unknown): VintedProfileDetails {
  const profile = record(input),
    languages = parseVintedProfileOptions(profile['languages']);
  const language = text(profile['language'], 16);
  if (
    typeof profile['showCity'] !== 'boolean' ||
    typeof profile['canUploadPhoto'] !== 'boolean' ||
    !languages.some((option) => option.id === language)
  )
    throw new Error('Ungültige Profildaten.');
  const imageUrl = profile['imageUrl'] === null ? null : text(profile['imageUrl'], 2048);
  if (imageUrl !== null) {
    const url = new URL(imageUrl);
    if (
      url.protocol !== 'https:' ||
      !/^images[0-9]*\.vinted\.net$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      throw new Error('Ungültiges Profilbild.');
  }
  return {
    about: text(profile['about'], 2000),
    city: text(profile['city'], 120),
    country: text(profile['country'], 120),
    showCity: profile['showCity'],
    language,
    languages,
    imageUrl,
    canUploadPhoto: profile['canUploadPhoto'],
  };
}
