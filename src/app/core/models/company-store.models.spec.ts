import { describe, expect, it } from 'vitest';
import { companyProfileFixture } from '../../../test-support/company-document.fixture';
import {
  getCompanyBankAccount,
  getLegacyStoreBankAccount,
  maskCompanyIban,
} from './company-store.models';

describe('Unternehmensbankkonto und sichere Legacy-Vorschläge', () => {
  it('verwendet den hinterlegten Kontoinhaber statt Firmenname oder rechtlichem Namen', () => {
    expect(
      getCompanyBankAccount({
        ...companyProfileFixture(),
        bankAccountHolder: ' Konto-Inhaber ',
        iban: ' DE89 3704 0044 0532 0130 00 ',
        bic: null,
        bankName: null,
      }),
    ).toEqual({
      accountHolder: 'Konto-Inhaber',
      iban: 'DE89370400440532013000',
      bic: '',
      bankName: '',
    });
  });
  it('verwendet ohne Kontoangaben keine erfundenen Werte', () => {
    expect(getCompanyBankAccount(companyProfileFixture())).toBeNull();
    expect(
      getCompanyBankAccount({ ...companyProfileFixture(), iban: 'DE89370400440532013000' }),
    ).toBeNull();
  });
  it.each(['123', 'DE89370400440532013001', 'DE89-370400440532013000'])(
    'verwendet die ungültige IBAN %s weder als Shopkonto noch als Vorschlag',
    (iban) => {
      expect(
        getCompanyBankAccount({ ...companyProfileFixture(), bankAccountHolder: 'Inhaber', iban }),
      ).toBeNull();
      expect(
        getLegacyStoreBankAccount({ bankAccountHolder: 'Inhaber', bankIban: iban }),
      ).toBeNull();
    },
  );
  it('akzeptiert eine gültige internationale IBAN mit Buchstaben im Kontoteil', () => {
    expect(
      getCompanyBankAccount({
        ...companyProfileFixture(),
        bankAccountHolder: 'Inhaber',
        iban: 'gb82 west 1234 5698 7654 32',
      })?.iban,
    ).toBe('GB82WEST12345698765432');
  });
  it('bietet echte alte Kontodaten als Vorschlag an', () => {
    expect(
      getLegacyStoreBankAccount({
        bankIban: 'DE89370400440532013000',
        bankAccountHolder: 'Alter Inhaber',
        bankBic: 'COBADEFFXXX',
      }),
    ).toEqual({
      accountHolder: 'Alter Inhaber',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      bankName: '',
    });
  });
  it('bietet Demo-IBAN und unvollständige Altwerte nicht zur Übernahme an', () => {
    expect(
      getLegacyStoreBankAccount({
        bankIban: 'DE45 5001 0517 5555 6666 77',
        bankAccountHolder: 'Demo',
      }),
    ).toBeNull();
    expect(getLegacyStoreBankAccount({ bankIban: 'DE89370400440532013000' })).toBeNull();
    expect(getLegacyStoreBankAccount(null)).toBeNull();
  });
  it('zeigt in Einstellungen nur Anfang und Ende der IBAN', () => {
    expect(maskCompanyIban('DE89 3704 0044 0532 0130 00')).toBe('DE89 •••• 3000');
  });
});
