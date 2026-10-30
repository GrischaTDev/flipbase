-- Fachliche Bedingungen und beobachteter Abrufstand bleiben getrennt.
alter table public.sniper_queries
    add column excluded_title_keywords text[] not null default '{}',
    add column coverage_status text not null default 'unknown',
    add column coverage_checked_at timestamptz,
    add column last_request_duration_ms integer,
    add column shared_filter_count integer not null default 1,
    add constraint sniper_queries_exclusions_valid check (
        cardinality(excluded_title_keywords) <= 10 and coalesce(array_ndims(excluded_title_keywords), 1) = 1
        and array_position(excluded_title_keywords, null) is null),
    add constraint sniper_queries_coverage_valid check (coverage_status in ('unknown', 'initial', 'caught_up', 'limited')),
    add constraint sniper_queries_duration_valid check (last_request_duration_ms between 0 and 86400000),
    add constraint sniper_queries_shared_count_valid check (shared_filter_count between 1 and 10000);
alter table public.sniper_queries drop constraint sniper_queries_interval_valid;
alter table public.sniper_queries add constraint sniper_queries_interval_valid check (poll_interval_ms between 1000 and 86400000);
comment on column public.sniper_queries.coverage_status is 'Begrenzte Abrufbeobachtung, keine Aussage über den vollständigen Marktplatzbestand.';
comment on column public.sniper_queries.poll_interval_ms is 'Gewünschter Mindestabstand; tatsächliche Abrufe hängen vom gemeinsamen Budget und Marktplatzzugang ab.';

create table public.sniper_query_matches (
    id bigint generated always as identity primary key,
    query_id uuid not null references public.sniper_queries(id) on delete cascade,
    listing_id uuid not null references public.sniper_listings(id) on delete cascade,
    first_matched_at timestamptz not null default now(),
    filter_revision integer not null check (filter_revision > 0),
    is_seed boolean not null,
    unique (query_id, listing_id)
);
comment on table public.sniper_query_matches is 'Bestätigte Filterzuordnungen eines einmalig gespeicherten Artikels; historische Herkunft und Favoriten bleiben unabhängig erhalten.';
create index idx_sniper_query_matches_listing on public.sniper_query_matches(listing_id);
create index idx_sniper_query_matches_recent on public.sniper_query_matches(query_id, first_matched_at desc);
alter table public.sniper_query_matches enable row level security;
revoke all on public.sniper_query_matches from public, anon, authenticated;
grant select on public.sniper_query_matches to authenticated;
grant select, insert, update, delete on public.sniper_query_matches to service_role;
revoke all on sequence public.sniper_query_matches_id_seq from public, anon, authenticated;
grant usage, select on sequence public.sniper_query_matches_id_seq to service_role;
create policy "Administration liest Filterzuordnungen" on public.sniper_query_matches
    for select to authenticated using ((select public.is_platform_operator()));
create policy "Abonnenten lesen Filterzuordnungen" on public.sniper_query_matches
    for select to authenticated using (exists (
        select 1 from public.sniper_query_subscriptions subscription
        where subscription.query_id = sniper_query_matches.query_id
          and public.is_workspace_member(subscription.workspace_id)));

-- Zentrale Suchfilter: vollständige Bedingungen, optimistische Bearbeitung und
-- atomare Übernahme eines einzelnen budgetierten Teilabrufs. Keine Produktivdatenänderung.
create or replace function public.normalize_sniper_keyword(p_value text)
returns text language sql immutable security invoker set search_path = '' as $$
    select btrim(regexp_replace(
        regexp_replace(lower(normalize(p_value, NFKC)), '[-֊־᐀᠆‐‑‒–—―⸗⸚⸺⸻⹀⹝〜〰゠︱︲﹘﹣－𐺭]', ' ', 'g'),
        '[[:space:]]+', ' ', 'g'));
$$;
revoke all on function public.normalize_sniper_keyword(text) from public, anon, authenticated;
grant execute on function public.normalize_sniper_keyword(text) to service_role;

create or replace function public.stamp_sniper_filter_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
    if old.filter_format_version = 1 and new.filter_format_version <> 1 then
        raise exception 'Ein Suchfilter darf nicht auf das alte Format zurückgesetzt werden.' using errcode = '22023';
    end if;
    if (new.title, new.notes, new.poll_interval_ms, new.search_text, new.catalog_id,
        new.brand_id, new.brand_ids, new.brand_names, new.title_keywords, new.keyword_mode,
        new.excluded_title_keywords, new.price_from, new.price_to, new.is_active, new.deleted_at, new.filter_format_version)
       is distinct from
       (old.title, old.notes, old.poll_interval_ms, old.search_text, old.catalog_id,
        old.brand_id, old.brand_ids, old.brand_names, old.title_keywords, old.keyword_mode,
        old.excluded_title_keywords, old.price_from, old.price_to, old.is_active, old.deleted_at, old.filter_format_version) then
        new.filter_revision := old.filter_revision + 1;
    else
        if old.filter_format_version = 1
           and (new.is_seeded, new.seeded_requests, new.request_cursor, new.last_polled_at,
                new.last_status, new.run_state, new.next_attempt_at, new.consecutive_failures)
               is distinct from (old.is_seeded, old.seeded_requests, old.request_cursor, old.last_polled_at,
                old.last_status, old.run_state, old.next_attempt_at, old.consecutive_failures)
           and current_setting('flipbase.sniper_run', true) is distinct from old.id::text || ':' || old.filter_revision::text then
            raise exception 'Dieser Suchfilter benötigt den aktualisierten Abrufdienst.' using errcode = '55000';
        end if;
        -- Betriebsstempel und Cursor sind ausdrücklich keine Formularrevision.
        new.filter_revision := old.filter_revision;
    end if;
    return new;
end;
$$;
revoke all on function public.stamp_sniper_filter_revision() from public, anon, authenticated;
create trigger stamp_sniper_filter_revision before update on public.sniper_queries
    for each row execute function public.stamp_sniper_filter_revision();

create or replace function public.save_sniper_search_filter(
    p_id uuid, p_title text, p_catalog_id integer, p_brands jsonb,
    p_title_keywords text[], p_keyword_mode text, p_poll_interval_ms integer,
    p_notes text, p_expected_revision integer,
    p_search_text text default null, p_price_from numeric default null, p_price_to numeric default null,
    p_excluded_title_keywords text[] default '{}'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_existing public.sniper_queries;
    v_id uuid;
    v_key text;
    v_brand_ids integer[] := '{}';
    v_brand_names text[] := '{}';
    v_keywords text[] := '{}';
    v_excluded_keywords text[] := '{}';
    v_brand jsonb;
    v_brand_id integer;
    v_brand_name text;
    v_keyword text;
    v_changed boolean;
begin
    if not public.is_platform_operator() then
        raise exception 'Nur die Administration darf Suchfilter verwalten.' using errcode = '42501';
    end if;
    p_title := nullif(btrim(regexp_replace(p_title, '[[:space:]]+', ' ', 'g')), '');
    p_notes := nullif(btrim(p_notes), '');
    p_search_text := nullif(btrim(p_search_text), '');
    if p_title is null or length(p_title) > 100 then
        raise exception 'Bitte einen Filternamen mit 1 bis 100 Zeichen angeben.' using errcode = '22023';
    end if;
    if length(p_notes) > 2000 or length(p_search_text) > 200 then
        raise exception 'Notiz oder bestehender Suchtext ist zu lang.' using errcode = '22023';
    end if;
    if p_poll_interval_ms is null or p_poll_interval_ms not between 1000 and 86400000 then
        raise exception 'Der Takt muss zwischen 1 Sekunde und 24 Stunden liegen.' using errcode = '22023';
    end if;
    if p_catalog_id is not null and (p_catalog_id <= 0 or not exists (select 1 from public.vinted_categories where id = p_catalog_id)) then
        raise exception 'Die ausgewählte Vinted-Kategorie ist nicht mehr verfügbar. Bitte neu auswählen.' using errcode = '22023';
    end if;
    if p_brands is null or jsonb_typeof(p_brands) <> 'array' then
        raise exception 'Marken müssen als Liste vorliegen.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_brands) > 10 then
        raise exception 'Bitte höchstens zehn Marken auswählen.' using errcode = '22023';
    end if;
    for v_brand in select value from jsonb_array_elements(p_brands) loop
        if jsonb_typeof(v_brand) is distinct from 'object' or jsonb_typeof(v_brand->'id') is distinct from 'number'
           or jsonb_typeof(v_brand->'name') is distinct from 'string' then
            raise exception 'Eine ausgewählte Marke ist ungültig.' using errcode = '22023';
        end if;
        if (v_brand->>'id')::numeric not between 1 and 2147483647
           or trunc((v_brand->>'id')::numeric) <> (v_brand->>'id')::numeric then
            raise exception 'Eine ausgewählte Markenkennung ist ungültig.' using errcode = '22023';
        end if;
        v_brand_id := (v_brand->>'id')::integer;
        v_brand_name := nullif(btrim(v_brand->>'name'), '');
        if v_brand_name is null or length(v_brand_name) > 100 then
            raise exception 'Eine ausgewählte Marke hat keinen gültigen Namen.' using errcode = '22023';
        end if;
        if not v_brand_id = any(v_brand_ids) then
            v_brand_ids := array_append(v_brand_ids, v_brand_id);
            v_brand_names := array_append(v_brand_names, v_brand_name);
        end if;
    end loop;
    select coalesce(array_agg(id order by id), '{}'), coalesce(array_agg(name order by id), '{}')
        into v_brand_ids, v_brand_names from unnest(v_brand_ids, v_brand_names) as brand(id, name);
    if p_title_keywords is null or cardinality(p_title_keywords) > 10
       or coalesce(array_ndims(p_title_keywords), 1) <> 1 then
        raise exception 'Bitte höchstens zehn Titelbegriffe angeben.' using errcode = '22023';
    end if;
    foreach v_keyword in array p_title_keywords loop
        v_keyword := public.normalize_sniper_keyword(v_keyword);
        if v_keyword is null or length(v_keyword) not between 1 and 80 or v_keyword !~ '[[:alnum:]]' then
            raise exception 'Jeder Titelbegriff braucht 1 bis 80 Zeichen und Buchstaben oder Zahlen.' using errcode = '22023';
        end if;
        if not v_keyword = any(v_keywords) then v_keywords := array_append(v_keywords, v_keyword); end if;
    end loop;
    select coalesce(array_agg(term order by term collate "C"), '{}') into v_keywords from unnest(v_keywords) term;
    if p_excluded_title_keywords is null or cardinality(p_excluded_title_keywords) > 10
       or coalesce(array_ndims(p_excluded_title_keywords), 1) <> 1 then
        raise exception 'Bitte höchstens zehn Titelausschlüsse angeben.' using errcode = '22023';
    end if;
    foreach v_keyword in array p_excluded_title_keywords loop
        v_keyword := public.normalize_sniper_keyword(v_keyword);
        if v_keyword is null or length(v_keyword) not between 1 and 80 or v_keyword !~ '[[:alnum:]]' then
            raise exception 'Jeder Titelausschluss braucht 1 bis 80 Zeichen und Buchstaben oder Zahlen.' using errcode = '22023';
        end if;
        if not v_keyword = any(v_excluded_keywords) then v_excluded_keywords := array_append(v_excluded_keywords, v_keyword); end if;
    end loop;
    select coalesce(array_agg(term order by term collate "C"), '{}') into v_excluded_keywords from unnest(v_excluded_keywords) term;
    if p_keyword_mode is null or p_keyword_mode not in ('all', 'any') then
        raise exception 'Bitte die Verknüpfung der Titelbegriffe auswählen.' using errcode = '22023';
    end if;
    if cardinality(v_keywords) <= 1 then p_keyword_mode := 'all'; end if;
    if p_catalog_id is null and cardinality(v_brand_ids) = 0 and cardinality(v_keywords) = 0 and p_search_text is null then
        raise exception 'Bitte mindestens eine Kategorie, Marke oder einen Titelbegriff auswählen.' using errcode = '22023';
    end if;
    if (p_price_from is not null and (p_price_from < 0 or p_price_from > 9999999999.99 or round(p_price_from, 2) <> p_price_from))
       or (p_price_to is not null and (p_price_to < 0 or p_price_to > 9999999999.99 or round(p_price_to, 2) <> p_price_to))
       or (p_price_from is not null and p_price_to is not null and p_price_from > p_price_to) then
        raise exception 'Bitte gültige Preisgrenzen angeben.' using errcode = '22023';
    end if;
    -- Alte reine Markenfilter behalten exakt ihre bisherige fachliche Identität.
    if cardinality(v_keywords) = 0 and cardinality(v_brand_ids) <= 1 and cardinality(v_excluded_keywords) = 0 then
        v_key := concat_ws('|', 'vinted', 'search=' || coalesce(lower(regexp_replace(p_search_text, '[[:space:]]+', ' ', 'g')), ''),
            'catalog=' || coalesce(p_catalog_id::text, '-'), 'brand=' || coalesce(v_brand_ids[1]::text, '-'),
            'price_from=' || coalesce(trim_scale(p_price_from)::text, '-'), 'price_to=' || coalesce(trim_scale(p_price_to)::text, '-'));
    else
        v_key := 'vinted|filter=' || jsonb_build_array(
            1, lower(regexp_replace(p_search_text, '[[:space:]]+', ' ', 'g')), p_catalog_id,
            v_brand_ids, (select array_agg(term order by term collate "C") from unnest(v_keywords) term),
            p_keyword_mode, p_price_from, p_price_to)::text;
    end if;
    if cardinality(v_excluded_keywords) > 0 then
        v_key := v_key || '|excluded=' || to_jsonb(v_excluded_keywords)::text;
    end if;
    if p_id is null then
        select * into v_existing from public.sniper_queries where query_key = v_key for update;
        if found and v_existing.deleted_at is null then
            raise exception 'Ein Suchfilter mit diesen Bedingungen besteht bereits.' using errcode = '23505';
        end if;
        v_id := v_existing.id;
    else
        select * into v_existing from public.sniper_queries where id = p_id and deleted_at is null for update;
        if not found then raise exception 'Suchfilter nicht gefunden.' using errcode = '22023'; end if;
        if p_expected_revision is distinct from v_existing.filter_revision then
            raise exception 'Der Suchfilter wurde inzwischen geändert. Bitte neu öffnen und Deine Änderungen erneut prüfen.' using errcode = '40001';
        end if;
        if v_existing.marketplace <> 'vinted' then raise exception 'Dieser Marktplatz wird hier nicht unterstützt.' using errcode = '22023'; end if;
        v_id := p_id;
    end if;
    if v_id is null then
        insert into public.sniper_queries(query_key, title, catalog_id, brand_id, brand_ids, brand_names,
            title_keywords, excluded_title_keywords, keyword_mode, filter_format_version, search_text, price_from, price_to,
            poll_interval_ms, notes, is_active)
        values (v_key, p_title, p_catalog_id, case when cardinality(v_brand_ids) = 1 then v_brand_ids[1] end,
            v_brand_ids, v_brand_names, v_keywords, v_excluded_keywords, p_keyword_mode, 1, p_search_text, p_price_from, p_price_to,
            p_poll_interval_ms, p_notes, false) returning id into v_id;
    else
        v_changed := v_existing.query_key is distinct from v_key or v_existing.filter_format_version <> 1 or v_existing.deleted_at is not null;
        update public.sniper_queries set query_key = v_key, title = p_title, catalog_id = p_catalog_id,
            brand_id = case when cardinality(v_brand_ids) = 1 then v_brand_ids[1] end,
            brand_ids = v_brand_ids, brand_names = v_brand_names, title_keywords = v_keywords,
            excluded_title_keywords = v_excluded_keywords,
            keyword_mode = p_keyword_mode, search_text = p_search_text, price_from = p_price_from, price_to = p_price_to,
            poll_interval_ms = p_poll_interval_ms, notes = p_notes, deleted_at = null, filter_format_version = 1,
            is_active = case when v_changed then false else is_active end,
            is_seeded = case when v_changed then false else is_seeded end,
            seeded_requests = case when v_changed then '{}'::integer[] else seeded_requests end,
            request_cursor = case when v_changed then 0 else request_cursor end,
            run_state = case when v_changed then 'ready' else run_state end,
            next_attempt_at = case when v_changed then null else next_attempt_at end,
            last_polled_at = case when v_changed then null else last_polled_at end,
            last_status = case when v_changed then 'never_polled' else last_status end,
            coverage_status = case when v_changed then 'unknown' else coverage_status end,
            coverage_checked_at = case when v_changed then null else coverage_checked_at end,
            last_request_duration_ms = case when v_changed then null else last_request_duration_ms end,
            shared_filter_count = case when v_changed then 1 else shared_filter_count end,
            updated_at = now()
        where id = v_id;
    end if;
    return v_id;
exception when unique_violation then
    raise exception 'Ein Suchfilter mit diesen Bedingungen besteht bereits.' using errcode = '23505';
end;
$$;
revoke all on function public.save_sniper_search_filter(uuid,text,integer,jsonb,text[],text,integer,text,integer,text,numeric,numeric,text[]) from public, anon, authenticated;
grant execute on function public.save_sniper_search_filter(uuid,text,integer,jsonb,text[],text,integer,text,integer,text,numeric,numeric,text[]) to authenticated;

-- Ein alter Dienst darf einen neuen Titel-/Mehrmarkenfilter nicht ungeprüft schreiben.
create or replace function public.guard_sniper_search_filter_ingestion()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_query public.sniper_queries;
begin
    if new.discovered_by_query_id is null then return new; end if;
    select * into v_query from public.sniper_queries where id = new.discovered_by_query_id;
    if v_query.filter_format_version = 1 and current_setting('flipbase.sniper_run', true)
       is distinct from v_query.id::text || ':' || v_query.filter_revision::text then
        raise exception 'Dieser Suchfilter benötigt den aktualisierten Abrufdienst.' using errcode = '55000';
    end if;
    return new;
end;
$$;
revoke all on function public.guard_sniper_search_filter_ingestion() from public, anon, authenticated;
create trigger guard_sniper_search_filter_ingestion before insert on public.sniper_listings
    for each row execute function public.guard_sniper_search_filter_ingestion();

-- Kein dynamischer regulärer Ausdruck aus Nutzereingaben: literale Wortgruppen.
create or replace function public.sniper_title_contains_keyword(p_title text, p_keyword text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
    -- Automatisch erzeugte Unicode-17.0-Bereiche für Buchstaben, Zahlen und kombinierende Zeichen; entspricht dem Node-22-Titelmatcher.
    v_word_characters constant text := '[0-9A-Za-zª²-³µ¹-º¼-¾À-ÖØ-öø-ˁˆ-ˑˠ-ˤˬˮ̀-ʹͶ-ͷͺ-ͽͿΆΈ-ΊΌΎ-ΡΣ-ϵϷ-ҁ҃-ԯԱ-Ֆՙՠ-ֈ֑-ֽֿׁ-ׂׄ-ׇׅא-תׯ-ײؐ-ؚؠ-٩ٮ-ۓە-ۜ۟-۪ۨ-ۼۿܐ-݊ݍ-ޱ߀-ߵߺ߽ࠀ-࠭ࡀ-࡛ࡠ-ࡪࡰ-ࢇࢉ-࢏ࢗ-ࣣ࣡-ॣ०-९ॱ-ঃঅ-ঌএ-ঐও-নপ-রলশ-হ়-ৄে-ৈো-ৎৗড়-ঢ়য়-ৣ০-ৱ৴-৹ৼ৾ਁ-ਃਅ-ਊਏ-ਐਓ-ਨਪ-ਰਲ-ਲ਼ਵ-ਸ਼ਸ-ਹ਼ਾ-ੂੇ-ੈੋ-੍ੑਖ਼-ੜਫ਼੦-ੵઁ-ઃઅ-ઍએ-ઑઓ-નપ-રલ-ળવ-હ઼-ૅે-ૉો-્ૐૠ-ૣ૦-૯ૹ-૿ଁ-ଃଅ-ଌଏ-ଐଓ-ନପ-ରଲ-ଳଵ-ହ଼-ୄେ-ୈୋ-୍୕-ୗଡ଼-ଢ଼ୟ-ୣ୦-୯ୱ-୷ஂ-ஃஅ-ஊஎ-ஐஒ-கங-சஜஞ-டண-தந-பம-ஹா-ூெ-ைொ-்ௐௗ௦-௲ఀ-ఌఎ-ఐఒ-నప-హ఼-ౄె-ైొ-్ౕ-ౖౘ-ౚ౜-ౝౠ-ౣ౦-౯౸-౾ಀ-ಃಅ-ಌಎ-ಐಒ-ನಪ-ಳವ-ಹ಼-ೄೆ-ೈೊ-್ೕ-ೖ೜-ೞೠ-ೣ೦-೯ೱ-ೳഀ-ഌഎ-ഐഒ-ൄെ-ൈൊ-ൎൔ-ൣ൦-൸ൺ-ൿඁ-ඃඅ-ඖක-නඳ-රලව-ෆ්ා-ුූෘ-ෟ෦-෯ෲ-ෳก-ฺเ-๎๐-๙ກ-ຂຄຆ-ຊຌ-ຣລວ-ຽເ-ໄໆ່-໎໐-໙ໜ-ໟༀ༘-༙༠-༳༹༵༷༾-ཇཉ-ཬཱ-྄྆-ྗྙ-ྼ࿆က-၉ၐ-ႝႠ-ჅჇჍა-ჺჼ-ቈቊ-ቍቐ-ቖቘቚ-ቝበ-ኈኊ-ኍነ-ኰኲ-ኵኸ-ኾዀዂ-ዅወ-ዖዘ-ጐጒ-ጕጘ-ፚ፝-፟፩-፼ᎀ-ᎏᎠ-Ᏽᏸ-ᏽᐁ-ᙬᙯ-ᙿᚁ-ᚚᚠ-ᛪᛮ-ᛸᜀ-᜕ᜟ-᜴ᝀ-ᝓᝠ-ᝬᝮ-ᝰᝲ-ᝳក-៓ៗៜ-៝០-៩៰-៹᠋-᠍᠏-᠙ᠠ-ᡸᢀ-ᢪᢰ-ᣵᤀ-ᤞᤠ-ᤫᤰ-᤻᥆-ᥭᥰ-ᥴᦀ-ᦫᦰ-ᧉ᧐-᧚ᨀ-ᨛᨠ-ᩞ᩠-᩿᩼-᪉᪐-᪙ᪧ᪰-᫝᫠-᫫ᬀ-ᭌ᭐-᭙᭫-᭳ᮀ-᯳ᰀ-᰷᱀-᱉ᱍ-ᱽᲀ-ᲊᲐ-ᲺᲽ-Ჿ᳐-᳔᳒-ᳺᴀ-ἕἘ-Ἕἠ-ὅὈ-Ὅὐ-ὗὙὛὝὟ-ώᾀ-ᾴᾶ-ᾼιῂ-ῄῆ-ῌῐ-ΐῖ-Ίῠ-Ῥῲ-ῴῶ-ῼ⁰-ⁱ⁴-⁹ⁿ-₉ₐ-ₜ⃐-⃰ℂℇℊ-ℓℕℙ-ℝℤΩℨK-ℭℯ-ℹℼ-ℿⅅ-ⅉⅎ⅐-↉①-⒛⓪-⓿❶-➓Ⰰ-ⳤⳫ-ⳳ⳽ⴀ-ⴥⴧⴭⴰ-ⵧⵯ⵿-ⶖⶠ-ⶦⶨ-ⶮⶰ-ⶶⶸ-ⶾⷀ-ⷆⷈ-ⷎⷐ-ⷖⷘ-ⷞⷠ-ⷿⸯ々-〇〡-〯〱-〵〸-〼ぁ-ゖ゙-゚ゝ-ゟァ-ヺー-ヿㄅ-ㄯㄱ-ㆎ㆒-㆕ㆠ-ㆿㇰ-ㇿ㈠-㈩㉈-㉏㉑-㉟㊀-㊉㊱-㊿㐀-䶿一-ꒌꓐ-ꓽꔀ-ꘌꘐ-ꘫꙀ-꙲ꙴ-꙽ꙿ-꛱ꜗ-ꜟꜢ-ꞈꞋ-Ƛ꟱-ꠧ꠬꠰-꠵ꡀ-ꡳꢀ-ꣅ꣐-꣙꣠-ꣷꣻꣽ-꤭ꤰ-꥓ꥠ-ꥼꦀ-꧀ꧏ-꧙ꧠ-ꧾꨀ-ꨶꩀ-ꩍ꩐-꩙ꩠ-ꩶꩺ-ꫂꫛ-ꫝꫠ-ꫯꫲ-꫶ꬁ-ꬆꬉ-ꬎꬑ-ꬖꬠ-ꬦꬨ-ꬮꬰ-ꭚꭜ-ꭩꭰ-ꯪ꯬-꯭꯰-꯹가-힣ힰ-ퟆퟋ-ퟻ豈-舘並-龎ﬀ-ﬆﬓ-ﬗיִ-ﬨשׁ-זּטּ-לּמּנּ-סּףּ-פּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-ﷻ︀-️︠-︯ﹰ-ﹴﹶ-ﻼ０-９Ａ-Ｚａ-ｚｦ-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ𐀀-𐀋𐀍-𐀦𐀨-𐀺𐀼-𐀽𐀿-𐁍𐁐-𐁝𐂀-𐃺𐄇-𐄳𐅀-𐅸𐆊-𐆋𐇽𐊀-𐊜𐊠-𐋐𐋠-𐋻𐌀-𐌣𐌭-𐍊𐍐-𐍺𐎀-𐎝𐎠-𐏃𐏈-𐏏𐏑-𐏕𐐀-𐒝𐒠-𐒩𐒰-𐓓𐓘-𐓻𐔀-𐔧𐔰-𐕣𐕰-𐕺𐕼-𐖊𐖌-𐖒𐖔-𐖕𐖗-𐖡𐖣-𐖱𐖳-𐖹𐖻-𐖼𐗀-𐗳𐘀-𐜶𐝀-𐝕𐝠-𐝧𐞀-𐞅𐞇-𐞰𐞲-𐞺𐠀-𐠅𐠈𐠊-𐠵𐠷-𐠸𐠼𐠿-𐡕𐡘-𐡶𐡹-𐢞𐢧-𐢯𐣠-𐣲𐣴-𐣵𐣻-𐤛𐤠-𐤹𐥀-𐥙𐦀-𐦷𐦼-𐧏𐧒-𐨃𐨅-𐨆𐨌-𐨓𐨕-𐨗𐨙-𐨵𐨸-𐨿𐨺-𐩈𐩠-𐩾𐪀-𐪟𐫀-𐫇𐫉-𐫦𐫫-𐫯𐬀-𐬵𐭀-𐭕𐭘-𐭲𐭸-𐮑𐮩-𐮯𐰀-𐱈𐲀-𐲲𐳀-𐳲𐳺-𐴧𐴰-𐴹𐵀-𐵥𐵩-𐵭𐵯-𐶅𐹠-𐹾𐺀-𐺩𐺫-𐺬𐺰-𐺱𐻂-𐻇𐻺-𐼧𐼰-𐽔𐽰-𐾅𐾰-𐿋𐿠-𐿶𑀀-𑁆𑁒-𑁵𑁿-𑂺𑃂𑃐-𑃨𑃰-𑃹𑄀-𑄴𑄶-𑄿𑅄-𑅇𑅐-𑅳𑅶𑆀-𑇄𑇉-𑇌𑇎-𑇚𑇜𑇡-𑇴𑈀-𑈑𑈓-𑈷𑈾-𑉁𑊀-𑊆𑊈𑊊-𑊍𑊏-𑊝𑊟-𑊨𑊰-𑋪𑋰-𑋹𑌀-𑌃𑌅-𑌌𑌏-𑌐𑌓-𑌨𑌪-𑌰𑌲-𑌳𑌵-𑌹𑌻-𑍄𑍇-𑍈𑍋-𑍍𑍐𑍗𑍝-𑍣𑍦-𑍬𑍰-𑍴𑎀-𑎉𑎋𑎎𑎐-𑎵𑎷-𑏀𑏅𑏅𑎸-𑏊𑏌-𑏓𑏡-𑏢𑐀-𑑊𑑐-𑑙𑑞-𑑡𑒀-𑓅𑓇𑓐-𑓙𑖀-𑖵𑖸-𑗀𑗘-𑗝𑘀-𑙀𑙄𑙐-𑙙𑚀-𑚸𑛀-𑛉𑛐-𑛣𑜀-𑜚𑜝-𑜫𑜰-𑜻𑝀-𑝆𑠀-𑠺𑢠-𑣲𑣿-𑤆𑤉𑤌-𑤓𑤕-𑤖𑤘-𑤵𑤷-𑤸𑤻-𑥃𑥐-𑥙𑦠-𑦧𑦪-𑧗𑧚-𑧡𑧣-𑧤𑨀-𑨾𑩇𑩐-𑪙𑪝𑪰-𑫸𑭠-𑭧𑯀-𑯠𑯰-𑯹𑰀-𑰈𑰊-𑰶𑰸-𑱀𑱐-𑱬𑱲-𑲏𑲒-𑲧𑲩-𑲶𑴀-𑴆𑴈-𑴉𑴋-𑴶𑴺𑴼-𑴽𑴿-𑵇𑵐-𑵙𑵠-𑵥𑵧-𑵨𑵪-𑶎𑶐-𑶑𑶓-𑶘𑶠-𑶩𑶰-𑷛𑷠-𑷩𑻠-𑻶𑼀-𑼐𑼒-𑼺𑼾-𑽂𑽐-𑽚𑾰𑿀-𑿔𒀀-𒎙𒐀-𒑮𒒀-𒕃𒾐-𒿰𓀀-𓐯𓑀-𓑕𓑠-𔏺𔐀-𔙆𖄀-𖄹𖠀-𖨸𖩀-𖩞𖩠-𖩩𖩰-𖪾𖫀-𖫉𖫐-𖫭𖫰-𖫴𖬀-𖬶𖭀-𖭃𖭐-𖭙𖭛-𖭡𖭣-𖭷𖭽-𖮏𖵀-𖵬𖵰-𖵹𖹀-𖺖𖺠-𖺸𖺻-𖻓𖼀-𖽊𖽏-𖾇𖾏-𖾟𖿠-𖿡𖿣-𖿤𖿰-𖿶𗀀-𘳕𘳿-𘴞𘶀-𘷲𚿰-𚿳𚿵-𚿻𚿽-𚿾𛀀-𛄢𛄲𛅐-𛅒𛅕𛅤-𛅧𛅰-𛋻𛰀-𛱪𛱰-𛱼𛲀-𛲈𛲐-𛲙𛲝-𛲞𜳰-𜳹𜼀-𜼭𜼰-𜽆𝅥-𝅩𝅭-𝅲𝅻-𝆂𝆅-𝆋𝆪-𝆭𝉂-𝉄𝋀-𝋓𝋠-𝋳𝍠-𝍸𝐀-𝑔𝑖-𝒜𝒞-𝒟𝒢𝒥-𝒦𝒩-𝒬𝒮-𝒹𝒻𝒽-𝓃𝓅-𝔅𝔇-𝔊𝔍-𝔔𝔖-𝔜𝔞-𝔹𝔻-𝔾𝕀-𝕄𝕆𝕊-𝕐𝕒-𝚥𝚨-𝛀𝛂-𝛚𝛜-𝛺𝛼-𝜔𝜖-𝜴𝜶-𝝎𝝐-𝝮𝝰-𝞈𝞊-𝞨𝞪-𝟂𝟄-𝟋𝟎-𝟿𝨀-𝨶𝨻-𝩬𝩵𝪄𝪛-𝪟𝪡-𝪯𝼀-𝼞𝼥-𝼪𞀀-𞀆𞀈-𞀘𞀛-𞀡𞀣-𞀤𞀦-𞀪𞀰-𞁭𞂏𞄀-𞄬𞄰-𞄽𞅀-𞅉𞅎𞊐-𞊮𞋀-𞋹𞓐-𞓹𞗐-𞗺𞛀-𞛞𞛠-𞛵𞛾-𞛿𞟠-𞟦𞟨-𞟫𞟭-𞟮𞟰-𞟾𞠀-𞣄𞣇-𞣖𞤀-𞥋𞥐-𞥙𞱱-𞲫𞲭-𞲯𞲱-𞲴𞴁-𞴭𞴯-𞴽𞸀-𞸃𞸅-𞸟𞸡-𞸢𞸤𞸧𞸩-𞸲𞸴-𞸷𞸹𞸻𞹂𞹇𞹉𞹋𞹍-𞹏𞹑-𞹒𞹔𞹗𞹙𞹛𞹝𞹟𞹡-𞹢𞹤𞹧-𞹪𞹬-𞹲𞹴-𞹷𞹹-𞹼𞹾𞺀-𞺉𞺋-𞺛𞺡-𞺣𞺥-𞺩𞺫-𞺻🄀-🄌🯰-🯹𠀀-𪛟𪜀-𫠝𫠠-𬺭𬺰-𮯠𮯰-𮹝丽-𪘀𰀀-𱍊𱍐-𳑹󠄀-󠇯]';
    v_offset integer := 1; v_start integer; v_end integer;
begin
    if p_title is null or p_keyword is null or p_keyword = '' then return false; end if;
    loop
        v_start := strpos(substr(p_title, v_offset), p_keyword);
        if v_start = 0 then return false; end if;
        v_start := v_start + v_offset - 1;
        v_end := v_start + length(p_keyword);
        if (v_start = 1 or substr(p_title, v_start - 1, 1) !~ v_word_characters)
           and (v_end > length(p_title) or substr(p_title, v_end, 1) !~ v_word_characters) then return true; end if;
        v_offset := v_start + 1;
    end loop;
end;
$$;
revoke all on function public.sniper_title_contains_keyword(text,text) from public, anon, authenticated;
grant execute on function public.sniper_title_contains_keyword(text,text) to service_role;

create or replace function public.sniper_search_filter_matches_title(p_query public.sniper_queries, p_title text)
returns boolean language sql immutable security invoker set search_path = '' as $$
    select p_title is not null and (
        cardinality(p_query.title_keywords) = 0
        or case when p_query.keyword_mode = 'all' then not exists (
            select 1 from unnest(p_query.title_keywords) term
            where not public.sniper_title_contains_keyword(public.normalize_sniper_keyword(p_title), term))
        else exists (select 1 from unnest(p_query.title_keywords) term
            where public.sniper_title_contains_keyword(public.normalize_sniper_keyword(p_title), term)) end)
        and not exists (select 1 from unnest(p_query.excluded_title_keywords) term
            where public.sniper_title_contains_keyword(public.normalize_sniper_keyword(p_title), term));
$$;
revoke all on function public.sniper_search_filter_matches_title(public.sniper_queries,text) from public, anon, authenticated;
grant execute on function public.sniper_search_filter_matches_title(public.sniper_queries,text) to service_role;

create or replace function public.complete_sniper_search_filter_run(
    p_query_id uuid, p_revision integer, p_cursor integer, p_listings jsonb, p_diagnostics jsonb default '{}'
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_query public.sniper_queries;
    v_count integer;
    v_index integer;
    v_created integer;
    v_hits integer;
    v_seed boolean;
    v_external_ids text[];
    v_new_matches uuid[];
begin
    select * into v_query from public.sniper_queries where id = p_query_id for update;
    if not found or v_query.deleted_at is not null or not v_query.is_active
       or v_query.filter_revision is distinct from p_revision or v_query.request_cursor is distinct from p_cursor then
        return jsonb_build_object('accepted', false, 'created', 0, 'seeded', false, 'hits', 0);
    end if;
    if v_query.filter_format_version <> 1 then raise exception 'Ungültiges Suchfilterformat.' using errcode = '22023'; end if;
    if v_query.catalog_id is not null and not exists (select 1 from public.vinted_categories where id = v_query.catalog_id) then
        update public.sniper_queries set is_active = false, run_state = 'invalid',
            last_error_kind = 'invalid_category', last_error_message = 'Die Kategorie ist nicht mehr verfügbar.', updated_at = now() where id = p_query_id;
        return jsonb_build_object('accepted', false, 'created', 0, 'seeded', false, 'hits', 0);
    end if;
    if p_listings is null or jsonb_typeof(p_listings) <> 'array' then raise exception 'Ungültiges Artikelpaket.' using errcode = '22023'; end if;
    if jsonb_array_length(p_listings) > 288 then raise exception 'Zu viele Artikel in einem Abruf.' using errcode = '22023'; end if;
    if p_diagnostics is null or jsonb_typeof(p_diagnostics) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_diagnostics) key where key not in ('coverage','duration_ms','source_pages','shared_filter_count'))
       or (p_diagnostics ? 'coverage' and (jsonb_typeof(p_diagnostics->'coverage') <> 'string' or p_diagnostics->>'coverage' not in ('unknown','initial','caught_up','limited')))
       or (p_diagnostics ? 'duration_ms' and (jsonb_typeof(p_diagnostics->'duration_ms') <> 'number' or (p_diagnostics->>'duration_ms')::numeric not between 0 and 86400000 or trunc((p_diagnostics->>'duration_ms')::numeric) <> (p_diagnostics->>'duration_ms')::numeric))
       or (p_diagnostics ? 'source_pages' and (jsonb_typeof(p_diagnostics->'source_pages') <> 'number' or (p_diagnostics->>'source_pages')::numeric not between 1 and 3 or trunc((p_diagnostics->>'source_pages')::numeric) <> (p_diagnostics->>'source_pages')::numeric))
       or (p_diagnostics ? 'shared_filter_count' and (jsonb_typeof(p_diagnostics->'shared_filter_count') <> 'number' or (p_diagnostics->>'shared_filter_count')::numeric not between 1 and 10000 or trunc((p_diagnostics->>'shared_filter_count')::numeric) <> (p_diagnostics->>'shared_filter_count')::numeric)) then
        raise exception 'Ungültige Abrufdiagnose.' using errcode = '22023';
    end if;
    -- Titelregeln zusätzlich im geschützten Schreibweg prüfen; Beschreibung zählt nie.
    select coalesce(jsonb_agg(item), '[]'::jsonb) into p_listings from (
        select distinct on (item->>'external_id') item
        from jsonb_array_elements(p_listings) item
        where public.sniper_search_filter_matches_title(v_query, item->>'title')
        order by item->>'external_id'
    ) accepted;
    v_count := greatest(cardinality(v_query.brand_ids), 1) * case
        when v_query.search_text is not null or v_query.keyword_mode = 'all' then 1
        else greatest(cardinality(v_query.title_keywords), 1) end;
    if p_cursor < 0 or p_cursor >= 2147483647 then raise exception 'Ungültige Abrufposition.' using errcode = '22023'; end if;
    v_index := p_cursor % v_count;
    v_seed := not v_index = any(v_query.seeded_requests);
    perform set_config('flipbase.sniper_run', v_query.id::text || ':' || v_query.filter_revision::text, true);
    with inserted as (
        insert into public.sniper_listings(marketplace, external_id, title, url, description, image_urls,
            item_price, total_price, currency, brand, size, condition, country_code, seller_name,
            seller_avatar_url, seller_rating, seller_review_count, is_hidden, item_updated_at,
            photo_uploaded_at, discovered_by_query_id, watchlist_evaluated_at)
        select v_query.marketplace, item.external_id, item.title, item.url, item.description, coalesce(item.image_urls, '{}'),
            item.item_price, item.total_price, item.currency, item.brand, item.size, item.condition,
            item.country_code, item.seller_name, item.seller_avatar_url, item.seller_rating, item.seller_review_count,
            coalesce(item.is_hidden, false), item.item_updated_at, item.photo_uploaded_at, p_query_id, case when v_seed then now() end
        from jsonb_to_recordset(p_listings) item(external_id text, title text, url text, description text, image_urls text[],
            item_price numeric, total_price numeric, currency text, brand text, size text, condition text,
            country_code text, seller_name text, seller_avatar_url text, seller_rating numeric,
            seller_review_count integer, is_hidden boolean, item_updated_at timestamptz, photo_uploaded_at timestamptz)
        on conflict (marketplace, external_id) do nothing returning 1
    ) select count(*)::integer into v_created from inserted;
    select coalesce(array_agg(item->>'external_id'), '{}') into v_external_ids from jsonb_array_elements(p_listings) item;
    with matched as (
        insert into public.sniper_query_matches(query_id, listing_id, filter_revision, is_seed)
        select p_query_id, listing.id, p_revision, v_seed
        from public.sniper_listings listing
        where listing.marketplace = v_query.marketplace and listing.external_id = any(v_external_ids)
        on conflict (query_id, listing_id) do nothing returning listing_id
    ) select coalesce(array_agg(listing_id), '{}') into v_new_matches from matched;
    -- Ein gleichzeitig neu eingelesener Filter darf einen frischen Fund eines
    -- bereits gesäten Filters nicht stumm schalten. Älterer Erstbestand und
    -- bereits über echte Abrufe bewertete Artikel bleiben dagegen unverändert.
    if not v_seed then
        update public.sniper_listings listing set watchlist_evaluated_at = null
        where listing.id = any(v_new_matches) and listing.watchlist_evaluated_at is not null
          and listing.first_seen_at > coalesce(v_query.last_success_at, v_query.created_at)
          and exists (select 1 from public.sniper_query_matches matched
              where matched.listing_id = listing.id and matched.is_seed)
          and not exists (select 1 from public.sniper_query_matches matched
              where matched.listing_id = listing.id and not matched.is_seed and matched.query_id <> p_query_id);
    end if;
    -- Eine Oberkategorie ist keine bekannte Blattkategorie für Preisvergleiche.
    if exists (select 1 from public.vinted_categories where id = v_query.catalog_id and is_leaf) then
        perform public.record_sniper_listing_category(p_query_id, v_external_ids);
    end if;
    v_hits := public.sniper_evaluate_watchlist_hits(p_query_id, not v_seed);
    if v_seed then v_query.seeded_requests := array_append(v_query.seeded_requests, v_index); end if;
    update public.sniper_queries set seeded_requests = v_query.seeded_requests,
        is_seeded = cardinality(v_query.seeded_requests) = v_count,
        request_cursor = p_cursor + 1, run_state = 'ready', next_attempt_at = null,
        last_attempt_at = now(), last_success_at = now(), last_polled_at = now(), last_status = 'ok',
        consecutive_failures = 0, coverage_status = coalesce(p_diagnostics->>'coverage', 'unknown'),
        coverage_checked_at = now(), last_request_duration_ms = (p_diagnostics->>'duration_ms')::integer,
        shared_filter_count = coalesce((p_diagnostics->>'shared_filter_count')::integer, 1),
        updated_at = now() where id = p_query_id;
    perform set_config('flipbase.sniper_run', '', true);
    return jsonb_build_object('accepted', true, 'created', v_created, 'seeded', v_seed, 'hits', v_hits);
end;
$$;
revoke all on function public.complete_sniper_search_filter_run(uuid,integer,integer,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.complete_sniper_search_filter_run(uuid,integer,integer,jsonb,jsonb) to service_role;

create or replace function public.record_sniper_search_filter_failure(
    p_query_id uuid, p_revision integer, p_cursor integer, p_run_state text, p_next_attempt_at timestamptz,
    p_error_kind text, p_error_message text, p_failure_count integer, p_status text
)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_query public.sniper_queries;
begin
    select * into v_query from public.sniper_queries where id = p_query_id for update;
    if not found or not v_query.is_active or v_query.deleted_at is not null
       or v_query.filter_revision is distinct from p_revision or v_query.request_cursor is distinct from p_cursor then return; end if;
    if v_query.filter_format_version <> 1 then raise exception 'Ungültiges Suchfilterformat.' using errcode = '22023'; end if;
    perform set_config('flipbase.sniper_run', v_query.id::text || ':' || v_query.filter_revision::text, true);
    update public.sniper_queries set run_state = p_run_state, next_attempt_at = p_next_attempt_at,
        last_attempt_at = now(), last_error_kind = p_error_kind, last_error_at = now(),
        last_error_message = left(p_error_message, 500), last_polled_at = now(), last_status = p_status,
        consecutive_failures = p_failure_count, updated_at = now() where id = p_query_id;
    perform set_config('flipbase.sniper_run', '', true);
end;
$$;
revoke all on function public.record_sniper_search_filter_failure(uuid,integer,integer,text,timestamptz,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.record_sniper_search_filter_failure(uuid,integer,integer,text,timestamptz,text,text,integer,text) to service_role;

-- Zugeordnete Artikel zählen für jeden passenden Filter; ältere Herkunft bleibt gültig.
create or replace function public.record_sniper_listing_category(p_query_id uuid, p_external_ids text[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
    if cardinality(p_external_ids) > 288 then
        raise exception 'Zu viele Artikel in einem Paket.' using errcode = '22023';
    end if;
    update public.sniper_listings as listing
    set catalog_id = query.catalog_id, catalog_source_query_id = query.id
    from public.sniper_queries as query
    where query.id = p_query_id and query.catalog_id is not null
      and listing.catalog_id is null and listing.marketplace = query.marketplace
      and listing.external_id = any(p_external_ids);
end;
$$;
revoke all on function public.record_sniper_listing_category(uuid,text[]) from public, anon, authenticated;
grant execute on function public.record_sniper_listing_category(uuid,text[]) to service_role;

create or replace function public.sniper_watchlist_matches(p_watchlist public.sniper_watchlists, p_listing public.sniper_listings)
returns boolean language sql stable security invoker set search_path = '' as $$
    select (p_watchlist.catalog_id is null or p_watchlist.catalog_id = p_listing.catalog_id)
       and (p_watchlist.brand is null or lower(btrim(p_watchlist.brand)) = lower(btrim(p_listing.brand)))
       and (p_watchlist.legacy_brand_id is null or exists (
           select 1 from public.sniper_queries query
           where (query.id = p_listing.discovered_by_query_id or exists (
               select 1 from public.sniper_query_matches matched where matched.query_id = query.id and matched.listing_id = p_listing.id))
             and (query.brand_id = p_watchlist.legacy_brand_id or exists (
                 select 1 from unnest(query.brand_ids,query.brand_names) as selected_brand(id,name)
                 where selected_brand.id = p_watchlist.legacy_brand_id
                   and lower(btrim(selected_brand.name)) = lower(btrim(p_listing.brand))))))
       and (p_watchlist.search_text is null or strpos(lower(p_listing.title || ' ' || coalesce(p_listing.description, '')), lower(p_watchlist.search_text)) > 0)
       and (p_watchlist.condition is null or p_watchlist.condition = p_listing.condition)
       and (p_watchlist.price_from is null or p_listing.item_price >= p_watchlist.price_from)
       and (p_watchlist.price_to is null or p_listing.item_price <= p_watchlist.price_to)
       and p_listing.currency = 'EUR';
$$;
revoke all on function public.sniper_watchlist_matches(public.sniper_watchlists,public.sniper_listings) from public, anon, authenticated;
grant execute on function public.sniper_watchlist_matches(public.sniper_watchlists,public.sniper_listings) to service_role;

create or replace function public.sniper_evaluate_watchlist_hits(p_query_id uuid, p_report_hits boolean default true)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_created integer;
begin
    if not p_report_hits then
        update public.sniper_listings set watchlist_evaluated_at = now()
        where watchlist_evaluated_at is null and exists (
            select 1 from public.sniper_queries query where query.id = p_query_id and (
                query.filter_format_version = 0 or exists (
                    select 1 from public.sniper_query_matches matched where matched.query_id = p_query_id
                        and matched.listing_id = sniper_listings.id and matched.is_seed)))
          and discovered_by_query_id = p_query_id;
        return 0;
    end if;
    with pending as materialized (
        select listing.* from public.sniper_listings as listing
        where (listing.discovered_by_query_id = p_query_id or listing.catalog_source_query_id = p_query_id
            or exists (select 1 from public.sniper_query_matches matched
                where matched.query_id = p_query_id and matched.listing_id = listing.id and not matched.is_seed))
          and listing.watchlist_evaluated_at is null
          and listing.currency = 'EUR' and listing.item_price > 0 and listing.item_price < 'Infinity'::numeric
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
    ) select count(*)::integer into v_created from inserted;
    return v_created;
end;
$$;
revoke all on function public.sniper_evaluate_watchlist_hits(uuid,boolean) from public, anon, authenticated;
grant execute on function public.sniper_evaluate_watchlist_hits(uuid,boolean) to service_role;

create or replace function public.sniper_query_listing_counts()
returns table (query_id uuid, listing_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.is_platform_operator() then raise exception 'Nur fuer die Administration' using errcode = '42501'; end if;
    return query with associations as (
        select matched.query_id as filter_id, matched.listing_id
        from public.sniper_query_matches matched
        join public.sniper_listings listing on listing.id = matched.listing_id
        where matched.first_matched_at >= now() - interval '24 hours'
        union
        select listing.discovered_by_query_id, listing.id from public.sniper_listings listing
        where listing.first_seen_at >= now() - interval '24 hours' and listing.discovered_by_query_id is not null
    ) select filter_id, count(*) from associations group by filter_id;
end;
$$;
revoke all on function public.sniper_query_listing_counts() from public, anon, authenticated;
grant execute on function public.sniper_query_listing_counts() to authenticated;
