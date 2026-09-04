\set ON_ERROR_STOP on

begin;

select plan(5);

-- Spalten von sniper_hits
do $$
declare
  required_columns text[] := array[
    'id', 'subscription_id', 'listing_id', 'reference_price',
    'discount_percent', 'created_at', 'notified_at'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'sniper_hits'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'sniper_hits is missing required columns: %', missing_columns;
  end if;
end;
$$;

select pass('sniper_hits besitzt alle benoetigten Spalten');

-- Derselbe Fund wird je Abonnement hoechstens einmal gemeldet.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sniper_hits'::regclass
      and contype = 'u'
      and array_length(conkey, 1) = 2
  ) then
    raise exception 'Eindeutigkeit ueber subscription_id und listing_id fehlt';
  end if;
end;
$$;

select pass('Derselbe Fund wird je Abonnement hoechstens einmal gemeldet');

-- RLS aktiv, angemeldete Nutzer duerfen nicht schreiben.
do $$
declare
  write_policies text[];
begin
  if not exists (
    select 1 from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public' and relname = 'sniper_hits' and relrowsecurity
  ) then
    raise exception 'row level security ist auf sniper_hits aus';
  end if;

  select array_agg(policyname order by policyname)
  into write_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'sniper_hits'
    and cmd <> 'SELECT' and 'authenticated' = any(roles);

  if write_policies is not null then
    raise exception 'authenticated darf nicht schreiben, gefunden: %', write_policies;
  end if;
end;
$$;

select pass('RLS ist aktiv und angemeldete Nutzer duerfen nur lesen');

-- anon darf auf der Trefferliste gar nichts.
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
    and table_name = 'sniper_hits'
    and grantee = 'anon';

  if anon_rechte is not null then
    raise exception 'anon haelt noch Rechte auf sniper_hits: %', anon_rechte;
  end if;
end;
$$;

select pass('anon hat keinerlei Rechte auf der Trefferliste');

-- authenticated darf genau lesen - nicht mehr.
do $$
declare
  rechte text[];
begin
  select array_agg(privilege_type order by privilege_type)
  into rechte
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'sniper_hits'
    and grantee = 'authenticated';

  if rechte is distinct from array['SELECT'] then
    raise exception 'authenticated soll genau SELECT haben, hat aber: %', rechte;
  end if;
end;
$$;

select pass('authenticated darf die Trefferliste genau lesen');

select * from finish();

rollback;
