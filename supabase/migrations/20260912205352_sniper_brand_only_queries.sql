-- Zweck: Reine Markenauftraege ohne Kategorie, Suchbegriff oder Preisgrenze zulassen.
-- Betroffen: sniper_queries_filter_required und upsert_sniper_query.
-- Die bisherige Pruefbedingung wird innerhalb derselben Release-Transaktion
-- ersetzt. Es werden keine Auftraege angelegt oder Daten geloescht.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

alter table public.sniper_queries
  drop constraint sniper_queries_filter_required;

create or replace function public.upsert_sniper_query (
  p_id               uuid,
  p_search_text      text,
  p_catalog_id       integer,
  p_brand_id         integer,
  p_price_from       numeric,
  p_price_to         numeric,
  p_poll_interval_ms integer,
  p_notes            text
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
    v_id uuid;
    v_key text;
    v_existing public.sniper_queries;
begin
    if not public.is_platform_operator() then
        raise exception 'Nur die Administration darf Sammelauftraege verwalten' using errcode = '42501';
    end if;
    p_search_text := nullif(lower(btrim(regexp_replace(p_search_text, '\s+', ' ', 'g'))), '');
    p_notes := nullif(btrim(p_notes), '');
    p_price_from := round(p_price_from, 2);
    p_price_to := round(p_price_to, 2);
    if p_search_text is null and p_catalog_id is null and p_brand_id is null then
        raise exception 'Bitte Kategorie, Marke oder Suchbegriff angeben';
    end if;
    if p_catalog_id is not null and not exists (
        select 1 from public.vinted_categories where id = p_catalog_id and is_leaf
    ) then raise exception 'Bitte eine gespeicherte Unterkategorie waehlen'; end if;
    if p_brand_id is not null and p_brand_id <= 0 then raise exception 'Ungueltige Markenkennung'; end if;
    if length(p_search_text) > 200 or length(p_notes) > 2000 then raise exception 'Suchbegriff oder Notiz ist zu lang'; end if;
    if p_price_from::text in ('NaN', 'Infinity', '-Infinity') or p_price_to::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception 'Ungueltiger Preis';
    end if;
    if p_poll_interval_ms is null or p_poll_interval_ms < 10000 or p_poll_interval_ms > 86400000 then
        raise exception 'Der Takt muss zwischen 10 Sekunden und 24 Stunden liegen';
    end if;
    v_key := concat_ws('|', 'vinted', 'search=' || coalesce(p_search_text, ''),
        'catalog=' || coalesce(p_catalog_id::text, '-'), 'brand=' || coalesce(p_brand_id::text, '-'),
        'price_from=' || coalesce(trim_scale(p_price_from)::text, '-'),
        'price_to=' || coalesce(trim_scale(p_price_to)::text, '-'));
    if p_id is null then
        insert into public.sniper_queries (query_key, search_text, catalog_id, brand_id, price_from, price_to, poll_interval_ms, notes, is_active)
        values (v_key, p_search_text, p_catalog_id, p_brand_id, p_price_from, p_price_to, p_poll_interval_ms, p_notes, false)
        returning id into v_id;
    else
        select * into v_existing from public.sniper_queries where id = p_id for update;
        if not found then raise exception 'Sammelauftrag nicht gefunden'; end if;
        -- Filter bleiben unveraenderlich: Sonst wuerden alte Funde und ihre
        -- Preisvergleiche nachtraeglich einem anderen Zuschnitt zugeordnet.
        if v_existing.query_key <> v_key then
            raise exception 'Fuer andere Filter bitte einen neuen Auftrag anlegen';
        end if;
        update public.sniper_queries set poll_interval_ms = p_poll_interval_ms, notes = p_notes, updated_at = now()
        where id = p_id;
        v_id := p_id;
    end if;
    return v_id;
exception when unique_violation then
    raise exception 'Ein Auftrag mit diesen Filtern besteht bereits';
end;
$function$;

alter table public.sniper_queries
  add constraint sniper_queries_filter_required check (nullif(btrim(search_text), ''::text) is not null or catalog_id is not null or brand_id is not null and brand_id > 0);