import { TaxMode } from './flipbase.models';
import { InvoiceParty } from './invoice.models';
import {
  calculateCompanyReadiness,
  CompanyRequiredField,
  WorkspaceCompanyProfile,
  isCompanyTaxMode,
} from './company-profile.models';

export class CompanyDocumentError extends Error {
  readonly code = 'company_profile_incomplete';
  readonly settingsPath = '/settings/company';

  constructor(readonly missingFields: readonly CompanyRequiredField[]) {
    super(
      'Vervollständige die Unternehmensdaten unter Einstellungen → Unternehmen, bevor Du einen neuen Beleg erstellst.',
    );
    this.name = 'CompanyDocumentError';
  }
}

/** Eine eigenständige Kopie der Geschäftsanschrift, ohne temporäre Logo-URL. */
export function createCompanyDocumentParty(
  profile: WorkspaceCompanyProfile | null,
  taxMode: TaxMode | null,
): InvoiceParty {
  const readiness = calculateCompanyReadiness(profile, taxMode);
  if (!readiness.complete || !profile) throw new CompanyDocumentError(readiness.missingFields);
  return {
    name: profile.legalName!,
    street: `${profile.street} ${profile.houseNumber}`,
    postalCode: profile.postalCode!,
    city: profile.city!,
    country: profile.countryCode!,
    ...(profile.companyName ? { company: profile.companyName } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    ...(profile.phone ? { phone: profile.phone } : {}),
    ...(profile.taxNumber ? { taxId: profile.taxNumber } : {}),
    ...(profile.vatId ? { vatId: profile.vatId } : {}),
    ...(profile.iban ? { iban: profile.iban } : {}),
    ...(profile.bic ? { bic: profile.bic } : {}),
    ...(profile.bankName ? { bankName: profile.bankName } : {}),
    ...(profile.logoPath ? { logoPath: profile.logoPath } : {}),
  };
}

export interface CreditNoteCompanySnapshot {
  readonly seller: InvoiceParty;
  readonly buyer: InvoiceParty;
  readonly taxMode: TaxMode;
  readonly taxClause: string;
  readonly originalInvoiceNumber: string | null;
}

export function emptyDocumentParty(): InvoiceParty {
  return { name: '', street: '', postalCode: '', city: '', country: '' };
}

export function readCreditNoteCompanySnapshot(value: unknown): CreditNoteCompanySnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  const seller = snapshot['seller'];
  const buyer = snapshot['buyer'];
  if (
    !seller ||
    typeof seller !== 'object' ||
    !('name' in seller) ||
    typeof seller.name !== 'string' ||
    !seller.name.trim() ||
    !buyer ||
    typeof buyer !== 'object' ||
    !isCompanyTaxMode(snapshot['taxMode']) ||
    typeof snapshot['taxClause'] !== 'string'
  )
    return null;
  return {
    seller: seller as InvoiceParty,
    buyer: buyer as InvoiceParty,
    taxMode: snapshot['taxMode'],
    taxClause: snapshot['taxClause'],
    originalInvoiceNumber:
      typeof snapshot['originalInvoiceNumber'] === 'string'
        ? snapshot['originalInvoiceNumber']
        : null,
  };
}
