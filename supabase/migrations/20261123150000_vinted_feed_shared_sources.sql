-- Persönliche Vinted-Feeds aus gemeinsamen Haupt- und Kategoriequellen.
-- Betroffen:
--   public.sniper_watchlists: neue Spalten user_id, brand_id, is_active, started_at; alte Suchfilter entfallen.
--   public.sniper_queries: bisherige zentrale Sammelaufträge werden gestoppt; Quellen mit Schlüssel vinted-source|… kommen hinzu.
--   public.sniper_listings: Lesen nur noch über public.sniper_feed_search; volle Karten nach 15 Minuten.
--   public.sniper_feed_settings, public.sniper_recent_listing_keys (neu);
--   Sichten public.sniper_needed_feed_sources und public.sniper_active_feed_sources (neu).
--   Entfallen: KI-Suche (public.vinted_ai_searches) und Preisvergleich (public.vinted_comparison_*),
--   jeweils mit ihren Funktionen und dem Trigger capture_vinted_comparison_feed.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set local check_function_bodies = false;

-- Der Sniper und der Feed greifen im Sekundentakt in wechselnder Reihenfolge auf diese Tabellen zu.
-- Alle Sperren werden deshalb vorab gemeinsam und ohne Warten geholt; ein Fehlversuch gibt sie
-- vollständig wieder frei. So kann die Migration nicht mit laufenden Abrufen verklemmen.
do $$
declare
    v_attempt integer := 0;
begin
    loop
        v_attempt := v_attempt + 1;
        begin
            lock table public.sniper_queries, public.sniper_listings, public.sniper_query_matches,
                public.sniper_watchlists, public.vinted_comparison_scopes, public.vinted_comparison_items,
                public.vinted_comparison_matches, public.vinted_ai_searches in access exclusive mode nowait;
            lock table public.workspace_members, public.workspaces in share row exclusive mode nowait;
            exit;
        exception when lock_not_available then
            if v_attempt >= 600 then
                raise exception 'Die Sniper-Tabellen waren 120 Sekunden lang nicht frei.' using errcode = '55P03';
            end if;
            perform pg_catalog.pg_sleep(0.2);
        end;
    end loop;
end;
$$;

-- Destruktiv: Die KI-Suche entfällt samt Nutzungszählern. Auf Entscheidung des Nutzers vom
-- 23.11.2026 ohne Sicherung.
drop function public.reserve_vinted_ai_search(uuid, uuid, uuid, text, text);
drop function public.vinted_ai_search_usage(uuid);
drop table public.vinted_ai_searches;

-- Destruktiv: Der Preisvergleich entfällt samt gesammelter Vergleichsartikel. Ohne Sicherung.
drop trigger capture_vinted_comparison_feed on public.sniper_listings;
drop function public.capture_vinted_comparison_feed();
drop function public.claim_vinted_comparison_task(timestamptz);
drop function public.complete_vinted_comparison_task(text, uuid, jsonb);
drop function public.fail_vinted_comparison_task(text, uuid, timestamptz, text, text);
drop function public.vinted_comparison_market(uuid, text, integer, text);
drop table public.vinted_comparison_matches;
drop table public.vinted_comparison_items;
drop table public.vinted_comparison_scopes;

-- Destruktiv: Alte gespeicherte Suchfilter gehörten dem ganzen Arbeitsbereich und werden nicht
-- übernommen. Alle Nutzer beginnen mit einem leeren Feed. Favoriten bleiben unberührt.
delete from public.sniper_watchlists;

-- Die bisherigen zentralen Sammelaufträge und Kategorie-Bots laufen nicht weiter.
-- Die Zeilen bleiben als Verlauf stehen.
update public.sniper_queries set is_active = false, updated_at = now() where is_active;

-- Ab hier entspricht der Inhalt supabase/schemas/403_sniper_personal_feeds.sql.
-- Destruktiv darin: Entzug des direkten Leserechts auf public.sniper_listings und Ersatz der
-- Lese-Richtlinie für public.sniper_watchlists durch eine persönliche.
-- Persönliche Feeds melden Bedarf an, gemeinsame Quellen erfüllen ihn.
-- Ein Feed ohne Kategorie liest aus der Hauptquelle seiner Zielgruppe, ein Feed
-- mit Kategorie aus der Kategoriequelle. Marke, Suchtext, Größe, Zustand und
-- Preis filtert die Datenbank. Die Zahl der Vinted-Abfragen hängt so von der
-- Zahl der Quellen ab, nicht von der Zahl der Nutzer oder Filter.
alter table public.sniper_watchlists
    add column user_id uuid references auth.users(id) on delete cascade,
    add column brand_id integer check (brand_id > 0),
    add column is_active boolean not null default false,
    add column started_at timestamptz,
    add constraint sniper_watchlist_active_valid check (
        (is_active and user_id is not null and started_at is not null)
        or (not is_active and started_at is null)
    ),
    add constraint sniper_watchlist_brand_named check (brand_id is null or brand is not null);

comment on table public.sniper_watchlists is 'Persönliche Vinted-Feeds je Benutzer und Arbeitsbereich. Aktive Feeds lesen aus gemeinsamen Haupt- oder Kategoriequellen.';
create index sniper_watchlists_personal_idx on public.sniper_watchlists(user_id, workspace_id, created_at);
create index sniper_watchlists_active_source_idx on public.sniper_watchlists(catalog_id, audience)
    where is_active;

-- Einstellungen des Feed-Betriebs. Genau eine Zeile; nur Plattform-Admins ändern sie.
create table public.sniper_feed_settings (
    id integer primary key default 1 check (id = 1),
    max_category_sources integer not null default 10 check (max_category_sources between 0 and 500),
    category_poll_interval_seconds integer not null default 90
        check (category_poll_interval_seconds between 15 and 3600),
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id) on delete set null
);
comment on table public.sniper_feed_settings is 'Systemweite Grenze und Takt der Vinted-Kategoriequellen. Eine Senkung beendet keine laufenden Quellen.';
insert into public.sniper_feed_settings(id) values (1) on conflict (id) do nothing;
alter table public.sniper_feed_settings enable row level security;
revoke all on public.sniper_feed_settings from public, anon, authenticated;
grant select on public.sniper_feed_settings to authenticated;
grant select on public.sniper_feed_settings to service_role;
create policy "Administration liest Feed-Einstellungen" on public.sniper_feed_settings
    for select to authenticated using ((select public.is_platform_operator()));

create function public.sniper_can_access_workspace(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select public.can_access_workspace(p_workspace_id) and exists (
        select 1 from public.workspaces where id = p_workspace_id and archived_at is null
    );
$$;
revoke all on function public.sniper_can_access_workspace(uuid) from public, anon, authenticated;
grant execute on function public.sniper_can_access_workspace(uuid) to authenticated;

drop policy "Mitglieder lesen Merkzettel" on public.sniper_watchlists;
create policy "Nutzer lesen eigene Feeds" on public.sniper_watchlists for select to authenticated
    using (user_id = (select auth.uid()) and public.sniper_can_access_workspace(workspace_id));

-- Nur der berechtigte Feed-Leseweg darf Karten bereitstellen.
drop policy "Angemeldete duerfen Angebote lesen" on public.sniper_listings;
revoke select on public.sniper_listings from authenticated;
revoke execute on function public.sniper_feed_bots(uuid), public.sniper_feed_categories(uuid),
    public.sniper_supported_brands(uuid), public.sniper_search_feed_brands(uuid,text)
    from authenticated;

-- Quellschlüssel eines Feeds. Damen und Herren sind die Wurzelkategorien 1904 und 5.
create function public.sniper_watchlist_source_keys(p_catalog_id integer, p_audience text)
returns text[] language sql immutable security invoker set search_path = '' as $$
    select case
        when p_catalog_id is not null then array['vinted-source|category|' || p_catalog_id::text]
        when p_audience = 'women' then array['vinted-source|main|1904']
        when p_audience = 'men' then array['vinted-source|main|5']
        else array['vinted-source|main|1904', 'vinted-source|main|5']
    end;
$$;
revoke all on function public.sniper_watchlist_source_keys(integer, text) from public, anon, authenticated;
grant execute on function public.sniper_watchlist_source_keys(integer, text) to service_role;

-- Bedarf aller aktiven Feeds mit gültigem Zugang. Grundlage für Dienst, Grenze und Aufräumen.
create view public.sniper_needed_feed_sources with (security_invoker = true) as
select source.key, count(*)::integer as feed_count
from public.sniper_watchlists as feed
join public.workspace_members as member
  on member.workspace_id = feed.workspace_id and member.user_id = feed.user_id
join public.workspaces as workspace on workspace.id = feed.workspace_id
cross join lateral unnest(public.sniper_watchlist_source_keys(feed.catalog_id, feed.audience)) as source(key)
where feed.is_active and workspace.archived_at is null
  and public.workspace_access_is_valid(workspace.id)
group by source.key;
comment on view public.sniper_needed_feed_sources is 'Quellschlüssel, die mindestens ein aktiver und zugangsberechtigter Feed braucht.';
revoke all on public.sniper_needed_feed_sources from public, anon, authenticated, service_role;
grant select on public.sniper_needed_feed_sources to service_role;

-- Mutationen sind selten. Ein gemeinsamer Transaktions-Lock hält Aktivieren,
-- Wechsel und letzte Abmeldung über Arbeitsbereiche hinweg zusammen.
create function public.lock_sniper_feed_changes()
returns void language sql volatile security invoker set search_path = '' as $$
    select pg_catalog.pg_advisory_xact_lock(403, 1);
$$;
revoke all on function public.lock_sniper_feed_changes() from public, anon, authenticated;
grant execute on function public.lock_sniper_feed_changes() to service_role;

-- Beendet Quellen, die kein aktiver Feed mehr braucht. Der Abrufzustand bleibt
-- erhalten, damit eine Wartezeit nach einer Vinted-Sperre nicht durch Neustart verfällt.
create function public.stop_unused_sniper_feed_sources()
returns void language sql volatile security definer set search_path = '' as $$
    update public.sniper_queries as query set is_active = false, updated_at = now()
    where query.is_active and query.query_key like 'vinted-source|%'
      and not exists (
          select 1 from public.sniper_needed_feed_sources as needed where needed.key = query.query_key
      );
$$;
revoke all on function public.stop_unused_sniper_feed_sources() from public, anon, authenticated;

create function public.stop_unused_sniper_feed_sources_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    perform public.stop_unused_sniper_feed_sources();
    return null;
end;
$$;
revoke all on function public.stop_unused_sniper_feed_sources_after_change() from public, anon, authenticated;
create trigger stop_unused_sniper_feed_sources after update of is_active, catalog_id, audience or delete
    on public.sniper_watchlists for each statement
    execute function public.stop_unused_sniper_feed_sources_after_change();

create function public.stop_inaccessible_sniper_feeds()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    perform public.lock_sniper_feed_changes();
    if tg_table_name = 'workspace_members' then
        update public.sniper_watchlists set is_active = false, started_at = null
        where workspace_id = old.workspace_id and user_id = old.user_id and is_active;
    else
        update public.sniper_watchlists set is_active = false, started_at = null
        where workspace_id = new.id and is_active;
    end if;
    return null;
end;
$$;
revoke all on function public.stop_inaccessible_sniper_feeds() from public, anon, authenticated;
create trigger stop_removed_member_sniper_feeds after delete on public.workspace_members
    for each row execute function public.stop_inaccessible_sniper_feeds();
create trigger stop_archived_workspace_sniper_feeds after update of archived_at on public.workspaces
    for each row when (new.archived_at is not null and old.archived_at is null)
    execute function public.stop_inaccessible_sniper_feeds();

create or replace function public.enforce_sniper_watchlist_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' and (select count(*) from public.sniper_watchlists
        where workspace_id = new.workspace_id and user_id = new.user_id) >= 100 then
        raise exception 'Maximal 100 gespeicherte Feeds pro Arbeitsbereich.' using errcode = '54000';
    end if;
    return new;
end;
$$;

-- Legt fehlende Quellen an oder nimmt ruhende wieder auf. Neue Quellen sind sofort
-- fällig, reihen sich aber hinter bereits überfällige Quellen ein.
create function public.ensure_sniper_feed_sources(p_keys text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_key text;
    v_kind text;
    v_catalog integer;
    v_interval integer;
begin
    select category_poll_interval_seconds * 1000 into v_interval
    from public.sniper_feed_settings where id = 1;
    foreach v_key in array p_keys loop
        v_kind := split_part(v_key, '|', 2);
        v_catalog := split_part(v_key, '|', 3)::integer;
        insert into public.sniper_queries (
            query_key, title, catalog_id, filter_format_version, poll_interval_ms, is_active,
            next_attempt_at
        ) values (
            v_key,
            case when v_kind = 'main' then 'Vinted-Hauptquelle' else 'Vinted-Kategoriequelle' end,
            v_catalog, 1,
            case when v_kind = 'main' then 5000 else coalesce(v_interval, 90000) end,
            true, now()
        ) on conflict (query_key) do nothing;
        update public.sniper_queries
        set is_active = true, deleted_at = null, next_attempt_at = coalesce(next_attempt_at, now()),
            poll_interval_ms = case when v_kind = 'main' then 5000 else coalesce(v_interval, 90000) end,
            updated_at = now()
        where query_key = v_key and (not is_active or deleted_at is not null or run_state = 'invalid');
        update public.sniper_queries set run_state = 'ready', next_attempt_at = now()
        where query_key = v_key and run_state = 'invalid';
    end loop;
end;
$$;
revoke all on function public.ensure_sniper_feed_sources(text[]) from public, anon, authenticated;

create function public.set_sniper_watchlist_active(p_workspace_id uuid, p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_user uuid := (select auth.uid());
    v_feed public.sniper_watchlists;
    v_keys text[];
    v_search text;
    v_new_categories integer;
    v_running_categories integer;
    v_limit integer;
begin
    if v_user is null or not public.sniper_can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_active is null then
        raise exception 'Feed-Status fehlt.' using errcode = '22023';
    end if;
    perform public.lock_sniper_feed_changes();
    select * into v_feed from public.sniper_watchlists
    where id = p_id and workspace_id = p_workspace_id and user_id = v_user for update;
    if not found then
        raise exception 'Feed nicht gefunden.' using errcode = '42501';
    end if;
    if v_feed.is_active = p_active then return; end if;
    if not p_active then
        update public.sniper_watchlists set is_active = false, started_at = null where id = p_id;
        return;
    end if;

    v_search := nullif(btrim(regexp_replace(lower(v_feed.search_text), '[[:space:]]+', ' ', 'g')), '');
    if v_feed.catalog_id is not null and not exists (
        select 1 from public.vinted_categories where id = v_feed.catalog_id
    ) then
        raise exception 'Bitte wähle eine verfügbare Vinted-Kategorie.' using errcode = '22023';
    end if;
    if v_feed.catalog_id is null and v_feed.brand is null and (v_search is null or length(v_search) < 3) then
        raise exception 'Bitte wähle eine Marke, eine Kategorie oder einen Suchbegriff mit mindestens drei Zeichen.'
            using errcode = '22023';
    end if;
    if (select count(*) from public.sniper_watchlists where user_id = v_user and is_active) >= 12 then
        raise exception 'Du kannst höchstens zwölf Vinted-Feeds gleichzeitig starten.' using errcode = '54000';
    end if;

    v_keys := public.sniper_watchlist_source_keys(v_feed.catalog_id, v_feed.audience);
    select count(*) into v_new_categories from unnest(v_keys) as wanted(source_key)
    where wanted.source_key like 'vinted-source|category|%'
      and not exists (
          select 1 from public.sniper_needed_feed_sources as needed where needed.key = wanted.source_key
      );
    if v_new_categories > 0 then
        select max_category_sources into v_limit from public.sniper_feed_settings where id = 1;
        select count(*) into v_running_categories from public.sniper_needed_feed_sources
        where key like 'vinted-source|category|%';
        if v_running_categories + v_new_categories > coalesce(v_limit, 10) then
            raise exception 'Diese Kategorie ist gerade ausgelastet. Starte einen Feed ohne Kategorie oder versuche es später.'
                using errcode = '54000';
        end if;
    end if;

    perform public.ensure_sniper_feed_sources(v_keys);
    update public.sniper_watchlists set is_active = true, started_at = clock_timestamp() where id = p_id;
end;
$$;
revoke all on function public.set_sniper_watchlist_active(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_sniper_watchlist_active(uuid,uuid,boolean) to authenticated;

create function public.save_sniper_watchlist(
    p_workspace_id uuid, p_id uuid, p_title text, p_catalog_id integer, p_brand text,
    p_search_text text, p_price_from numeric, p_price_to numeric, p_condition text,
    p_audience text, p_sizes text[], p_brand_id integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_user uuid := (select auth.uid());
    v_existing public.sniper_watchlists;
    v_id uuid;
    v_restart boolean;
begin
    if v_user is null or not public.sniper_can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    p_title := btrim(p_title);
    p_brand := nullif(btrim(p_brand), '');
    p_search_text := nullif(btrim(p_search_text), '');
    p_condition := nullif(btrim(p_condition), '');
    if coalesce(length(p_title), 0) not between 1 and 100
        or length(p_brand) > 100 or length(p_search_text) > 200 or length(p_condition) > 100
        or p_brand_id <= 0 then
        raise exception 'Name oder Suchkriterien sind ungültig.' using errcode = '22023';
    end if;
    if p_brand_id is not null and p_brand is null then
        raise exception 'Bitte wähle die Marke aus.' using errcode = '22023';
    end if;
    if p_catalog_id is not null and not exists (select 1 from public.vinted_categories where id = p_catalog_id) then
        raise exception 'Bitte wähle eine verfügbare Vinted-Kategorie.' using errcode = '22023';
    end if;
    if p_audience not in ('women', 'men', 'both') or p_sizes is null or cardinality(p_sizes) > 7
        or not p_sizes <@ array['xs', 's', 'm', 'l', 'xl', 'xxl', '3xl'] then
        raise exception 'Zielgruppe oder Größe sind ungültig.' using errcode = '22023';
    end if;
    if (p_price_from is not null and (p_price_from not between 0 and 9999999999.99 or round(p_price_from, 2) <> p_price_from))
        or (p_price_to is not null and (p_price_to not between 0 and 9999999999.99 or round(p_price_to, 2) <> p_price_to))
        or p_price_from > p_price_to then
        raise exception 'Bitte gib gültige Preisgrenzen an.' using errcode = '22023';
    end if;
    select coalesce(array_agg(size order by size), '{}') into p_sizes
    from (select distinct unnest(p_sizes) as size) as normalized;
    perform public.lock_sniper_feed_changes();
    if p_id is null then
        insert into public.sniper_watchlists(workspace_id, user_id, title, catalog_id, brand, brand_id,
            search_text, price_from, price_to, condition, audience, sizes)
        values (p_workspace_id, v_user, p_title, p_catalog_id, p_brand, p_brand_id,
            p_search_text, p_price_from, p_price_to, p_condition, p_audience, p_sizes)
        returning id into v_id;
        return v_id;
    end if;
    select * into v_existing from public.sniper_watchlists
    where id = p_id and workspace_id = p_workspace_id and user_id = v_user for update;
    if not found then
        raise exception 'Feed nicht gefunden.' using errcode = '42501';
    end if;
    if p_brand_id is null and p_brand is not distinct from v_existing.brand then
        p_brand_id := v_existing.brand_id;
    end if;
    v_restart := v_existing.is_active and
        (v_existing.catalog_id, v_existing.brand, v_existing.brand_id, v_existing.search_text,
         v_existing.price_from, v_existing.price_to, v_existing.condition, v_existing.audience, v_existing.sizes)
        is distinct from (p_catalog_id, p_brand, p_brand_id, p_search_text,
         p_price_from, p_price_to, p_condition, p_audience, p_sizes);
    -- Umstellen und neuer Beginn passieren im selben Commit. Fehler lassen den alten Feed laufen.
    if v_restart then perform public.set_sniper_watchlist_active(p_workspace_id, p_id, false); end if;
    update public.sniper_watchlists set title = p_title, catalog_id = p_catalog_id, brand = p_brand,
        brand_id = p_brand_id, search_text = p_search_text, price_from = p_price_from, price_to = p_price_to,
        condition = p_condition, audience = p_audience, sizes = p_sizes,
        legacy_brand_id = case when p_brand is not distinct from v_existing.brand and p_brand_id is null then legacy_brand_id end
    where id = p_id;
    if v_restart then perform public.set_sniper_watchlist_active(p_workspace_id, p_id, true); end if;
    return p_id;
end;
$$;
revoke all on function public.save_sniper_watchlist(uuid,uuid,text,integer,text,text,numeric,numeric,text,text,text[],integer)
    from public, anon, authenticated;
grant execute on function public.save_sniper_watchlist(uuid,uuid,text,integer,text,text,numeric,numeric,text,text,text[],integer)
    to authenticated;

-- Während der Auslieferung gelten dieselben persönlichen Grenzen auch für ältere Clients.
create or replace function public.save_sniper_watchlist(
    p_workspace_id uuid, p_id uuid, p_title text, p_catalog_id integer, p_brand text,
    p_search_text text, p_price_from numeric, p_price_to numeric, p_condition text,
    p_audience text, p_sizes text[]
)
returns uuid language sql security invoker set search_path = '' as $$
    select public.save_sniper_watchlist(p_workspace_id, p_id, p_title, p_catalog_id, p_brand,
        p_search_text, p_price_from, p_price_to, p_condition, p_audience, p_sizes, null);
$$;

create or replace function public.save_sniper_watchlist(
    p_workspace_id uuid, p_id uuid, p_title text, p_catalog_id integer,
    p_brand text, p_search_text text, p_price_from numeric, p_price_to numeric, p_condition text
)
returns uuid language sql security invoker set search_path = '' as $$
    select public.save_sniper_watchlist(p_workspace_id, p_id, p_title, p_catalog_id, p_brand,
        p_search_text, p_price_from, p_price_to, p_condition, null, '{}', null);
$$;

create or replace function public.delete_sniper_watchlist(p_workspace_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
    if v_user is null or not public.sniper_can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    perform public.lock_sniper_feed_changes();
    delete from public.sniper_watchlists where id = p_id and workspace_id = p_workspace_id and user_id = v_user;
    if not found then raise exception 'Feed nicht gefunden.' using errcode = '42501'; end if;
end;
$$;

create or replace function public.sniper_feed_import_brand(p_workspace_id uuid, p_brand_id integer)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.sniper_can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    return (
        select min(name) from (
            select p.name from public.sniper_queries query
            cross join lateral unnest(query.brand_ids, query.brand_names) as p(id, name)
            where query.marketplace = 'vinted' and p.id = p_brand_id
            union
            select brand from public.sniper_watchlists
            where brand_id = p_brand_id and user_id = (select auth.uid()) and workspace_id = p_workspace_id
        ) as names
        where nullif(btrim(name), '') is not null
        having count(distinct lower(btrim(name))) = 1
    );
end;
$$;

-- Eine Seite darf nur auf dem persönlichen laufenden Feed aufsetzen. Gelesen wird aus
-- den Treffern aller Quellen des Feeds; alle Feed-Filter wirken in der Datenbank.
create or replace function public.sniper_feed_search(
    p_workspace_id uuid, p_watchlist_id uuid, p_brand text, p_size text, p_min_price numeric,
    p_max_price numeric, p_before_time timestamptz, p_before_id uuid, p_limit integer,
    p_title_query text, p_catalog_id integer, p_audience text, p_sizes text[],
    p_query_id uuid, p_after_time timestamptz
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v_user uuid := (select auth.uid());
    v_feed public.sniper_watchlists;
    v_source_ids uuid[];
    v_source_count integer;
    v_covered boolean;
    v_title_query tsquery;
    v_feed_query tsquery;
    v_audience integer[];
    v_saved_audience integer[];
    v_window_start timestamptz;
    v_rows jsonb := '[]';
    v_reported_at timestamptz;
begin
    if v_user is null or not public.sniper_can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_query_id is not null then
        raise exception 'Wähle Deinen persönlichen Feed.' using errcode = '22023';
    end if;
    if p_limit is null or p_limit not between 1 and 100
        or (p_before_time is null) <> (p_before_id is null)
        or (p_before_time is not null and p_after_time is not null)
        or length(p_title_query) > 200 or length(p_brand) > 100
        or p_audience not in ('women','men','both')
        or p_size not in ('xs','s','m','l','xl','xxl','3xl')
        or p_sizes is null or cardinality(p_sizes) > 7
        or not p_sizes <@ array['xs','s','m','l','xl','xxl','3xl']
        or (p_min_price is not null and p_min_price not between 0 and 9999999999.99)
        or (p_max_price is not null and p_max_price not between 0 and 9999999999.99)
        or p_min_price > p_max_price then
        raise exception 'Ungültige Suchanfrage.' using errcode = '22023';
    end if;
    if p_watchlist_id is null then
        return jsonb_build_object('items', v_rows, 'covered', false, 'reported_at', null);
    end if;
    select * into v_feed from public.sniper_watchlists
    where id = p_watchlist_id and workspace_id = p_workspace_id and user_id = v_user;
    if not found then raise exception 'Feed nicht gefunden.' using errcode = '42501'; end if;
    if not v_feed.is_active then
        return jsonb_build_object('items', v_rows, 'covered', false, 'reported_at', null);
    end if;

    -- Abgedeckt ist ein Feed nur, wenn jede Quelle läuft, aufholt und kürzlich erfolgreich war.
    select array_agg(query.id), count(*),
        coalesce(bool_and(query.is_active and query.deleted_at is null and query.run_state <> 'invalid'
            and query.coverage_status <> 'limited'
            and query.last_success_at >= now() - make_interval(secs => greatest(60, query.poll_interval_ms * 2 / 1000) + 30)
        ), false)
    into v_source_ids, v_source_count, v_covered
    from public.sniper_queries as query
    where query.query_key = any(public.sniper_watchlist_source_keys(v_feed.catalog_id, v_feed.audience));
    if v_source_count = 0 then
        return jsonb_build_object('items', v_rows, 'covered', false, 'reported_at', null);
    end if;

    if nullif(btrim(p_title_query), '') is not null then
        select string_agg(quote_literal(lexeme) || ':*', ' & ')::tsquery
        into v_title_query
        from unnest(tsvector_to_array(to_tsvector('simple', p_title_query))) as lexeme;
    end if;
    if nullif(btrim(v_feed.search_text), '') is not null then
        select string_agg(quote_literal(lexeme) || ':*', ' & ')::tsquery
        into v_feed_query
        from unnest(tsvector_to_array(to_tsvector('simple', v_feed.search_text))) as lexeme;
    end if;
    v_audience := case p_audience when 'women' then array[1904] when 'men' then array[5]
        when 'both' then array[1904, 5] end;
    v_saved_audience := case v_feed.audience when 'women' then array[1904] when 'men' then array[5]
        when 'both' then array[1904, 5] end;
    v_window_start := greatest(v_feed.started_at, now() - interval '10 minutes');

    with recursive category_tree(root_id, id) as (
        select root, root from unnest(array_remove(
            array[p_catalog_id, v_feed.catalog_id] || v_audience || v_saved_audience, null)) as root
        union
        select tree.root_id, child.id from category_tree as tree
        join public.vinted_categories as child on child.parent_id = tree.id
    ), matched as (
        select matched.listing_id, min(source.catalog_id) as source_catalog_id
        from public.sniper_query_matches as matched
        join public.sniper_queries as source on source.id = matched.query_id
        where matched.query_id = any(v_source_ids)
          and matched.first_matched_at >= v_window_start
          and not matched.is_seed
        group by matched.listing_id
    ), live as materialized (
        select listing.id, listing.title, listing.url, listing.image_urls, listing.item_price,
            listing.total_price, listing.currency, listing.brand, listing.size, listing.condition,
            listing.is_hidden, listing.first_seen_at, listing.catalog_id, listing.country_code,
            category.path as category_path,
            coalesce(listing.catalog_id, matched.source_catalog_id) as effective_catalog_id
        from matched
        join public.sniper_listings as listing on listing.id = matched.listing_id
        left join public.vinted_categories as category on category.id = listing.catalog_id
        where listing.first_seen_at >= v_window_start
          and not listing.is_initial_stock
          and (v_feed.brand is null or lower(btrim(listing.brand)) = lower(btrim(v_feed.brand)))
          and (v_feed_query is null or to_tsvector('simple', listing.title) @@ v_feed_query)
          and (v_feed.condition is null or lower(replace(v_feed.condition, ',', '')) = lower(replace(listing.condition, ',', '')))
          and (cardinality(v_feed.sizes) = 0 or exists (
              select 1 from unnest(v_feed.sizes) as size where public.sniper_feed_matches_size(listing.size, size)
          ))
          and (v_feed.price_from is null or listing.item_price >= v_feed.price_from)
          and (v_feed.price_to is null or listing.item_price <= v_feed.price_to)
          and ((v_feed.price_from is null and v_feed.price_to is null) or listing.currency = 'EUR')
          and (v_feed.catalog_id is not null or v_saved_audience is null or exists (
              select 1 from category_tree where root_id = any(v_saved_audience)
              and id = coalesce(listing.catalog_id, matched.source_catalog_id)
          ))
        order by listing.first_seen_at desc, listing.id desc
        limit 100
    ), page as (
        select id, title, url, image_urls, item_price, total_price, currency, brand, size, condition,
            is_hidden, first_seen_at, catalog_id, country_code, category_path
        from live
        where (p_after_time is null or first_seen_at >= p_after_time)
          and (p_before_time is null or (first_seen_at, id) < (p_before_time, p_before_id))
          and (nullif(btrim(p_title_query), '') is null or to_tsvector('simple', title) @@ v_title_query)
          and (p_brand is null or lower(btrim(brand)) = lower(btrim(p_brand)))
          and (p_size is null or public.sniper_feed_matches_size(size, p_size))
          and (cardinality(p_sizes) = 0 or exists (
              select 1 from unnest(p_sizes) as requested_size where public.sniper_feed_matches_size(size, requested_size)
          ))
          and (p_min_price is null or item_price >= p_min_price)
          and (p_max_price is null or item_price <= p_max_price)
          and ((p_min_price is null and p_max_price is null) or currency = 'EUR')
          and (p_catalog_id is null or exists (
              select 1 from category_tree where root_id = p_catalog_id and id = live.effective_catalog_id
          ))
          and (v_audience is null or exists (
              select 1 from category_tree where root_id = any(v_audience) and id = live.effective_catalog_id
          ))
        order by first_seen_at desc, id desc
        limit p_limit
    )
    select coalesce(jsonb_agg(to_jsonb(page) order by first_seen_at desc, id desc), '[]'::jsonb) into v_rows from page;
    select reported_at into v_reported_at from public.sniper_runtime_status where id = 1;
    return jsonb_build_object('items', v_rows, 'covered', v_covered, 'reported_at', v_reported_at);
end;
$$;

-- Nach Ablauf bleiben nur Kennungen zur Wiedererkennung im Katalog.
create table public.sniper_recent_listing_keys (
    marketplace text not null,
    external_id text not null,
    first_seen_at timestamptz not null,
    primary key (marketplace, external_id)
);
comment on table public.sniper_recent_listing_keys is 'Kompakte Kennungen abgelaufener Feed-Karten für die Wiedererkennung älterer Katalogtreffer.';
create index sniper_recent_listing_keys_expiry_idx on public.sniper_recent_listing_keys(first_seen_at);
alter table public.sniper_recent_listing_keys enable row level security;
revoke all on public.sniper_recent_listing_keys from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.sniper_recent_listing_keys to service_role;

create function public.ignore_expired_sniper_listing()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
    if exists (select 1 from public.sniper_recent_listing_keys
        where marketplace = new.marketplace and external_id = new.external_id
            and first_seen_at >= now() - interval '3 days') then
        return null;
    end if;
    return new;
end;
$$;
revoke all on function public.ignore_expired_sniper_listing() from public, anon, authenticated;
create trigger ignore_expired_sniper_listing before insert on public.sniper_listings
    for each row execute function public.ignore_expired_sniper_listing();

create or replace function public.sniper_purge_expired_listings(p_batch_size integer default 1000)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_deleted integer;
begin
    if p_batch_size is null or p_batch_size not between 1 and 5000 then
        raise exception 'Die Paketgroesse muss zwischen 1 und 5000 liegen.' using errcode = '22023';
    end if;
    -- Zeitlich befristete Zugänge können auch ohne Änderung an einem Feed auslaufen.
    -- Die Feed-Sperre wird nur geholt, wenn tatsächlich ein Zugang abgelaufen ist.
    if exists (
        select 1 from (select distinct workspace_id from public.sniper_watchlists where is_active) as active
        where not public.workspace_access_is_valid(active.workspace_id)
    ) and pg_catalog.pg_try_advisory_xact_lock(403, 1) then
        update public.sniper_watchlists as feed
        set is_active = false, started_at = null
        from (
            select workspace_id from (
                select distinct workspace_id from public.sniper_watchlists where is_active
            ) as active_workspaces
            where not public.workspace_access_is_valid(workspace_id)
        ) as expired_workspaces
        where feed.workspace_id = expired_workspaces.workspace_id and feed.is_active;
    end if;
    -- Ruhende Kategoriequellen ohne Bedarf verschwinden nach einem Tag samt Zuordnungen.
    delete from public.sniper_queries
    where id in (
        select id from public.sniper_queries
        where query_key like 'vinted-source|category|%' and not is_active
          and updated_at < now() - interval '1 day'
        limit 100
    );
    with expired as (
        select id from public.sniper_listings
        where first_seen_at < now() - interval '15 minutes'
        order by first_seen_at, id
        limit p_batch_size
        for update skip locked
    ), deleted as (
        delete from public.sniper_listings as listing using expired
        where listing.id = expired.id
        returning listing.marketplace, listing.external_id, listing.first_seen_at
    ), remembered as (
        insert into public.sniper_recent_listing_keys(marketplace, external_id, first_seen_at)
        select marketplace, external_id, first_seen_at from deleted
        where first_seen_at >= now() - interval '3 days'
        on conflict (marketplace, external_id) do nothing
    )
    select count(*)::integer into v_deleted from deleted;
    delete from public.sniper_recent_listing_keys as retained
    using (
        select marketplace, external_id from public.sniper_recent_listing_keys
        where first_seen_at < now() - interval '3 days'
        order by first_seen_at limit p_batch_size for update skip locked
    ) as expired_keys
    where retained.marketplace = expired_keys.marketplace and retained.external_id = expired_keys.external_id;
    return v_deleted;
end;
$$;
comment on function public.sniper_purge_expired_listings(integer) is
    'Entfernt vollständige Feed-Karten paketweise nach 15 Minuten, behält kompakte Kennungen drei Tage und räumt ruhende Kategoriequellen auf.';

-- Nur Arbeitsbereiche, deren aktive Feeds an der Quelle mit neuen Treffern hängen,
-- bekommen den Hinweis. Die frühere Fassung ohne Quelle benachrichtigte alle.
drop function public.sniper_notify_feed_updates();
create function public.sniper_notify_feed_updates(p_query_id uuid)
returns void language plpgsql volatile security invoker set search_path = '' as $$
declare
    v_key text;
    v_workspace_id uuid;
begin
    select query_key into v_key from public.sniper_queries where id = p_query_id;
    if v_key is null then return; end if;
    for v_workspace_id in
        select distinct feed.workspace_id from public.sniper_watchlists feed
        join public.workspaces workspace on workspace.id = feed.workspace_id
        where feed.is_active and workspace.archived_at is null
            and v_key = any(public.sniper_watchlist_source_keys(feed.catalog_id, feed.audience))
            and public.workspace_access_is_valid(workspace.id)
    loop
        perform realtime.send(jsonb_build_object('refresh', true), 'feed_updated',
            'workspace:' || v_workspace_id::text || ':sniper_feed', true);
    end loop;
end;
$$;
revoke all on function public.sniper_notify_feed_updates(uuid) from public, anon, authenticated;
grant execute on function public.sniper_notify_feed_updates(uuid) to service_role;

-- Eine gespeicherte Kennung existiert schon vor der späteren Kartenbereinigung.
-- Gleichzeitige Katalogabrufe können einen gerade entfernten Fund so nicht erneut anzeigen.
create function public.remember_sniper_listing_key()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
    insert into public.sniper_recent_listing_keys(marketplace, external_id, first_seen_at)
    values (new.marketplace, new.external_id, new.first_seen_at)
    on conflict (marketplace, external_id) do update set first_seen_at = excluded.first_seen_at
    where public.sniper_recent_listing_keys.first_seen_at < now() - interval '3 days';
    return null;
end;
$$;
revoke all on function public.remember_sniper_listing_key() from public, anon, authenticated;
create trigger remember_sniper_listing_key after insert on public.sniper_listings
    for each row execute function public.remember_sniper_listing_key();

create function public.lock_sniper_feed_deletion()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
    perform public.lock_sniper_feed_changes();
    return null;
end;
$$;
revoke all on function public.lock_sniper_feed_deletion() from public, anon, authenticated;
create trigger lock_sniper_feed_deletion before delete on public.sniper_watchlists
    for each statement execute function public.lock_sniper_feed_deletion();

-- Die Funktionen bleiben für alte Sammler-Fixtures verfügbar. Browser können
-- seit dem Wechsel keine administrativen Sammelaktionen auslösen.
revoke execute on function
    public.upsert_sniper_query(uuid,text,integer,integer,text),
    public.upsert_sniper_query(uuid,text,integer,integer,numeric,numeric,integer,text),
    public.save_sniper_search_filter(uuid,text,integer,jsonb,text[],text,integer,text,integer,text,numeric,numeric,text[]),
    public.set_sniper_query_active(uuid,boolean),
    public.reset_sniper_search_filter_results(uuid,integer),
    public.delete_sniper_query(uuid),
    public.sniper_query_listing_counts()
    from authenticated;

-- Quellen, die der Sammeldienst abrufen soll.
create view public.sniper_active_feed_sources with (security_invoker = true) as
select query.*
from public.sniper_queries as query
join public.sniper_needed_feed_sources as needed on needed.key = query.query_key
where query.marketplace = 'vinted' and query.is_active and query.deleted_at is null;
comment on view public.sniper_active_feed_sources is 'Haupt- und Kategoriequellen mit mindestens einem aktiven und zugangsberechtigten Feed. Nur der Sammeldienst darf sie lesen.';
revoke all on public.sniper_active_feed_sources from public, anon, authenticated, service_role;
grant select on public.sniper_active_feed_sources to service_role;

-- Auslastung und Grenze für den Systemzustand.
create function public.sniper_feed_capacity()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
    if not (select public.is_platform_operator()) then
        raise exception 'Nur für die Plattform-Administration.' using errcode = '42501';
    end if;
    select jsonb_build_object(
        'max_category_sources', settings.max_category_sources,
        'category_poll_interval_seconds', settings.category_poll_interval_seconds,
        'active_category_sources', (select count(*) from public.sniper_needed_feed_sources
            where key like 'vinted-source|category|%'),
        'active_feeds', (select count(*) from public.sniper_watchlists where is_active),
        'requests_last_minute', status.requests_last_minute,
        'request_budget', status.request_budget,
        'reported_at', status.reported_at,
        'sources', coalesce((
            select jsonb_agg(jsonb_build_object(
                'key', query.query_key,
                'kind', split_part(query.query_key, '|', 2),
                'catalog_id', query.catalog_id,
                'category_path', category.path,
                'feed_count', needed.feed_count,
                'last_success_at', query.last_success_at,
                'coverage_status', query.coverage_status,
                'run_state', query.run_state,
                'last_status', query.last_status
            ) order by split_part(query.query_key, '|', 2), category.path)
            from public.sniper_queries as query
            join public.sniper_needed_feed_sources as needed on needed.key = query.query_key
            left join public.vinted_categories as category on category.id = query.catalog_id
            where query.is_active and query.deleted_at is null
        ), '[]'::jsonb)
    ) into v_result
    from public.sniper_feed_settings as settings
    left join public.sniper_runtime_status as status on status.id = 1
    where settings.id = 1;
    return v_result;
end;
$$;
revoke all on function public.sniper_feed_capacity() from public, anon, authenticated;
grant execute on function public.sniper_feed_capacity() to authenticated;

create function public.set_sniper_feed_settings(
    p_max_category_sources integer, p_category_poll_interval_seconds integer
)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
    if not (select public.is_platform_operator()) then
        raise exception 'Nur für die Plattform-Administration.' using errcode = '42501';
    end if;
    if p_max_category_sources is null or p_max_category_sources not between 0 and 500
        or p_category_poll_interval_seconds is null
        or p_category_poll_interval_seconds not between 15 and 3600 then
        raise exception 'Ungültige Feed-Einstellungen.' using errcode = '22023';
    end if;
    perform public.lock_sniper_feed_changes();
    update public.sniper_feed_settings
    set max_category_sources = p_max_category_sources,
        category_poll_interval_seconds = p_category_poll_interval_seconds,
        updated_at = now(), updated_by = (select auth.uid())
    where id = 1;
    update public.sniper_queries set poll_interval_ms = p_category_poll_interval_seconds * 1000, updated_at = now()
    where query_key like 'vinted-source|category|%';
end;
$$;
revoke all on function public.set_sniper_feed_settings(integer, integer) from public, anon, authenticated;
grant execute on function public.set_sniper_feed_settings(integer, integer) to authenticated;
