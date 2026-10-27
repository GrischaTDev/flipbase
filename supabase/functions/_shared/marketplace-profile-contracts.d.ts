export interface VintedProfileOption {
  readonly id: string;
  readonly label: string;
}

export interface VintedProfileFields {
  readonly about: string;
  readonly city: string;
  readonly showCity: boolean;
  readonly language: string;
}

export interface VintedProfileDetails extends VintedProfileFields {
  readonly country: string;
  readonly imageUrl: string | null;
  readonly languages: readonly VintedProfileOption[];
  readonly canUploadPhoto: boolean;
}

export interface VintedProfilePhoto {
  readonly mimeType: 'image/jpeg';
  readonly base64: string;
}

export interface VintedProfileChanges extends VintedProfileFields {
  readonly cityId?: string;
  readonly photo?: VintedProfilePhoto;
}

export type VintedProfileSaveResult =
  | { readonly status: 'confirmed'; readonly profile: VintedProfileDetails }
  | { readonly status: 'conflict' | 'unconfirmed' };
