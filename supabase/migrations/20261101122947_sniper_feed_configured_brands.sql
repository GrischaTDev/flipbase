-- Vinted-Feed: Die Markenauswahl zeigt nur noch die in aktiven Vinted-Suchfiltern eingestellten
-- Marken statt aller Marken, die der Bot in den letzten drei Tagen mitgefunden hat.
-- Betroffen: Funktion public.sniper_supported_brands; liest public.sniper_queries.brand_names.
-- Alte Markenfilter ohne gespeicherten Namen behalten die Marken ihrer eigenen Funde.
-- Signatur und Rechte bleiben unverändert. Nicht destruktiv. Zusammengestellt aus den Schemadateien.

-- Quelle: supabase/schemas/402_sniper_filter_feed_updates.sql
create or replace function public.sniper_supported_brands(p_workspace_id uuid)
returns table (brand text) language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;

    -- Maßgeblich sind die im Bot eingestellten Marken, nicht zufällig mitgefundene.
    -- Alte Markenfilter ohne gespeicherten Namen behalten die Marken ihrer eigenen Funde.
    return query
        with configured as (
            select btrim(configured_brand.name) as brand
            from public.sniper_queries as query
            cross join unnest(query.brand_names) as configured_brand(name)
            where query.marketplace = 'vinted'
                and query.is_active
                and query.deleted_at is null
        ), legacy as (
            select btrim(listing.brand) as brand
            from public.sniper_listings as listing
            join public.sniper_queries as query on query.id = listing.discovered_by_query_id
            where query.marketplace = 'vinted'
                and query.is_active
                and query.deleted_at is null
                and query.brand_id is not null
                and cardinality(query.brand_names) = 0
                and listing.first_seen_at >= now() - interval '3 days'
                and not listing.is_initial_stock
        ), candidates as (
            select configured.brand from configured
            union all
            select legacy.brand from legacy
        )
        select min(candidates.brand) as brand
        from candidates
        where nullif(candidates.brand, '') is not null
        group by lower(candidates.brand)
        order by 1;
end;
$$;
comment on function public.sniper_supported_brands(uuid) is
    'Gibt die in aktiven Vinted-Suchfiltern eingestellten Marken fuer den Feed zurueck.';
