-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.sniper_evaluate_hits (
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
  -- Der Massstab haengt am Zustand, nicht am einzelnen Angebot. Erst die
  -- Zustaende sammeln, dann je Zustand einmal rechnen: Bei fuenfzig neuen
  -- Angeboten sind das fuenf Fensterabfragen statt fuenfzig.
  zustaende as (
      select distinct offen.condition from offen
  ),
  massstaebe as (
      select zustaende.condition, massstab.reference_price
      from zustaende
      cross join lateral public.sniper_reference_price(
          p_query_id, zustaende.condition
      ) as massstab
      where massstab.reference_price is not null
        and massstab.reference_price > 0
  ),
  bewertbar as (
      select offen.id, offen.item_price, massstaebe.reference_price
      from offen
      join massstaebe
        on massstaebe.condition is not distinct from offen.condition
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
  --
  -- Ohne aktiven Abonnenten wurde ueberhaupt nicht beurteilt. Wuerde hier
  -- trotzdem abgehakt, verloere ein Nutzer, der seinen Filter einen Tag
  -- pausiert, jedes Schnaeppchen dieses Tages endgueltig - und
  -- create_sniper_subscription schaltet einen Filter beim erneuten Anlegen
  -- ausdruecklich wieder aktiv.
  vermerkt as (
      update public.sniper_listings as listing
      set evaluated_at = now()
      where listing.id in (
          select offen.id
          from offen
          where not p_report_hits
             or (
                 exists (
                     select 1
                     from public.sniper_query_subscriptions as subscription
                     where subscription.query_id = p_query_id
                       and subscription.is_active
                 )
                 and offen.id in (select bewertbar.id from bewertbar)
             )
      )
      returning 1
  )
  select count(*)::integer into v_created from eingefuegt;

  return v_created;
end;
$function$;