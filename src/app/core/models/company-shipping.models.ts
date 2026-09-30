import { WorkspaceCompanyProfile } from './company-profile.models';
import { AddressInfo, CarrierConfig } from './fulfillment.models';

export function getCarrierSenderAddress(config: CarrierConfig): AddressInfo | null {
  if (
    ![
      config.senderName,
      config.senderStreet,
      config.senderHouseNumber,
      config.senderPostalCode,
      config.senderCity,
      config.senderCountry,
    ].every((value) => value.trim())
  )
    return null;
  return {
    name: config.senderName.trim(),
    company: config.senderCompany.trim() || undefined,
    street: config.senderStreet.trim(),
    house_number: config.senderHouseNumber.trim(),
    postal_code: config.senderPostalCode.trim(),
    city: config.senderCity.trim(),
    country: config.senderCountry.trim(),
    email: config.senderEmail.trim() || undefined,
    phone: config.senderPhone.trim() || undefined,
  };
}

export function getCompanyShippingAddress(
  profile: WorkspaceCompanyProfile | null,
): AddressInfo | null {
  if (
    !profile ||
    ![
      profile.legalName,
      profile.street,
      profile.houseNumber,
      profile.postalCode,
      profile.city,
      profile.countryCode,
    ].every((value) => value?.trim())
  )
    return null;
  return {
    name: profile.legalName!.trim(),
    company: profile.companyName?.trim() || undefined,
    street: profile.street!.trim(),
    house_number: profile.houseNumber!.trim(),
    postal_code: profile.postalCode!.trim(),
    city: profile.city!.trim(),
    country: profile.countryCode!.trim(),
    email: profile.email?.trim() || undefined,
    phone: profile.phone?.trim() || undefined,
  };
}

export function resolveCompanyAddressChoice(
  value: boolean | null | undefined,
  config: CarrierConfig,
): boolean {
  return value ?? getCarrierSenderAddress(config) === null;
}
