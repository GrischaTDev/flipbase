import { WorkspaceCompanyProfile } from '../app/core/models/company-profile.models';
import {
  createCompanyDocumentParty,
  CreditNoteCompanySnapshot,
} from '../app/core/models/company-document.models';

export function companyProfileFixture(workspaceId = 'ws-1'): WorkspaceCompanyProfile {
  return {
    workspaceId,
    companyName: 'Testladen',
    legalName: 'Anna Beispiel',
    legalForm: null,
    email: null,
    phone: null,
    website: null,
    street: 'Testweg',
    houseNumber: '1',
    postalCode: '12345',
    city: 'Bonn',
    countryCode: 'DE',
    mailingAddressEnabled: false,
    mailingStreet: null,
    mailingHouseNumber: null,
    mailingPostalCode: null,
    mailingCity: null,
    mailingCountryCode: null,
    taxNumber: '123/456/789',
    vatId: null,
    taxOffice: null,
    federalState: null,
    bankAccountHolder: null,
    bankName: null,
    iban: null,
    bic: null,
    logoPath: null,
    createdAt: '',
    updatedAt: '',
  };
}

export function creditNoteSnapshotFixture(): CreditNoteCompanySnapshot {
  const seller = createCompanyDocumentParty(companyProfileFixture(), 'diff_25a');
  return {
    seller,
    buyer: seller,
    taxMode: 'diff_25a',
    taxClause: 'Differenzbesteuerung nach § 25a UStG',
    originalInvoiceNumber: 'RE-TEST-1',
  };
}
