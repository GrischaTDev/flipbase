-- Persistiert die Absenderadresse je Workspace für Versandetiketten.
-- Betroffen: public.carrier_configs.

alter table public.carrier_configs
  add column if not exists sender_name text,
  add column if not exists sender_company text,
  add column if not exists sender_street text,
  add column if not exists sender_house_number text,
  add column if not exists sender_postal_code text,
  add column if not exists sender_city text,
  add column if not exists sender_country text,
  add column if not exists sender_email text,
  add column if not exists sender_phone text;

comment on column public.carrier_configs.sender_name is
  'Name des Absenders auf Versanddokumenten.';
comment on column public.carrier_configs.sender_company is
  'Optionaler Firmenname des Absenders auf Versanddokumenten.';
comment on column public.carrier_configs.sender_street is
  'Straße der Absenderadresse.';
comment on column public.carrier_configs.sender_house_number is
  'Hausnummer der Absenderadresse.';
comment on column public.carrier_configs.sender_postal_code is
  'Postleitzahl der Absenderadresse.';
comment on column public.carrier_configs.sender_city is
  'Ort der Absenderadresse.';
comment on column public.carrier_configs.sender_country is
  'Land der Absenderadresse.';
comment on column public.carrier_configs.sender_email is
  'Optionale E-Mail-Adresse des Absenders.';
comment on column public.carrier_configs.sender_phone is
  'Optionale Telefonnummer des Absenders.';
