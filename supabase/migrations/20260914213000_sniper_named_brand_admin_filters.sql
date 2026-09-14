-- zweck: zentrale vinted-sammelauftraege in benannte markenfilter umstellen.
-- betroffen: public.sniper_queries.title und public.upsert_sniper_query.
-- bestehende auftraege, funde und schluessel bleiben erhalten.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

alter table public.sniper_queries
    add column title text default 'Markenfilter';

update public.sniper_queries
set title = left(
    case
        when search_text is null
            and catalog_id is null
            and brand_id = 53
            and price_from is null
            and price_to is null then 'Nike'
        when search_text is null
            and catalog_id is null
            and brand_id = 14
            and price_from is null
            and price_to is null then 'adidas'
        when search_text is null
            and catalog_id is null
            and brand_id = 88
            and price_from is null
            and price_to is null then 'Ralph Lauren'
        when search_text is null
            and catalog_id is null
            and brand_id is not null
            and price_from is null
            and price_to is null then 'Marke ' || brand_id::text
        when nullif(btrim(search_text), '') is not null then 'Suche ' || btrim(search_text)
        when catalog_id is not null then 'Kategorie ' || catalog_id::text
        else 'Bestehender Sammelauftrag ' || left(id::text, 8)
    end,
    100
)
where title is null or btrim(title) = '' or title = 'Markenfilter';

alter table public.sniper_queries
    alter column title set not null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.sniper_queries'::regclass
          and conname = 'sniper_queries_title_valid'
    ) then
        alter table public.sniper_queries
            add constraint sniper_queries_title_valid
            check (length(btrim(title)) between 1 and 100);
    end if;
end;
$$;

comment on column public.sniper_queries.title is
    'Anzeigename des zentralen Markenfilters in der Administration.';

drop function if exists public.upsert_sniper_query(uuid, text, integer, integer, numeric, numeric, integer, text);

create function public.upsert_sniper_query(
    p_id uuid,
    p_title text,
    p_brand_id integer,
    p_poll_interval_ms integer,
    p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

    if p_title is null then
        raise exception 'Bitte einen Filtername angeben';
    end if;
    if length(p_title) > 100 then
        raise exception 'Der Filtername darf hoechstens 100 Zeichen lang sein';
    end if;
    if p_brand_id is null or p_brand_id <= 0 then
        raise exception 'Ungueltige Markenkennung';
    end if;
    if p_notes is not null and length(p_notes) > 2000 then
        raise exception 'Die Notiz darf hoechstens 2.000 Zeichen lang sein';
    end if;
    if p_poll_interval_ms is null or p_poll_interval_ms < 10000 or p_poll_interval_ms > 86400000 then
        raise exception 'Der Takt muss zwischen 10 Sekunden und 24 Stunden liegen';
    end if;

    v_key := 'vinted|search=|catalog=-|brand=' || p_brand_id::text || '|price_from=-|price_to=-';

    if p_id is null then
        insert into public.sniper_queries (
            query_key,
            title,
            search_text,
            catalog_id,
            brand_id,
            price_from,
            price_to,
            poll_interval_ms,
            notes,
            is_active
        )
        values (v_key, p_title, null, null, p_brand_id, null, null, p_poll_interval_ms, p_notes, false)
        returning id into v_id;
    else
        select *
        into v_existing
        from public.sniper_queries
        where id = p_id
        for update;

        if not found then
            raise exception 'Sammelauftrag nicht gefunden';
        end if;
        if v_existing.marketplace <> 'vinted'
            or v_existing.query_key is distinct from v_key
            or v_existing.search_text is not null
            or v_existing.catalog_id is not null
            or v_existing.brand_id is distinct from p_brand_id
            or v_existing.price_from is not null
            or v_existing.price_to is not null then
            raise exception 'Nur reine Markenfilter koennen bearbeitet werden';
        end if;

        update public.sniper_queries
        set title = p_title,
            poll_interval_ms = p_poll_interval_ms,
            notes = p_notes,
            updated_at = now()
        where id = p_id;
        v_id := p_id;
    end if;

    return v_id;
exception
    when unique_violation then
        raise exception 'Ein Markenfilter fuer diese Marke besteht bereits';
end;
$$;

revoke all on function public.upsert_sniper_query(uuid, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.upsert_sniper_query(uuid, text, integer, integer, text) to authenticated;
