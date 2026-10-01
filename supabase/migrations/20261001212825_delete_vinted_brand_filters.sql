-- Zweck: Zentrale Markenfilter entfernen, ohne vorhandene Funde zu verlieren.
-- Betroffen: public.sniper_queries.deleted_at und die Verwaltungsfunktionen.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.delete_sniper_query (
  p_id uuid
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
    if not public.is_platform_operator() then
        raise exception 'Nur die Administration darf Sammelauftraege verwalten' using errcode = '42501';
    end if;
    update public.sniper_queries set is_active = false, deleted_at = now(), updated_at = now()
        where id = p_id and deleted_at is null;
    if not found then raise exception 'Sammelauftrag nicht gefunden'; end if;
end;
$function$;

comment on function public.delete_sniper_query(uuid) is 'Entfernt einen zentralen Filter aus der Verwaltung und stoppt weitere Abrufe; vorhandene Funde und ihre Herkunft bleiben erhalten.';

revoke all on function public.delete_sniper_query(uuid) from public;

grant all on function public.delete_sniper_query(uuid) to authenticated;

grant all on function public.delete_sniper_query(uuid) to service_role;

create or replace function public.set_sniper_query_active (
  p_id     uuid,
  p_active boolean
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
    if not public.is_platform_operator() then
        raise exception 'Nur die Administration darf Sammelauftraege verwalten' using errcode = '42501';
    end if;
    if p_active is null then raise exception 'Bitte den gewuenschten Status angeben'; end if;
    if p_active and not exists (
        select 1
        from public.sniper_queries
        where id = p_id
          and marketplace = 'vinted'
          and search_text is null
          and catalog_id is null
          and brand_id is not null
          and price_from is null
          and price_to is null
    ) then
        raise exception 'Nur reine Markenfilter koennen aktiviert werden';
    end if;
    if p_active and not exists (
        select 1 from public.sniper_runtime_status where id = 1 and reported_at >= now() - interval '2 minutes'
    ) then
        raise exception 'Keine aktuelle Betriebsmeldung. Bitte zuerst den Bot starten oder aktualisieren';
    end if;
    update public.sniper_queries set is_active = p_active,
        run_state = case when p_active then 'ready' else run_state end,
        next_attempt_at = case when p_active then null else next_attempt_at end,
        consecutive_failures = case when p_active then 0 else consecutive_failures end,
        updated_at = now()
    where id = p_id and deleted_at is null;
    if not found then raise exception 'Sammelauftrag nicht gefunden'; end if;
end;
$function$;

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
begin
    if nullif(btrim(p_search_text), '') is not null
        or p_catalog_id is not null
        or p_price_from is not null
        or p_price_to is not null then
        raise exception 'Die Administration verwaltet nur Markenfilter';
    end if;
    return public.upsert_sniper_query(
        p_id,
        'Marke ' || coalesce(p_brand_id::text, 'unbekannt'),
        p_brand_id,
        p_poll_interval_ms,
        p_notes
    );
end;
$function$;

create or replace function public.upsert_sniper_query (
  p_id               uuid,
  p_title            text,
  p_brand_id         integer,
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
    p_title := nullif(btrim(regexp_replace(p_title, '\s+', ' ', 'g')), '');
    p_notes := nullif(btrim(p_notes), '');
    if p_title is null then raise exception 'Bitte einen Filtername angeben'; end if;
    if length(p_title) > 100 then raise exception 'Der Filtername darf hoechstens 100 Zeichen lang sein'; end if;
    if p_brand_id is null or p_brand_id <= 0 then raise exception 'Ungueltige Markenkennung'; end if;
    if length(p_notes) > 2000 then raise exception 'Die Notiz darf hoechstens 2.000 Zeichen lang sein'; end if;
    if p_poll_interval_ms is null or p_poll_interval_ms < 10000 or p_poll_interval_ms > 86400000 then
        raise exception 'Der Takt muss zwischen 10 Sekunden und 24 Stunden liegen';
    end if;
    v_key := concat_ws('|', 'vinted', 'search=', 'catalog=-', 'brand=' || p_brand_id::text,
        'price_from=-', 'price_to=-');
    if p_id is null then
        -- Die technische Herkunft alter Funde bleibt erhalten. Eine erneut
        -- hinzugefuegte Marke nutzt denselben Auftrag und startet pausiert.
        select * into v_existing from public.sniper_queries
            where query_key = v_key and deleted_at is not null for update;
        if found then
            update public.sniper_queries set title = p_title,
                poll_interval_ms = p_poll_interval_ms, notes = p_notes,
                deleted_at = null, is_active = false, updated_at = now()
                where id = v_existing.id;
            return v_existing.id;
        end if;
        insert into public.sniper_queries (query_key, title, search_text, catalog_id, brand_id, price_from, price_to, poll_interval_ms, notes, is_active)
        values (v_key, p_title, null, null, p_brand_id, null, null, p_poll_interval_ms, p_notes, false)
        returning id into v_id;
    else
        select * into v_existing from public.sniper_queries where id = p_id and deleted_at is null for update;
        if not found then raise exception 'Sammelauftrag nicht gefunden'; end if;
        -- Ein Auftrag bleibt eine reine Markensuche. Alte Sammelauftraege mit
        -- weiteren Filtern bleiben lesbar, koennen hier aber nicht umgedeutet werden.
        if v_existing.marketplace <> 'vinted'
            or v_existing.query_key is distinct from v_key
            or v_existing.brand_id is distinct from p_brand_id
            or v_existing.search_text is not null
            or v_existing.catalog_id is not null
            or v_existing.price_from is not null
            or v_existing.price_to is not null then
            raise exception 'Nur reine Markenfilter koennen bearbeitet werden';
        end if;
        update public.sniper_queries set title = p_title, poll_interval_ms = p_poll_interval_ms, notes = p_notes, updated_at = now()
        where id = p_id;
        v_id := p_id;
    end if;
    return v_id;
exception when unique_violation then
    raise exception 'Ein Markenfilter fuer diese Marke besteht bereits';
end;
$function$;

alter table public.sniper_queries
  add column deleted_at timestamp with time zone;

alter table public.sniper_queries
  add constraint sniper_queries_deleted_inactive check (deleted_at is null or not is_active);