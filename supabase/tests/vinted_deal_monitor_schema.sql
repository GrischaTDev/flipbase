\set ON_ERROR_STOP on

begin;

select plan(9);

-- Spalten von sniper_queries
do $$
declare
  required_columns text[] := array[
    'id', 'query_key', 'marketplace', 'search_text', 'catalog_id', 'brand_id',
    'price_to', 'is_standard', 'poll_interval_ms', 'is_seeded', 'is_active',
    'last_polled_at', 'last_status', 'consecutive_failures'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sniper_queries'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'sniper_queries is missing required columns: %', missing_columns;
  end if;
end;
$$;

select pass('sniper_queries besitzt alle benoetigten Spalten');

-- Spalten von sniper_listings
do $$
declare
  required_columns text[] := array[
    'id', 'marketplace', 'external_id', 'title', 'url', 'description',
    'image_urls', 'item_price', 'total_price', 'currency', 'brand', 'size',
    'condition', 'country_code', 'seller_name', 'seller_avatar_url',
    'seller_rating', 'seller_review_count', 'is_hidden', 'item_updated_at',
    'photo_uploaded_at', 'discovered_by_query_id', 'first_seen_at'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sniper_listings'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'sniper_listings is missing required columns: %', missing_columns;
  end if;
end;
$$;

select pass('sniper_listings besitzt alle benoetigten Spalten');

-- Verkaeuferdaten: genau diese vier, kein Feld mehr.
--
-- Frueher verbot diese Pruefung jede Verkaeuferspalte. Am 02.09.2026 wurde
-- bewusst entschieden, Name, Profilbild und Bewertung aufzunehmen - die
-- Bewertung entscheidet mit, ob ein Fund ueberhaupt taugt. Der Riegel bleibt
-- trotzdem: Der Katalog liefert weit mehr Personenbezug mit, als hier stehen
-- soll, und ohne diese Pruefung wandert er beim naechsten Feld unbemerkt mit.
do $$
declare
  allowed_columns text[] := array[
    'seller_name', 'seller_avatar_url', 'seller_rating', 'seller_review_count'
  ];
  unexpected_columns text[];
begin
  select array_agg(column_name order by column_name)
  into unexpected_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'sniper_listings'
    and (
      column_name like '%seller%'
      or column_name like '%user%'
      or column_name like '%profile%'
      or column_name like '%login%'
      or column_name like '%email%'
      or column_name like '%address%'
    )
    and column_name <> all(allowed_columns);

  if unexpected_columns is not null then
    raise exception 'sniper_listings stores unapproved personal data: %', unexpected_columns;
  end if;
end;
$$;

select pass('sniper_listings speichert nur die vier freigegebenen Verkaeuferfelder');

-- Beide Preise getrennt und nicht optional. Ohne den reinen Artikelpreis
-- laesst sich keine Marge rechnen, ohne den Gesamtpreis nicht der Abbuchung
-- gegenpruefen.
do $$
declare
  nullable_prices text[];
begin
  select array_agg(column_name order by column_name)
  into nullable_prices
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'sniper_listings'
    and column_name in ('item_price', 'total_price')
    and is_nullable = 'YES';

  if nullable_prices is not null then
    raise exception 'both prices must be mandatory, nullable: %', nullable_prices;
  end if;
end;
$$;

select pass('Artikelpreis und Gesamtpreis sind beide Pflicht');

-- RLS ist aktiv
do $$
declare
  unprotected text[];
begin
  select array_agg(relname order by relname)
  into unprotected
  from pg_class
  join pg_namespace on pg_namespace.oid = pg_class.relnamespace
  where pg_namespace.nspname = 'public'
    and relname in ('sniper_queries', 'sniper_listings')
    and relrowsecurity = false;

  if unprotected is not null then
    raise exception 'row level security is disabled on: %', unprotected;
  end if;
end;
$$;

select pass('RLS ist auf beiden Sniper-Tabellen aktiv');

-- Angemeldete Nutzer duerfen lesen, aber nicht schreiben.
do $$
declare
  write_policies text[];
  read_policies integer;
begin
  select array_agg(policyname order by policyname)
  into write_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('sniper_queries', 'sniper_listings')
    and cmd <> 'SELECT'
    and 'authenticated' = any(roles);

  if write_policies is not null then
    raise exception 'authenticated must not have write policies, found: %', write_policies;
  end if;

  select count(*)
  into read_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('sniper_queries', 'sniper_listings')
    and cmd = 'SELECT'
    and 'authenticated' = any(roles);

  if read_policies <> 2 then
    raise exception 'expected exactly 2 select policies for authenticated, found %', read_policies;
  end if;
end;
$$;

select pass('Angemeldete duerfen lesen, aber nicht schreiben');

-- anon darf auf keiner der beiden Tabellen irgendetwas.
--
-- deal_monitor_subscriptions.sql und deal_monitor_hits.sql pruefen das schon
-- fuer ihre eigenen Tabellen; sniper_queries und sniper_listings hatten
-- bislang keine solche Pruefung, obwohl dieser Zweig anon hier genau das
-- truncate-Recht entzogen hat (20260902194744_restrict_sniper_tables.sql).
-- Ohne diese Pruefung faellt ein zurueckkehrendes Recht niemandem auf.
do $$
declare
  anon_rechte text[];
begin
  select array_agg(distinct privilege_type order by privilege_type)
  into anon_rechte
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('sniper_queries', 'sniper_listings')
    and grantee = 'anon';

  if anon_rechte is not null then
    raise exception 'anon haelt noch Rechte auf sniper_queries/sniper_listings: %', anon_rechte;
  end if;
end;
$$;

select pass('anon hat keinerlei Rechte auf sniper_queries und sniper_listings');

-- authenticated darf auf beiden Tabellen genau lesen - nicht mehr.
do $$
declare
  tabelle text;
  rechte text[];
begin
  foreach tabelle in array array['sniper_queries', 'sniper_listings']
  loop
    select array_agg(privilege_type order by privilege_type)
    into rechte
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = tabelle
      and grantee = 'authenticated';

    if rechte is distinct from array['SELECT'] then
      raise exception 'authenticated soll auf % genau SELECT haben, hat aber: %', tabelle, rechte;
    end if;
  end loop;
end;
$$;

select pass('authenticated darf sniper_queries und sniper_listings genau lesen');

-- anon haelt auf keiner Sniper-Tabelle irgendein Recht.
--
-- Am 04.09.2026 auf der Produktionsdatenbank gemessen: dort hatte anon
-- delete, insert, select und update auf sniper_queries und sniper_listings,
-- lokal nichts davon. Erzeugte Rechte-Anweisungen bilden immer die Maschine
-- ab, auf der sie entstanden - diese Pruefung faellt auf, sobald irgendeine
-- Umgebung abweicht.
do $$
declare
  offene text[];
begin
  select array_agg(table_name || '.' || privilege_type order by table_name, privilege_type)
  into offene
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name like 'sniper%'
    and grantee = 'anon';

  if offene is not null then
    raise exception 'anon haelt noch Rechte auf Sniper-Tabellen: %', offene;
  end if;
end;
$$;

select pass('anon hat auf keiner Sniper-Tabelle ein Recht');

select * from finish();

rollback;
