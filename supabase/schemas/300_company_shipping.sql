-- Unternehmensanschrift als Versandstandard, individuelle Alt-Absender unverändert erhalten.
-- null kennzeichnet eine alte Konfiguration: vollständige Absenderfelder bleiben ein Override.

alter table public.carrier_configs add column use_company_address boolean;
comment on column public.carrier_configs.use_company_address is
  'true verwendet die Unternehmensanschrift, false den individuellen Absender; null erhält die automatische Einordnung alter Konfigurationen.';
