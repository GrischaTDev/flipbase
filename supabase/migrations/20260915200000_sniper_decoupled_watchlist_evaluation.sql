-- migration: 20260915200000_sniper_decoupled_watchlist_evaluation.sql
-- purpose: add sniper_evaluate_pending_watchlist_hits function and index for decoupled watchlist evaluation
-- affected tables: sniper_listings, sniper_watchlist_hits

create index if not exists idx_sniper_listings_watchlist_pending_global
    on public.sniper_listings (first_seen_at desc, id desc)
    where watchlist_evaluated_at is null;

create or replace function public.sniper_evaluate_pending_watchlist_hits(p_batch_size integer default 100)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_processed integer := 0;
    v_created integer := 0;
begin
    if p_batch_size is null or p_batch_size not between 1 and 1000 then
        raise exception 'Die Paketgroesse muss zwischen 1 und 1000 liegen.' using errcode = '22023';
    end if;

    -- Unbrauchbare Angebote (ungueltige Waehrung, kein/negativer Preis oder aelter als 14 Tage)
    -- koennen keinen Referenzpreis mehr erhalten und duerfen die Warteschlange nicht blockieren.
    with invalid_or_expired as (
        select id from public.sniper_listings
        where watchlist_evaluated_at is null
          and (
            currency != 'EUR'
            or item_price is null
            or item_price <= 0
            or item_price >= 'Infinity'::numeric
            or first_seen_at < now() - interval '14 days'
          )
        limit p_batch_size
        for update skip locked
    ), marked_invalid as (
        update public.sniper_listings set watchlist_evaluated_at = now()
        where id in (select id from invalid_or_expired)
        returning 1
    )
    select count(*)::integer into v_processed from marked_invalid;

    -- Bewertungsauswahl: Neueste unbewertete Angebote mit bekannter Kategorie
    with target_listings as (
        select id
        from public.sniper_listings
        where watchlist_evaluated_at is null
          and currency = 'EUR'
          and item_price > 0
          and item_price < 'Infinity'::numeric
          and catalog_id is not null
        order by first_seen_at desc, id desc
        limit (p_batch_size - v_processed)
        for update skip locked
    ), pending as materialized (
        select listing.*
        from public.sniper_listings as listing
        join target_listings on target_listings.id = listing.id
    ), groups as (
        select distinct catalog_id, lower(btrim(brand)) as brand, condition from pending
    ), benchmarks as materialized (
        select groups.*, reference.reference_price, reference.reference_scope
        from groups cross join lateral public.sniper_reference_price(groups.catalog_id, groups.brand, groups.condition) as reference
        where reference.reference_price > 0
    ), evaluated as materialized (
        select pending.*, benchmarks.reference_price, benchmarks.reference_scope
        from pending join benchmarks on benchmarks.catalog_id = pending.catalog_id
            and benchmarks.brand is not distinct from lower(btrim(pending.brand))
            and benchmarks.condition is not distinct from pending.condition
    ), inserted as (
        insert into public.sniper_watchlist_hits(watchlist_id, listing_id, reference_price, reference_scope, discount_percent)
        select watchlist.id, listing.id, evaluated.reference_price, evaluated.reference_scope,
            round((1 - listing.item_price / evaluated.reference_price) * 100, 2)
        from evaluated join public.sniper_listings as listing on listing.id = evaluated.id
        join public.sniper_watchlists as watchlist on watchlist.is_active
            and listing.first_seen_at >= watchlist.starts_at
            and public.sniper_watchlist_matches(watchlist, listing)
        where listing.item_price <= evaluated.reference_price * (1 - watchlist.discount_threshold_percent / 100)
        on conflict (watchlist_id, listing_id) do nothing returning 1
    ), marked as (
        update public.sniper_listings set watchlist_evaluated_at = now()
        where id in (select id from evaluated) returning 1
    )
    select
        v_processed + coalesce((select count(*)::integer from marked), 0),
        coalesce((select count(*)::integer from inserted), 0)
    into v_processed, v_created;

    return jsonb_build_object('processed', v_processed, 'hits', v_created);
end;
$$;

comment on function public.sniper_evaluate_pending_watchlist_hits(integer) is
    'Bewertet paketweise ausstehende Angebote unabhaengig von Vinted-Abfragen. Frische Funde werden priorisiert; abgelaufene (>14 Tage) oder ungueltige Angebote werden bereinigt.';

revoke all on function public.sniper_evaluate_pending_watchlist_hits(integer) from public, anon, authenticated;
grant execute on function public.sniper_evaluate_pending_watchlist_hits(integer) to service_role;
