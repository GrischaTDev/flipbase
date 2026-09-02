\set ON_ERROR_STOP on

begin;

select plan(4);

-- Spalten von sniper_query_subscriptions
do $$
declare
  required_columns text[] := array[
    'id', 'workspace_id', 'query_id', 'discount_threshold_percent',
    'is_active', 'created_at'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sniper_query_subscriptions'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'sniper_query_subscriptions is missing required columns: %', missing_columns;
  end if;
end;
$$;

select pass('sniper_query_subscriptions besitzt alle benoetigten Spalten');

-- Preisuntergrenze an der Abfrage
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sniper_queries'
      and column_name = 'price_from'
  ) then
    raise exception 'sniper_queries.price_from fehlt';
  end if;
end;
$$;

select pass('sniper_queries kennt eine Preisuntergrenze');

-- Ein Arbeitsbereich abonniert eine Abfrage hoechstens einmal.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sniper_query_subscriptions'::regclass
      and contype = 'u'
      and array_length(conkey, 1) = 2
  ) then
    raise exception 'Eindeutigkeit ueber workspace_id und query_id fehlt';
  end if;
end;
$$;

select pass('Ein Arbeitsbereich abonniert eine Abfrage hoechstens einmal');

-- RLS aktiv, und angemeldete Nutzer duerfen nicht schreiben.
do $$
declare
  write_policies text[];
begin
  if not exists (
    select 1 from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and relname = 'sniper_query_subscriptions'
      and relrowsecurity
  ) then
    raise exception 'row level security ist auf sniper_query_subscriptions aus';
  end if;

  select array_agg(policyname order by policyname)
  into write_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'sniper_query_subscriptions'
    and cmd <> 'SELECT'
    and 'authenticated' = any(roles);

  if write_policies is not null then
    raise exception 'authenticated darf nicht schreiben, gefunden: %', write_policies;
  end if;
end;
$$;

select pass('RLS ist aktiv und angemeldete Nutzer duerfen nur lesen');

select * from finish();

rollback;
