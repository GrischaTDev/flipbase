CREATE OR REPLACE FUNCTION public.sniper_query_listing_counts()
  RETURNS TABLE (
    query_id      uuid,
    listing_count bigint
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
    if not public.is_platform_operator() then raise exception 'Nur fuer die Administration' using errcode = '42501'; end if;
    return query with associations as (
        select matched.query_id as filter_id, matched.listing_id
        from public.sniper_query_matches matched
        join public.sniper_queries filter on filter.id = matched.query_id
        where matched.first_matched_at >= now() - interval '24 hours'
          and (filter.results_reset_at is null or (
              matched.first_matched_at >= filter.results_reset_at and exists (
                  select 1 from public.sniper_listings listing
                  where listing.id = matched.listing_id
                    and public.sniper_listing_after_reset(listing.external_id, listing.first_seen_at,
                          filter.results_reset_at, filter.reset_baseline_external_id)
              )
          ))
        union
        select listing.discovered_by_query_id, listing.id from public.sniper_listings listing
        join public.sniper_queries filter on filter.id = listing.discovered_by_query_id
        where listing.first_seen_at >= now() - interval '24 hours' and listing.discovered_by_query_id is not null
          and (filter.results_reset_at is null or public.sniper_listing_after_reset(
                listing.external_id, listing.first_seen_at, filter.results_reset_at, filter.reset_baseline_external_id))
    ) select filter_id, count(*) from associations group by filter_id;
end;
$function$;
