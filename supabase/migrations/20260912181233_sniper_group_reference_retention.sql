-- Zweck: Gruppenbasierte Referenzpreise und 30 Tage Aufbewahrung fuer Vinted.
-- Betroffen: sniper_hits.reference_scope/Index, Bewertungs- und Bereinigungsfunktionen.
-- Generiert mit Supabase db diff; Schreibweise und explizite ACL-Entzuege geprueft.
-- Historische Default-Grants an authenticated muessen bei neuen Funktionen
-- ausdruecklich entzogen werden; pgdelta erfasst diesen Entzug nicht vollstaendig.
-- Der abschliessende Tabellenentzug gleicht bereits deklarierte Leserechte an.
-- Diese Migration loescht keine Angebote. Erst der aktualisierte Dienst ruft
-- die paketweise Loeschfunktion auf (Treffer werden per Fremdschluessel geloescht).
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create or replace function public.sniper_evaluate_hits (
  p_query_id    uuid,
  p_report_hits boolean default true
)
  returns integer
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_created integer;
begin
  with offen as (
      select listing.id, listing.condition, listing.item_price, listing.currency,
             nullif(lower(btrim(listing.brand)), '') as brand
      from public.sniper_listings as listing
      where listing.discovered_by_query_id = p_query_id
        and listing.evaluated_at is null
  ),
  -- Je Marke/Zustand einmal rechnen statt fuer jedes Angebot erneut.
  zustaende as (
      select distinct offen.brand, offen.condition from offen
  ),
  massstaebe as (
      select zustaende.brand, zustaende.condition, massstab.reference_price, massstab.reference_scope
      from zustaende
      cross join lateral public.sniper_reference_price(
          (select catalog_id from public.sniper_queries where id = p_query_id),
          zustaende.brand, zustaende.condition
      ) as massstab
      where massstab.reference_price is not null
        and massstab.reference_price > 0
  ),
  bewertbar as (
      select offen.id, offen.item_price, massstaebe.reference_price, massstaebe.reference_scope
      from offen
      join massstaebe
        on massstaebe.condition is not distinct from offen.condition
       and massstaebe.brand is not distinct from offen.brand
      where offen.currency = 'EUR'
        and offen.item_price > 0
        and offen.item_price < 'Infinity'::numeric
  ),
  kandidaten as (
      select
          subscription.id as subscription_id,
          bewertbar.id as listing_id,
          bewertbar.reference_price,
          bewertbar.reference_scope,
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
          (subscription_id, listing_id, reference_price, discount_percent, reference_scope)
      select subscription_id, listing_id, reference_price, discount_percent, reference_scope
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

create function public.sniper_purge_expired_listings (
  p_batch_size integer default 1000
)
  returns integer
  language plpgsql
  set search_path to ''
  as $function$
declare
    v_deleted integer;
begin
    if p_batch_size is null or p_batch_size not between 1 and 5000 then
        raise exception 'Die Paketgroesse muss zwischen 1 und 5000 liegen.' using errcode = '22023';
    end if;

    with expired as (
        select id from public.sniper_listings
        where first_seen_at < now() - interval '30 days'
        order by first_seen_at, id
        limit p_batch_size
        for update skip locked
    ), deleted as (
        delete from public.sniper_listings as listing
        using expired
        where listing.id = expired.id
        returning listing.id
    )
    select count(*)::integer into v_deleted from deleted;
    return v_deleted;
end;
$function$;

comment on function public.sniper_purge_expired_listings(integer) is 'Loescht paketweise Angebote nach 30 Tagen seit Erstfund samt zugehoerigen Treffern. Nur der Dienst darf die Bereinigung ausloesen.';

revoke all on function public.sniper_purge_expired_listings(integer) from public, anon, authenticated;

grant all on function public.sniper_purge_expired_listings(integer) to service_role;

create function public.sniper_reference_price (
  p_catalog_id integer,
  p_brand      text,
  p_condition  text
)
  returns table (
    reference_price numeric,
    sample_size     integer,
    unusable_reason text,
    reference_scope text
  )
  language sql
  stable
  set search_path to ''
  as $function$
    with samples as materialized (
        select listing.item_price, query.price_to,
               nullif(lower(btrim(listing.brand)), '') as brand
        from public.sniper_listings as listing
        join public.sniper_queries as query on query.id = listing.discovered_by_query_id
        where query.catalog_id = p_catalog_id
          and query.marketplace = 'vinted'
          and listing.marketplace = 'vinted'
          and listing.condition is not distinct from p_condition
          and listing.first_seen_at >= now() - interval '14 days'
          and listing.currency = 'EUR'
          and listing.item_price > 0
          and listing.item_price < 'Infinity'::numeric
    ),
    selection as (
        select nullif(lower(btrim(p_brand)), '') is not null
           and count(*) filter (where brand = nullif(lower(btrim(p_brand)), '')) >= 8
           as use_brand
        from samples
    ),
    statistics as (
        select count(*)::integer as n,
               percentile_cont(0.5) within group (order by item_price)::numeric(12, 2) as median,
               count(*) filter (where price_to is not null and item_price >= price_to) as at_limit
        from samples
        where not (select use_brand from selection)
           or brand = nullif(lower(btrim(p_brand)), '')
    ),
    result as (
        select *, case
            when p_catalog_id is null then 'unknown_category'
            when n < 8 then 'too_few'
            when at_limit::numeric / greatest(n, 1) > 1.0 / 3.0 then 'at_price_ceiling'
            else null
        end as reason
        from statistics
    )
    select case when reason is null then median else null end, n, reason,
           case when (select use_brand from selection)
                then 'category_brand_condition' else 'category_condition' end
    from result;
$function$;

comment on function public.sniper_reference_price(integer,text,text) is '14-Tage-Median aus mindestens acht EUR-Angeboten derselben Kategorie, Marke und desselben Zustands. Bei zu kleiner Markengruppe Rueckfall auf Kategorie/Zustand. Preislimit jedes Entdeckungsauftrags beachten.';

revoke all on function public.sniper_reference_price(integer, text, text) from public, anon, authenticated;

grant all on function public.sniper_reference_price(integer, text, text) to service_role;

alter table public.sniper_hits
  add column reference_scope text default 'legacy_query_condition'::text not null;

comment on column public.sniper_hits.reference_scope is 'Gespeicherte Vergleichsgruppe: Kategorie/Marke/Zustand, Rueckfall Kategorie/Zustand oder unveraenderte historische Abfragebewertung.';

alter table public.sniper_hits
  add constraint sniper_hits_reference_scope_check
    check (reference_scope = any (array['legacy_query_condition'::text, 'category_brand_condition'::text, 'category_condition'::text]));

create index idx_sniper_hits_listing on public.sniper_hits (listing_id);

revoke delete, insert, maintain, references, trigger, truncate, update on public.sniper_runtime_status from authenticated;
