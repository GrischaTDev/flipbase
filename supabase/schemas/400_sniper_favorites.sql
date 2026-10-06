-- Persönliche Merklisten bleiben unabhängig vom kurzlebigen gemeinsamen Feed erhalten.
-- Kein Fremdschlüssel auf sniper_listings: dessen Bereinigung darf Favoriten nie löschen.
create table public.sniper_favorites (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    external_id text not null check (external_id ~ '^[0-9]{1,30}$'),
    snapshot jsonb,
    saved_at timestamptz not null default now(),
    removed_at timestamptz,
    unique (user_id, workspace_id, external_id),
    check ((removed_at is null and snapshot is not null) or (removed_at is not null and snapshot is null))
);
comment on table public.sniper_favorites is
    'Persönliche Account-Favoriten je Workspace. Eigenständige Artikelkopie ohne Ablaufdatum. Nach manuellem Entfernen bleibt nur die Kennung als Schutz vor erneuten Altimporten.';
create index sniper_favorites_workspace_idx on public.sniper_favorites(workspace_id);
create index sniper_favorites_page_idx on public.sniper_favorites(user_id, workspace_id, saved_at desc, id desc)
    where removed_at is null;
alter table public.sniper_favorites enable row level security;
create policy "Eigene Favoriten lesen" on public.sniper_favorites for select to authenticated
    using (user_id = (select auth.uid()) and public.can_access_workspace(workspace_id));
revoke all on public.sniper_favorites from public, anon, authenticated;
grant select on public.sniper_favorites to authenticated;
grant all on public.sniper_favorites to service_role;

create function public.sniper_check_favorite_scope(p_workspace_id uuid, p_expected_user_id uuid)
returns uuid language plpgsql stable security invoker set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
    if v_user is null or v_user is distinct from p_expected_user_id
       or not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diese persönlichen Favoriten.' using errcode = '42501';
    end if;
    return v_user;
end;
$$;
revoke all on function public.sniper_check_favorite_scope(uuid, uuid) from public, anon;
grant execute on function public.sniper_check_favorite_scope(uuid, uuid) to authenticated;

-- Altbestände können bereits aus dem Feed gelöscht sein. Der Import übernimmt nur
-- diese begrenzten Felder; Browserdaten ändern niemals den gemeinsamen Artikelbestand.
create function public.sniper_normalize_favorite_item(p_item jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
    v_external text;
    v_id uuid;
    v_first_seen timestamptz;
    v_price numeric;
    v_total numeric;
    v_images jsonb;
    v_field text;
begin
    if p_item is null or jsonb_typeof(p_item) <> 'object' or pg_column_size(p_item) > 65536
       or jsonb_typeof(p_item->'id') is distinct from 'string'
       or jsonb_typeof(p_item->'title') is distinct from 'string'
       or length(btrim(p_item->>'title')) not between 1 and 500
       or jsonb_typeof(p_item->'url') is distinct from 'string'
       or length(p_item->>'url') > 2048
       or jsonb_typeof(p_item->'currency') is distinct from 'string'
       or (p_item->>'currency') !~ '^[A-Z]{3}$'
       or jsonb_typeof(p_item->'item_price') is distinct from 'number'
       or jsonb_typeof(p_item->'total_price') is distinct from 'number'
       or jsonb_typeof(p_item->'first_seen_at') is distinct from 'string'
       or jsonb_typeof(p_item->'image_urls') is distinct from 'array' then
        raise exception 'Ungültige Artikeldaten für den Favoriten.' using errcode = '22023';
    end if;
    v_external := substring(p_item->>'url' from '^https://www\.vinted\.de/items/([0-9]{1,30})(?:-|/|\?|#|$)');
    if v_external is null or jsonb_array_length(p_item->'image_urls') > 20 then
        raise exception 'Ungültiger Vinted-Link oder zu viele Bilder.' using errcode = '22023';
    end if;
    begin
        v_id := (p_item->>'id')::uuid;
        v_first_seen := (p_item->>'first_seen_at')::timestamptz;
        v_price := (p_item->>'item_price')::numeric;
        v_total := (p_item->>'total_price')::numeric;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
        raise exception 'Ungültige Kennung, Zeit oder Preisangabe.' using errcode = '22023';
    end;
    if not isfinite(v_first_seen) or v_price not between 0 and 10000000 or v_total not between 0 and 10000000 then
        raise exception 'Ungültiger Fundzeitpunkt oder Preis.' using errcode = '22023';
    end if;
    foreach v_field in array array['brand','size','condition','reference_scope','watchlist_title','category_path'] loop
        if p_item->v_field is not null and p_item->v_field <> 'null'::jsonb and
           (jsonb_typeof(p_item->v_field) <> 'string' or length(p_item->>v_field) > case when v_field='category_path' then 1000 else 200 end) then
            raise exception 'Ungültige Artikelmerkmale.' using errcode = '22023';
        end if;
    end loop;
    foreach v_field in array array['reference_price','discount_percent','catalog_id'] loop
        if p_item->v_field is not null and p_item->v_field <> 'null'::jsonb and jsonb_typeof(p_item->v_field) <> 'number' then
            raise exception 'Ungültige Vergleichsangabe.' using errcode = '22023';
        end if;
    end loop;
    select coalesce(jsonb_agg(image), '[]'::jsonb) into v_images
    from jsonb_array_elements(p_item->'image_urls') image
    where jsonb_typeof(image)='string' and length(image #>> '{}') <= 2048
      and (image #>> '{}') ~ '^https://[a-zA-Z0-9.-]+\.vinted\.net/';
    return jsonb_build_object(
        'id', v_id, 'title', btrim(p_item->>'title'), 'url', p_item->>'url', 'image_urls', v_images,
        'item_price', v_price, 'total_price', v_total, 'currency', p_item->>'currency',
        'first_seen_at', v_first_seen, 'brand', p_item->'brand', 'size', p_item->'size',
        'condition', p_item->'condition', 'catalog_id', p_item->'catalog_id', 'category_path', p_item->'category_path',
        'reference_price', p_item->'reference_price', 'reference_scope', p_item->'reference_scope',
        'discount_percent', p_item->'discount_percent', 'watchlist_title', p_item->'watchlist_title',
        'is_hidden', coalesce(p_item->'is_hidden' = 'true'::jsonb, false));
end;
$$;
revoke all on function public.sniper_normalize_favorite_item(jsonb) from public, anon, authenticated;

create function public.save_sniper_favorite(p_workspace_id uuid, p_expected_user_id uuid, p_item jsonb, p_import_only boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_item jsonb; v_external text;
begin
    v_user := public.sniper_check_favorite_scope(p_workspace_id, p_expected_user_id);
    v_item := public.sniper_normalize_favorite_item(p_item);
    v_external := substring(v_item->>'url' from '^https://www\.vinted\.de/items/([0-9]{1,30})(?:-|/|\?|#|$)');
    if p_import_only then
        -- Auch entfernte Einträge kollidieren: Ein altes Tablet darf sie nicht wiederherstellen.
        insert into public.sniper_favorites(user_id, workspace_id, external_id, snapshot)
        values (v_user, p_workspace_id, v_external, v_item)
        on conflict (user_id, workspace_id, external_id) do nothing;
    else
        insert into public.sniper_favorites(user_id, workspace_id, external_id, snapshot)
        values (v_user, p_workspace_id, v_external, v_item)
        on conflict (user_id, workspace_id, external_id) do update set
            snapshot = case when sniper_favorites.removed_at is null then sniper_favorites.snapshot else excluded.snapshot end,
            saved_at = case when sniper_favorites.removed_at is null then sniper_favorites.saved_at else excluded.saved_at end,
            removed_at = null;
    end if;
    return true;
end;
$$;
revoke all on function public.save_sniper_favorite(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_sniper_favorite(uuid, uuid, jsonb, boolean) to authenticated;

create function public.remove_sniper_favorite(p_workspace_id uuid, p_expected_user_id uuid, p_external_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
    v_user := public.sniper_check_favorite_scope(p_workspace_id, p_expected_user_id);
    if p_external_id is null or p_external_id !~ '^[0-9]{1,30}$' then
        raise exception 'Ungültige Artikelkennung.' using errcode = '22023';
    end if;
    insert into public.sniper_favorites(user_id, workspace_id, external_id, snapshot, removed_at)
    values (v_user, p_workspace_id, p_external_id, null, now())
    on conflict (user_id, workspace_id, external_id) do update set snapshot=null, removed_at=now();
    return true;
end;
$$;
revoke all on function public.remove_sniper_favorite(uuid, uuid, text) from public, anon;
grant execute on function public.remove_sniper_favorite(uuid, uuid, text) to authenticated;

create function public.clear_sniper_favorites(p_workspace_id uuid, p_expected_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
    v_user := public.sniper_check_favorite_scope(p_workspace_id, p_expected_user_id);
    update public.sniper_favorites set snapshot=null, removed_at=now()
    where user_id=v_user and workspace_id=p_workspace_id and removed_at is null;
    return true;
end;
$$;
revoke all on function public.clear_sniper_favorites(uuid, uuid) from public, anon;
grant execute on function public.clear_sniper_favorites(uuid, uuid) to authenticated;

create function public.import_sniper_favorites(p_workspace_id uuid, p_expected_user_id uuid, p_items jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_count integer := 0;
begin
    perform public.sniper_check_favorite_scope(p_workspace_id, p_expected_user_id);
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception 'Ungültige Importliste.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_items) not between 1 and 50 then
        raise exception 'Ein Importpaket darf 1 bis 50 Favoriten enthalten.' using errcode = '22023';
    end if;
    for v_item in select value from jsonb_array_elements(p_items) loop
        perform public.save_sniper_favorite(p_workspace_id, p_expected_user_id, v_item, true);
        v_count := v_count + 1;
    end loop;
    return v_count;
end;
$$;
revoke all on function public.import_sniper_favorites(uuid, uuid, jsonb) from public, anon;
grant execute on function public.import_sniper_favorites(uuid, uuid, jsonb) to authenticated;

create function public.sniper_favorites_page(p_workspace_id uuid, p_expected_user_id uuid, p_before_time timestamptz default null, p_before_id uuid default null, p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_user uuid; v_result jsonb;
begin
    v_user := public.sniper_check_favorite_scope(p_workspace_id, p_expected_user_id);
    if p_limit is null or p_limit not between 1 and 200 or (p_before_time is null) <> (p_before_id is null) then
        raise exception 'Ungültige Seitengröße oder Position.' using errcode = '22023';
    end if;
    with candidates as materialized (
        select id, snapshot, saved_at from public.sniper_favorites
        where user_id=v_user and workspace_id=p_workspace_id and removed_at is null
          and (p_before_time is null or (saved_at,id) < (p_before_time,p_before_id))
        order by saved_at desc,id desc limit p_limit+1
    ), page as materialized (
        select * from candidates order by saved_at desc,id desc limit p_limit
    )
    select jsonb_build_object('items',coalesce((select jsonb_agg(snapshot order by saved_at desc,id desc) from page),'[]'::jsonb),
        'next_cursor',case when (select count(*) from candidates)>p_limit
            then (select jsonb_build_object('time',saved_at,'id',id) from page order by saved_at,id limit 1) else null end)
    into v_result;
    return v_result;
end;
$$;
revoke all on function public.sniper_favorites_page(uuid, uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.sniper_favorites_page(uuid, uuid, timestamptz, uuid, integer) to authenticated;
