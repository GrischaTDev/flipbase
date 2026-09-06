\set ON_ERROR_STOP on

begin;

select plan(12);

-- Spalten von vinted_categories
do $$
declare
  required_columns text[] := array[
    'id', 'parent_id', 'title', 'slug', 'path', 'is_leaf', 'updated_at'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'vinted_categories'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'Fehlende Spalten in vinted_categories: %', missing_columns;
  end if;
end;
$$;

select pass('vinted_categories hat alle erwarteten Spalten');

-- Spalten von vinted_category_syncs
do $$
declare
  required_columns text[] := array[
    'id', 'refreshed_at', 'requested_at', 'last_attempt_at', 'category_count', 'last_error'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'vinted_category_syncs'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'Fehlende Spalten in vinted_category_syncs: %', missing_columns;
  end if;
end;
$$;

select pass('vinted_category_syncs hat alle erwarteten Spalten');

-- RLS ist auf beiden Tabellen aktiv
select is(
  (select relrowsecurity from pg_class where oid = 'public.vinted_categories'::regclass),
  true,
  'vinted_categories hat RLS aktiviert'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.vinted_category_syncs'::regclass),
  true,
  'vinted_category_syncs hat RLS aktiviert'
);

-- Genau eine Zeile im Auffrischungsstand, und sie laesst sich nicht vermehren
select is(
  (select count(*)::integer from public.vinted_category_syncs),
  1,
  'vinted_category_syncs enthaelt genau eine Zeile'
);

do $$
begin
  begin
    insert into public.vinted_category_syncs (id) values (2);
    raise exception 'Eine zweite Zeile haette abgelehnt werden muessen';
  exception
    when check_violation then
      null;
  end;
end;
$$;

select pass('vinted_category_syncs laesst keine zweite Zeile zu');

-- Anonyme duerfen nicht einmal lesen - kein Tabellenrecht, keine Policy
set local role anon;

select throws_ok(
  'select count(*) from public.vinted_categories',
  '42501',
  null,
  'anon darf die Kategorien nicht einmal lesen'
);

select throws_ok(
  'select count(*) from public.vinted_category_syncs',
  '42501',
  null,
  'anon darf den Auffrischungsstand nicht einmal lesen'
);

reset role;

-- Der Elternverweis zeigt auf dieselbe Tabelle
select is(
  (
    select confrelid::regclass::text
    from pg_constraint
    where conrelid = 'public.vinted_categories'::regclass
      and contype = 'f'
      and conname like '%parent%'
  ),
  'vinted_categories',
  'parent_id verweist auf vinted_categories'
);

-- Die Anforderung wird gestempelt, nicht uebermittelt.
--
-- Ohne den Trigger stuende hier der uebergebene Wert aus dem Jahr 2099 - eine
-- vorgehende Uhr im Browser des Betreibers liesse die Anforderung so lange als
-- offen gelten, und der Dienst laese bei jedem Takt neu ein.
do $$
declare
  gestempelt timestamptz;
begin
  update public.vinted_category_syncs
  set requested_at = '2099-01-01T00:00:00+00:00'::timestamptz
  where id = 1;

  select requested_at into gestempelt
  from public.vinted_category_syncs where id = 1;

  if gestempelt is null or gestempelt > now() or gestempelt < now() - interval '1 minute' then
    raise exception 'Der Trigger haette requested_at auf now() setzen muessen, steht aber auf %', gestempelt;
  end if;
end;
$$;

select pass('requested_at wird von der Datenbank gestempelt, nicht vom Aufrufer');

-- Ein Lauf des Dienstes darf keine neue Anforderung ausloesen.
--
-- Der Dienst schreibt refreshed_at, last_attempt_at, category_count und
-- last_error in dieselbe Zeile. Stempelte der Trigger dabei mit, waere nach
-- jedem Lauf sofort wieder eine Anforderung offen und der Dienst liefe im
-- Kreis - genau der Dauerlauf, den diese Aufgabe abstellt.
do $$
declare
  vorher constant timestamptz := '2020-01-01T00:00:00+00:00';
  nachher timestamptz;
begin
  -- Der Ausgangswert wird bei abgeschaltetem Trigger gesetzt, und zwar
  -- ausdruecklich nicht auf now(): Innerhalb einer Transaktion liefert now()
  -- immer denselben Wert. Ein gestempeltes now() waere von einem von Hand
  -- gesetzten now() nicht zu unterscheiden, und der Test koennte gar nicht
  -- fehlschlagen.
  alter table public.vinted_category_syncs disable trigger stamp_vinted_category_request;

  update public.vinted_category_syncs set requested_at = vorher where id = 1;

  alter table public.vinted_category_syncs enable trigger stamp_vinted_category_request;

  update public.vinted_category_syncs
  set refreshed_at = now(), last_attempt_at = now(), category_count = 2920, last_error = null
  where id = 1;

  select requested_at into nachher
  from public.vinted_category_syncs where id = 1;

  if nachher is distinct from vorher then
    raise exception 'Ein Lauf des Dienstes hat requested_at veraendert: % statt %', nachher, vorher;
  end if;
end;
$$;

select pass('Ein Lauf des Dienstes stempelt keine neue Anforderung');

-- Eine Anforderung laesst sich zuruecknehmen.
--
-- Ein ausdrueckliches null bleibt null. Sonst liesse sich der Stand nie
-- zuruecksetzen - auch nicht im Aufraeumen der Integrationstests des Dienstes.
do $$
declare
  danach timestamptz;
begin
  update public.vinted_category_syncs set requested_at = now() where id = 1;
  update public.vinted_category_syncs set requested_at = null where id = 1;

  select requested_at into danach
  from public.vinted_category_syncs where id = 1;

  if danach is not null then
    raise exception 'requested_at haette sich auf null zuruecksetzen lassen muessen, steht aber auf %', danach;
  end if;
end;
$$;

select pass('Eine Anforderung laesst sich wieder zuruecknehmen');

select * from finish();

rollback;
