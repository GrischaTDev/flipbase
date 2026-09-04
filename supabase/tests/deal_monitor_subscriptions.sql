\set ON_ERROR_STOP on

begin;

select plan(7);

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

-- anon darf auf der Abonnement-Tabelle gar nichts.
--
-- Die Voreinstellung von Supabase vergibt an anon truncate, references,
-- trigger und maintain. truncate umgeht RLS vollstaendig - eine nicht
-- angemeldete Rolle darf das nicht behalten, und `supabase db diff`
-- uebertraegt Rechte nicht aus dem Schema, es faellt also sonst niemandem auf.
do $$
declare
  anon_rechte text[];
begin
  select array_agg(privilege_type order by privilege_type)
  into anon_rechte
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'sniper_query_subscriptions'
    and grantee = 'anon';

  if anon_rechte is not null then
    raise exception 'anon haelt noch Rechte auf sniper_query_subscriptions: %', anon_rechte;
  end if;
end;
$$;

select pass('anon hat keinerlei Rechte auf der Abonnement-Tabelle');

-- authenticated darf genau lesen - nicht mehr.
--
-- Diese Pruefung fehlte zuerst und haette den Fehler verdeckt: anon war
-- sauber, authenticated behielt aber truncate, was RLS ebenso umgeht.
do $$
declare
  rechte text[];
begin
  select array_agg(privilege_type order by privilege_type)
  into rechte
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'sniper_query_subscriptions'
    and grantee = 'authenticated';

  if rechte is distinct from array['SELECT'] then
    raise exception 'authenticated soll genau SELECT haben, hat aber: %', rechte;
  end if;
end;
$$;

select pass('authenticated darf die Abonnement-Tabelle genau lesen');

-- Abfragen sind nur fuer Abonnenten sichtbar.
do $$
declare
  offene_policy text;
begin
  select policyname
  into offene_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'sniper_queries'
    and cmd = 'SELECT'
    and 'authenticated' = any(roles)
    and qual = 'true';

  if offene_policy is not null then
    raise exception 'sniper_queries ist fuer alle Angemeldeten lesbar: %', offene_policy;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sniper_queries'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
      and qual like '%sniper_query_subscriptions%'
  ) then
    raise exception 'Keine Leserichtlinie auf sniper_queries, die an Abonnements haengt';
  end if;
end;
$$;

select pass('Abfragen sind nur fuer ihre Abonnenten sichtbar');

select * from finish();

rollback;
