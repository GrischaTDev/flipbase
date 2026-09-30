import { WorkspaceCompanyProfile } from './company-profile.models';
import { PaymentGatewayConfig } from './store.models';
import { Json } from './supabase.types';

export interface CompanyBankAccount {
  readonly accountHolder: string;
  readonly iban: string;
  readonly bic: string;
  readonly bankName: string;
}

export interface CompanyStoreImprint {
  readonly company: string;
  readonly owner: string;
  readonly street: string;
  readonly city: string;
  readonly country: string;
  readonly email: string;
  readonly phone: string;
  readonly vatId: string;
  readonly taxNumber: string;
}

const compactIban = (value: string): string => value.replace(/\s/g, '').toUpperCase();

export function getCompanyBankAccount(
  profile: WorkspaceCompanyProfile | null,
): CompanyBankAccount | null {
  const accountHolder = profile?.bankAccountHolder?.trim() ?? '';
  const iban = compactIban(profile?.iban ?? '');
  return accountHolder && iban
    ? {
        accountHolder,
        iban,
        bic: profile?.bic?.trim() ?? '',
        bankName: profile?.bankName?.trim() ?? '',
      }
    : null;
}

export function getCompanyStoreImprint(
  profile: WorkspaceCompanyProfile | null,
): CompanyStoreImprint | null {
  if (!profile?.legalName?.trim()) return null;
  return {
    company: profile.companyName?.trim() ?? '',
    owner: profile.legalName.trim(),
    street: [profile.street, profile.houseNumber].filter(Boolean).join(' '),
    city: [profile.postalCode, profile.city].filter(Boolean).join(' '),
    country: profile.countryCode ?? '',
    email: profile.email ?? '',
    phone: profile.phone ?? '',
    vatId: profile.vatId ?? '',
    taxNumber: profile.taxNumber ?? '',
  };
}

export function getLegacyStoreBankAccount(value: unknown): CompanyBankAccount | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  const text = (key: string): string => (typeof fields[key] === 'string' ? fields[key].trim() : '');
  const iban = compactIban(text('bankIban'));
  const accountHolder = text('bankAccountHolder');
  // Diese IBAN stammt aus dem alten Demo-Standard und darf kein Übernahmevorschlag sein.
  if (!iban || !accountHolder || iban === 'DE45500105175555666677') return null;
  return { iban, accountHolder, bic: text('bankBic'), bankName: text('bankName') };
}

export function maskCompanyIban(iban: string): string {
  const compact = compactIban(iban);
  return compact.length > 8 ? `${compact.slice(0, 4)} •••• ${compact.slice(-4)}` : '••••';
}

export function readStorePaymentConfig(
  value: unknown,
  defaults: PaymentGatewayConfig,
): PaymentGatewayConfig {
  const fields =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const flag = (key: keyof PaymentGatewayConfig): boolean =>
    typeof fields[key] === 'boolean' ? fields[key] : Boolean(defaults[key]);
  const text = (key: keyof PaymentGatewayConfig): string =>
    typeof fields[key] === 'string' ? fields[key] : String(defaults[key]);
  return {
    stripeEnabled: flag('stripeEnabled'),
    stripePublishableKey: text('stripePublishableKey'),
    paypalEnabled: flag('paypalEnabled'),
    paypalClientId: text('paypalClientId'),
    paypalEmail: text('paypalEmail'),
    bankTransferEnabled: flag('bankTransferEnabled'),
    cashOnPickupEnabled: flag('cashOnPickupEnabled'),
  };
}

export function readStorePaymentFields(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
