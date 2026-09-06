-- Zweck: Der Zeitpunkt einer angeforderten Kategorie-Auffrischung kommt aus
-- der Datenbank, nicht aus dem Browser des Betreibers.
-- Betroffen: neue Trigger-Funktion public.stamp_vinted_category_request() und
-- der Trigger gleichen Namens auf public.vinted_category_syncs.
-- Nicht destruktiv: legt nur an, aendert keine Daten.
--
-- Grund: Die Administration schrieb requested_at mit ihrer eigenen Uhr. Geht
-- sie vor, liegt der Wert stundenlang hinter dem refreshed_at, das der Dienst
-- aus seiner Uhr schreibt - die Anforderung gilt solange als offen und der
-- Dienst liest bei jedem Takt neu ein. Dasselbe Muster wie
-- stamp_beta_application_decision() aus 20260905132539_platform_admin.sql.
--
-- Das Spaltenrecht `grant update (requested_at)` bleibt unangetastet: Die
-- Oberflaeche darf weiterhin genau dieses eine Feld anfassen, nur ist der
-- uebermittelte Wert jetzt gleichgueltig.
--
-- Der Abgleich (`npx supabase db diff -f vinted_category_request_stamp`) hat
-- wie schon bei 20260906110213_vinted_categories.sql zusaetzlich
-- Neudeklarationen bereits bestehender, mit dieser Aufgabe nicht verwandter
-- Funktionen erzeugt (add_purchase_lines, correct_purchase_costing,
-- create_purchase, finalize_purchase_costing, is_valid_gtin,
-- migrate_purchase_costing_legacy, receive_individual_purchase_line,
-- set_purchase_line_eans, sync_inventory_item_ean, update_purchase_draft).
-- Sie unterscheiden sich nur in Gross-/Kleinschreibung, Einrueckung und
-- $$ statt $function$ und wurden wie dort entfernt; diese Datei bleibt auf
-- den Trigger begrenzt.

SET check_function_bodies = false;

CREATE FUNCTION public.stamp_vinted_category_request()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if new.requested_at is not null and new.requested_at is distinct from old.requested_at then
    new.requested_at := now();
  end if;
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.stamp_vinted_category_request() TO authenticated;

GRANT ALL ON FUNCTION public.stamp_vinted_category_request() TO service_role;

CREATE TRIGGER stamp_vinted_category_request
  BEFORE UPDATE ON public.vinted_category_syncs
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_vinted_category_request();
