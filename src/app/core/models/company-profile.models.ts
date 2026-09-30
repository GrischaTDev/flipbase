import { TaxMode } from './flipbase.models';

export type CompanyLegalForm = 'sole_proprietorship' | 'gbr' | 'ug' | 'gmbh' | 'other';

export interface WorkspaceCompanyProfile {
  readonly workspaceId: string;
  readonly companyName: string | null;
  readonly legalName: string | null;
  readonly legalForm: CompanyLegalForm | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly street: string | null;
  readonly houseNumber: string | null;
  readonly postalCode: string | null;
  readonly city: string | null;
  readonly countryCode: string | null;
  readonly mailingAddressEnabled: boolean;
  readonly mailingStreet: string | null;
  readonly mailingHouseNumber: string | null;
  readonly mailingPostalCode: string | null;
  readonly mailingCity: string | null;
  readonly mailingCountryCode: string | null;
  readonly taxNumber: string | null;
  readonly vatId: string | null;
  readonly taxOffice: string | null;
  readonly federalState: string | null;
  readonly bankAccountHolder: string | null;
  readonly bankName: string | null;
  readonly iban: string | null;
  readonly bic: string | null;
  readonly logoPath: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CompanyProfileInput {
  readonly companyName: string;
  readonly legalName: string;
  readonly legalForm: CompanyLegalForm | null;
  readonly email: string;
  readonly phone: string;
  readonly website: string;
  readonly street: string;
  readonly houseNumber: string;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  readonly mailingAddressEnabled: boolean;
  readonly mailingStreet: string;
  readonly mailingHouseNumber: string;
  readonly mailingPostalCode: string;
  readonly mailingCity: string;
  readonly mailingCountryCode: string;
  readonly taxNumber: string;
  readonly vatId: string;
  readonly taxOffice: string;
  readonly federalState: string;
  readonly bankAccountHolder: string;
  readonly bankName: string;
  readonly iban: string;
  readonly bic: string;
}

export interface CompanySettingsState {
  readonly profile: WorkspaceCompanyProfile;
  readonly taxMode: TaxMode;
  readonly canEdit: boolean;
}

export type CompanyRequiredField =
  | 'legalName'
  | 'street'
  | 'houseNumber'
  | 'postalCode'
  | 'city'
  | 'countryCode'
  | 'taxMode'
  | 'taxIdentifier';

export interface CompanyReadiness {
  readonly complete: boolean;
  readonly missingFields: readonly CompanyRequiredField[];
}

export function isCompanyLegalForm(value: unknown): value is CompanyLegalForm {
  return (
    value === 'sole_proprietorship' ||
    value === 'gbr' ||
    value === 'ug' ||
    value === 'gmbh' ||
    value === 'other'
  );
}

export function isCompanyTaxMode(value: unknown): value is TaxMode {
  return value === 'diff_25a' || value === 'kleinunternehmer_19' || value === 'regular_19';
}

export function calculateCompanyReadiness(
  profile: WorkspaceCompanyProfile | null,
  taxMode: TaxMode | null,
): CompanyReadiness {
  const missing: CompanyRequiredField[] = [];
  if (!profile?.legalName?.trim()) missing.push('legalName');
  if (!profile?.street?.trim()) missing.push('street');
  if (!profile?.houseNumber?.trim()) missing.push('houseNumber');
  if (!profile?.postalCode?.trim()) missing.push('postalCode');
  if (!profile?.city?.trim()) missing.push('city');
  if (!profile?.countryCode?.trim()) missing.push('countryCode');
  if (!taxMode || !isCompanyTaxMode(taxMode)) missing.push('taxMode');
  if (!profile?.taxNumber?.trim() && !profile?.vatId?.trim()) missing.push('taxIdentifier');
  return { complete: missing.length === 0, missingFields: missing };
}
