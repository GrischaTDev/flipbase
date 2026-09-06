\set ON_ERROR_STOP on

begin;

select plan(9);

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

select * from finish();

rollback;
