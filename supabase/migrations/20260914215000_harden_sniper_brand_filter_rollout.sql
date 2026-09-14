-- zweck: aktivierung und rollout alter vinted-adminaufrufe auf reine
-- markenfilter begrenzen.
-- betroffen: public.set_sniper_query_active und die alte rpc-signatur von
-- public.upsert_sniper_query.
-- bestehende auftraege und funde bleiben erhalten; nicht passende alte
-- auftraege koennen nur noch pausiert werden.
-- migration unit 1: function_changes
-- transaction mode: transactional
-- boundary reason: default

create or replace function public.upsert_sniper_query(
    p_id uuid,
    p_search_text text,
    p_catalog_id integer,
    p_brand_id integer,
    p_price_from numeric,
    p_price_to numeric,
    p_poll_interval_ms integer,
    p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.upsert_sniper_query(uuid, text, integer, integer, numeric, numeric, integer, text) from public, anon, authenticated;
grant execute on function public.upsert_sniper_query(uuid, text, integer, integer, numeric, numeric, integer, text) to authenticated;

create or replace function public.set_sniper_query_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_platform_operator() then
        raise exception 'Nur die Administration darf Sammelauftraege verwalten' using errcode = '42501';
    end if;
    if p_active is null then
        raise exception 'Bitte den gewuenschten Status angeben';
    end if;
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
        select 1
        from public.sniper_runtime_status
        where id = 1
          and reported_at >= now() - interval '2 minutes'
    ) then
        raise exception 'Keine aktuelle Betriebsmeldung. Bitte zuerst den Bot starten oder aktualisieren';
    end if;
    update public.sniper_queries
    set is_active = p_active,
        consecutive_failures = case when p_active then 0 else consecutive_failures end,
        updated_at = now()
    where id = p_id;
    if not found then
        raise exception 'Sammelauftrag nicht gefunden';
    end if;
end;
$$;

revoke all on function public.set_sniper_query_active(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_sniper_query_active(uuid, boolean) to authenticated;
