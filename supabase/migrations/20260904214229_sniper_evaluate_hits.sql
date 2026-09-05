-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.sniper_evaluate_hits (
  p_query_id uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_created integer;
begin
  with kandidaten as (
      select
          subscription.id as subscription_id,
          listing.id as listing_id,
          massstab.reference_price,
          round(
              (massstab.reference_price - listing.item_price)
              / massstab.reference_price * 100,
              2
          ) as discount_percent
      from public.sniper_query_subscriptions as subscription
      join public.sniper_listings as listing
        on listing.discovered_by_query_id = p_query_id
      cross join lateral public.sniper_reference_price(
          p_query_id, listing.condition
      ) as massstab
      where subscription.query_id = p_query_id
        and subscription.is_active
        and massstab.reference_price is not null
        and massstab.reference_price > 0
        and listing.item_price
            <= massstab.reference_price
               * (1 - subscription.discount_threshold_percent / 100)
  ),
  eingefuegt as (
      insert into public.sniper_hits
          (subscription_id, listing_id, reference_price, discount_percent)
      select subscription_id, listing_id, reference_price, discount_percent
      from kandidaten
      on conflict (subscription_id, listing_id) do nothing
      returning 1
  )
  select count(*)::integer into v_created from eingefuegt;

  return v_created;
end;
$function$;

COMMENT ON FUNCTION public.sniper_evaluate_hits(uuid) IS 'Legt fuer alle aktiven Abonnements einer Abfrage die fehlenden Treffer an und liefert deren Zahl. Wiederholte Laeufe sind folgenlos.';

-- Der Abgleich erfasst hier nur PUBLIC; Supabase vergibt neuen Funktionen per
-- Voreinstellung zusaetzlich ein explizites EXECUTE an authenticated, das ein
-- Revoke von PUBLIC allein nicht zieht. Deshalb anon und authenticated hier
-- ausdruecklich mit aufgefuehrt - siehe supabase/schemas/50_sniper.sql.
REVOKE ALL ON FUNCTION public.sniper_evaluate_hits(uuid) FROM PUBLIC, anon, authenticated;

GRANT ALL ON FUNCTION public.sniper_evaluate_hits(uuid) TO service_role;