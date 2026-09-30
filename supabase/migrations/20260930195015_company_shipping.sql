-- Zweck: Versand-Anschrift auswählen, bestehende Absender erhalten.
-- Betroffen: public.carrier_configs.use_company_address.
-- Automatisch aus 300_company_shipping.sql erzeugt; Spaltenkommentar aus dem Schema übernommen.

alter table "public"."carrier_configs" add column "use_company_address" boolean;

comment on column public.carrier_configs.use_company_address is
  'true verwendet die Unternehmensanschrift, false den individuellen Absender; null erhält die automatische Einordnung alter Konfigurationen.';
