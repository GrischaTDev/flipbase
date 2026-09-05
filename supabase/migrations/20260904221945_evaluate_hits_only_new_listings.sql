-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.sniper_evaluate_hits(p_query_id uuid);

CREATE FUNCTION public.sniper_evaluate_hits (
  p_query_id    uuid,
  p_report_hits boolean DEFAULT true
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_created integer;
begin
  with offen as (
      select listing.id, listing.condition, listing.item_price
      from public.sniper_listings as listing
      where listing.discovered_by_query_id = p_query_id
        and listing.evaluated_at is null
  ),
  -- Der Massstab haengt am Zustand, nicht am Abonnement. Einmal je Angebot
  -- gerechnet statt einmal je Abonnement und Angebot.
  bewertbar as (
      select offen.id, offen.item_price, massstab.reference_price
      from offen
      cross join lateral public.sniper_reference_price(
          p_query_id, offen.condition
      ) as massstab
      where massstab.reference_price is not null
        and massstab.reference_price > 0
  ),
  kandidaten as (
      select
          subscription.id as subscription_id,
          bewertbar.id as listing_id,
          bewertbar.reference_price,
          round(
              (bewertbar.reference_price - bewertbar.item_price)
              / bewertbar.reference_price * 100,
              2
          ) as discount_percent
      from public.sniper_query_subscriptions as subscription
      cross join bewertbar
      where p_report_hits
        and subscription.query_id = p_query_id
        and subscription.is_active
        and bewertbar.item_price
            <= bewertbar.reference_price
               * (1 - subscription.discount_threshold_percent / 100)
  ),
  eingefuegt as (
      insert into public.sniper_hits
          (subscription_id, listing_id, reference_price, discount_percent)
      select subscription_id, listing_id, reference_price, discount_percent
      from kandidaten
      on conflict (subscription_id, listing_id) do nothing
      returning 1
  ),
  -- Abgehakt wird, was wirklich beurteilt werden konnte. Der Einlese-Lauf
  -- hakt dagegen alles ab: Dort ist das Nichtmelden die Absicht.
  vermerkt as (
      update public.sniper_listings as listing
      set evaluated_at = now()
      where listing.id in (
          select offen.id
          from offen
          where not p_report_hits
             or offen.id in (select bewertbar.id from bewertbar)
      )
      returning 1
  )
  select count(*)::integer into v_created from eingefuegt;

  return v_created;
end;
$function$;

COMMENT ON FUNCTION public.sniper_evaluate_hits(uuid,boolean) IS 'Prueft die noch ungeprueften Angebote einer Abfrage gegen alle aktiven Abonnements, legt die fehlenden Treffer an und liefert deren Zahl. Mit p_report_hits = false werden die Angebote nur als geprueft vermerkt - so bleibt der Einlese-Lauf stumm.';

REVOKE ALL ON FUNCTION public.sniper_evaluate_hits(uuid, boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION public.sniper_evaluate_hits(uuid, boolean) TO service_role;

ALTER TABLE public.sniper_listings
  ADD COLUMN evaluated_at timestamp with time zone;

COMMENT ON COLUMN public.sniper_listings.evaluated_at IS 'Zeitpunkt, zu dem dieses Angebot gegen die Abonnements geprueft wurde. Leer heisst ungeprueft. Der Einlese-Lauf setzt den Wert, ohne zu melden - damit bleibt der Bestand, den eine neue Abfrage vorfindet, dauerhaft stumm.';

CREATE INDEX idx_sniper_listings_unevaluated ON public.sniper_listings (discovered_by_query_id)
  WHERE evaluated_at IS NULL;