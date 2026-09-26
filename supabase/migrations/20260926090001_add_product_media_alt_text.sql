-- Zweck: Alternativtext für Produktbilder speichern.
-- Tabelle/Spalte: public.catalog_product_media.alt_text.

alter table "public"."catalog_product_media" add column "alt_text" text;
alter table "public"."catalog_product_media" add constraint "catalog_product_media_alt_text_check" check ((char_length(alt_text) <= 500)) not valid;
alter table "public"."catalog_product_media" validate constraint "catalog_product_media_alt_text_check";
