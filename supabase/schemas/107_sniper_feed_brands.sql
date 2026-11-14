-- Marken aus aktiven Sammelauftraegen und der Groessenabgleich des Feeds.
-- Betroffen: public.sniper_queries, public.sniper_listings.

create or replace function public.sniper_supported_brands(p_workspace_id uuid)
returns table (brand text) language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.is_workspace_member(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;

    return query
        select distinct btrim(listing.brand) as brand
        from public.sniper_listings as listing
        join public.sniper_queries as query on query.id = listing.discovered_by_query_id
        where query.marketplace = 'vinted'
            and query.is_active
            and query.brand_id is not null
            and listing.first_seen_at >= now() - interval '3 days'
            and nullif(btrim(listing.brand), '') is not null
        order by 1;
end;
$$;
comment on function public.sniper_supported_brands(uuid) is
    'Gibt die tatsaechlich gefundenen Marken aktiver Vinted-Sammelauftraege fuer den Feed zurueck.';
revoke all on function public.sniper_supported_brands(uuid) from public, anon;
grant execute on function public.sniper_supported_brands(uuid) to authenticated;

create or replace function public.sniper_feed_matches_size(p_listing_size text, p_filter_size text)
returns boolean language sql immutable set search_path = '' as $$
    with size_tokens as (
        select string_to_array(
            btrim(regexp_replace(lower(coalesce(p_listing_size, '')), '[^a-z0-9]+', ' ', 'g')),
            ' '
        ) as tokens
    )
    select case
        when p_filter_size is null then true
        when p_listing_size is null then false
        when lower(btrim(p_listing_size)) = p_filter_size then true
        when p_filter_size = 'xs' then tokens && array['xs', '34']
        when p_filter_size = 's' then tokens && array['s', '36'] and not tokens && array['xs']
        when p_filter_size = 'm' then tokens && array['m', '38']
        when p_filter_size = 'l' then tokens && array['l', '40', '42']
            and not tokens && array['xl', 'xxl', '2xl']
        when p_filter_size = 'xl' then tokens && array['xl', '44', '46']
            and not tokens && array['xxl', '2xl', '3xl']
        when p_filter_size = 'xxl' then tokens && array['xxl', '2xl', '48', '50', '52', '54']
        when p_filter_size = '3xl' then tokens && array['3xl', 'xxxl', '4xl', '5xl']
        else false
    end from size_tokens;
$$;
comment on function public.sniper_feed_matches_size(text, text) is
    'Gleicht Vinted-Groessen einschliesslich Zahlenangaben mit den Feed-Filtern ab.';
revoke all on function public.sniper_feed_matches_size(text, text) from public, anon, authenticated;
grant execute on function public.sniper_feed_matches_size(text, text) to service_role;
