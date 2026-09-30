import { describe, expect, it } from 'vitest';
import { CompanyDocumentError, createCompanyDocumentParty } from './company-document.models';
import { WorkspaceCompanyProfile } from './company-profile.models';

const profile: WorkspaceCompanyProfile = {
  workspaceId: 'company-a',
  companyName: 'Laden',
  legalName: 'Anna Beispiel',
  legalForm: null,
  street: 'Hauptstraße',
  houseNumber: '7a',
  postalCode: '12345',
  city: 'Köln',
  countryCode: 'DE',
  email: null,
  phone: null,
  website: null,
  mailingAddressEnabled: true,
  mailingStreet: 'Postweg',
  mailingHouseNumber: '9',
  mailingPostalCode: '98765',
  mailingCity: 'Bonn',
  mailingCountryCode: 'DE',
  taxNumber: '123/456/789',
  vatId: null,
  taxOffice: null,
  federalState: null,
  bankAccountHolder: null,
  bankName: 'Bank',
  iban: 'DE123',
  bic: null,
  logoPath: 'company-a/logos/old.png',
  createdAt: '',
  updatedAt: '',
};

describe('Unternehmensdaten auf Dokumenten', () => {
  it('speichert rechtlichen Namen, Geschäftsanschrift, Steuerdaten und den Logo-Dateipfad', () => {
    const party = createCompanyDocumentParty(profile, 'diff_25a');
    expect(party).toEqual({
      name: 'Anna Beispiel',
      company: 'Laden',
      street: 'Hauptstraße 7a',
      postalCode: '12345',
      city: 'Köln',
      country: 'DE',
      taxId: '123/456/789',
      bankName: 'Bank',
      iban: 'DE123',
      logoPath: 'company-a/logos/old.png',
    });
    expect(party).not.toHaveProperty('email');
  });

  it('meldet fehlende Felder strukturiert und verweist auf die Unternehmenseinstellungen', () => {
    try {
      createCompanyDocumentParty({ ...profile, legalName: null, taxNumber: null }, 'diff_25a');
      expect.fail('Unvollständige Daten müssen die Erstellung verhindern.');
    } catch (error) {
      expect(error).toBeInstanceOf(CompanyDocumentError);
      expect(error).toMatchObject({
        code: 'company_profile_incomplete',
        missingFields: ['legalName', 'taxIdentifier'],
        settingsPath: '/settings/company',
      });
    }
  });

  it('bewahrt eine erstellte Kopie nach Änderungen am Profil', () => {
    const party = createCompanyDocumentParty(profile, 'regular_19');
    const changed = createCompanyDocumentParty(
      { ...profile, legalName: 'Neue Firma', logoPath: null },
      'regular_19',
    );
    expect(party.name).toBe('Anna Beispiel');
    expect(changed.name).toBe('Neue Firma');
    expect(changed).not.toHaveProperty('logoPath');
  });
});
