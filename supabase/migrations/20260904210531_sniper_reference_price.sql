-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.sniper_reference_price (
  p_query_id  uuid,
  p_condition text
)
  RETURNS TABLE (
    reference_price numeric,
    sample_size     integer,
    unusable_reason text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
    with fenster as (
        select listing.item_price
        from public.sniper_listings as listing
        where listing.discovered_by_query_id = p_query_id
          and listing.condition is not distinct from p_condition
          and listing.first_seen_at >= now() - interval '14 days'
    ),
    grenze as (
        select price_to from public.sniper_queries where id = p_query_id
    ),
    kennzahlen as (
        select
            count(*)::integer as n,
            percentile_cont(0.5) within group (order by item_price)::numeric(12, 2) as median,
            count(*) filter (
                where (select price_to from grenze) is not null
                  and item_price >= (select price_to from grenze)
            )::integer as am_limit
        from fenster
    )
    select
        case
            when n < 8 then null
            when am_limit::numeric / greatest(n, 1) > 1.0 / 3.0 then null
            else median
        end,
        n,
        case
            when n < 8 then 'too_few'
            when am_limit::numeric / greatest(n, 1) > 1.0 / 3.0 then 'at_price_ceiling'
            else null
        end
    from kennzahlen;
$function$;

COMMENT ON FUNCTION public.sniper_reference_price(uuid,text) IS 'Median der Artikelpreise einer Abfrage im selben Zustand ueber 14 Tage. Liefert null mit Begruendung, wenn die Gruppe zu klein ist oder am Preislimit klebt.';

REVOKE ALL ON FUNCTION public.sniper_reference_price(uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.sniper_reference_price(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.sniper_reference_price(uuid, text) TO service_role;